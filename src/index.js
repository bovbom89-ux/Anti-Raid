require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  REST,
  Routes
} = require("discord.js");

const commands = require("./deploy-commands");

/* =========================
   RENDER WEB SERVICE
========================= */

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("AntiRaid is online.");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AntiRaid web server listening on port ${PORT}`);
});

/* =========================
   DATABASE
========================= */

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "guilds.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

function loadDatabase() {
  try {
    return JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch {
    return {};
  }
}

const database = loadDatabase();

function saveDatabase() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(database, null, 2)
  );
}

/* =========================
   CONFIGURATION
========================= */

const DEFAULT_CONFIG = {
  enabled: true,
  joinThreshold: 8,
  joinWindowSeconds: 10,
  lockdownMinutes: 10,

  logChannelId: null,

  lockdown: false,
  lockdownUntil: 0,

  honeypotChannelId: null,
  honeypotMessageId: null,
  honeypotKicks: 0,

  verifyRoleId: null,
  verifyMessageId: null,

  warnings: {}
};

function getConfig(guildId) {
  if (!database[guildId]) {
    database[guildId] = {
      ...DEFAULT_CONFIG,
      warnings: {}
    };

    saveDatabase();
  }

  const config = database[guildId];

  if (!config.warnings) {
    config.warnings = {};
  }

  if (!Object.prototype.hasOwnProperty.call(
    config,
    "honeypotChannelId"
  )) {
    config.honeypotChannelId = null;
  }

  if (!Object.prototype.hasOwnProperty.call(
    config,
    "honeypotMessageId"
  )) {
    config.honeypotMessageId = null;
  }

  if (!Object.prototype.hasOwnProperty.call(
    config,
    "honeypotKicks"
  )) {
    config.honeypotKicks = 0;
  }

  if (!Object.prototype.hasOwnProperty.call(
    config,
    "verifyRoleId"
  )) {
    config.verifyRoleId = null;
  }

  if (!Object.prototype.hasOwnProperty.call(
    config,
    "verifyMessageId"
  )) {
    config.verifyMessageId = null;
  }

  return config;
}

/* =========================
   CONSTANTS
========================= */

const EMBED_COLOR = "#1F71AD";

const joinHistory = new Map();

const verificationCodes = new Map();

/* =========================
   DISCORD CLIENT
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* =========================
   SECURITY LOGGING
========================= */

async function securityLog(
  guild,
  title,
  description
) {
  const config = getConfig(guild.id);

  if (!config.logChannelId) {
    return;
  }

  const channel = guild.channels.cache.get(
    config.logChannelId
  );

  if (!channel || !channel.isTextBased()) {
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: "AntiRaid Security"
    });

  await channel.send({
    embeds: [embed]
  }).catch(() => {});
}

/* =========================
   LOCKDOWN
========================= */

async function startLockdown(
  guild,
  reason
) {
  const config = getConfig(guild.id);

  if (config.lockdown) {
    return;
  }

  config.lockdown = true;

  config.lockdownUntil =
    Date.now() +
    config.lockdownMinutes * 60 * 1000;

  saveDatabase();

  await lockServer(guild);

  await securityLog(
    guild,
    "Raid Detected",
    `${reason}\n\nServer lockdown has been automatically activated.`
  );

  console.log(
    `Lockdown activated in ${guild.name}`
  );
}

async function endLockdown(
  guild,
  automatic = true
) {
  const config = getConfig(guild.id);

  if (!config.lockdown) {
    return;
  }

  config.lockdown = false;
  config.lockdownUntil = 0;

  saveDatabase();

  await unlockServer(guild);

  await securityLog(
    guild,
    "Lockdown Ended",
    automatic
      ? "The automatic lockdown timer has expired."
      : "A server administrator ended the lockdown."
  );

  console.log(
    `Lockdown ended in ${guild.name}`
  );
}

/* =========================
   SERVER LOCK
========================= */

async function lockServer(guild) {
  const channels =
    guild.channels.cache.filter(
      channel =>
        channel.isTextBased() &&
        channel.permissionsFor(
          guild.roles.everyone
        )?.has(
          PermissionFlagsBits.SendMessages
        )
    );

  for (
    const channel of channels.values()
  ) {
    await channel.permissionOverwrites
      .edit(
        guild.roles.everyone,
        {
          SendMessages: false
        }
      )
      .catch(() => {});
  }
}

async function unlockServer(guild) {
  const channels =
    guild.channels.cache.filter(
      channel =>
        channel.isTextBased()
    );

  for (
    const channel of channels.values()
  ) {
    await channel.permissionOverwrites
      .edit(
        guild.roles.everyone,
        {
          SendMessages: null
        }
      )
      .catch(() => {});
  }
}

/* =========================
   LOCKDOWN TIMER
========================= */

setInterval(async () => {
  const now = Date.now();

  for (
    const guild of client.guilds.cache.values()
  ) {
    const config = getConfig(guild.id);

    if (
      config.lockdown &&
      config.lockdownUntil &&
      now >= config.lockdownUntil
    ) {
      await endLockdown(
        guild,
        true
      );
    }
  }
}, 15000);

/* =========================
   HONEYPOT
========================= */

function createHoneypotEmbed(
  kickCount
) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("Do Not Talk Here")
    .setDescription(
      "This channel is protected by AntiRaid.\n\n" +
      "Please do not send messages in this channel.\n\n" +
      "Messages sent here may result in automatic removal and disciplinary action."
    )
    .setTimestamp()
    .setFooter({
      text: "AntiRaid Security"
    });
}

function createHoneypotButtons(
  kickCount
) {
  const button =
    new ButtonBuilder()
      .setCustomId(
        "honeypot_kick_counter"
      )
      .setLabel(
        `Kicks: ${kickCount}`
      )
      .setStyle(
        ButtonStyle.Secondary
      )
      .setDisabled(true);

  return new ActionRowBuilder()
    .addComponents(button);
}

async function updateHoneypotMessage(
  guild
) {
  const config = getConfig(guild.id);

  if (
    !config.honeypotChannelId ||
    !config.honeypotMessageId
  ) {
    return;
  }

  const channel =
    guild.channels.cache.get(
      config.honeypotChannelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return;
  }

  const message =
    await channel.messages.fetch(
      config.honeypotMessageId
    ).catch(() => null);

  if (!message) {
    return;
  }

  await message.edit({
    embeds: [
      createHoneypotEmbed(
        config.honeypotKicks
      )
    ],
    components: [
      createHoneypotButtons(
        config.honeypotKicks
      )
    ]
  }).catch(() => {});
}

/* =========================
   VERIFICATION
========================= */

function generateVerificationCode() {
  return Math.floor(
    100000 +
    Math.random() * 900000
  ).toString();
}

function createVerificationEmbed() {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("Server Verification")
    .setDescription(
      "Click the button below to begin verification.\n\n" +
      "You will receive a verification code. " +
      "Enter the code to receive the Verified role."
    )
    .setFooter({
      text: "AntiRaid Verification"
    });
}

function createVerificationButtons() {
  const button =
    new ButtonBuilder()
      .setCustomId(
        "start_verification"
      )
      .setLabel("Verify")
      .setStyle(
        ButtonStyle.Primary
      );

  return new ActionRowBuilder()
    .addComponents(button);
}

function createEnterCodeButton() {
  const button =
    new ButtonBuilder()
      .setCustomId(
        "enter_verification_code"
      )
      .setLabel("Enter Code")
      .setStyle(
        ButtonStyle.Primary
      );

  return new ActionRowBuilder()
    .addComponents(button);
}

/* =========================
   READY
========================= */

client.once(
  "ready",
  async () => {
    console.log(
      `AntiRaid is online as ${client.user.tag}`
    );

    console.log(
      `Serving ${client.guilds.cache.size} server(s).`
    );

    try {
      const rest =
        new REST({
          version: "10"
        }).setToken(
          process.env.DISCORD_TOKEN
        );

      console.log(
        "Registering slash commands..."
      );

      await rest.put(
        Routes.applicationCommands(
          process.env.DISCORD_CLIENT_ID
        ),
        {
          body: commands
        }
      );

      console.log(
        `${commands.length} slash commands registered.`
      );
    } catch (error) {
      console.error(
        "Failed to register slash commands:"
      );

      console.error(error);
    }
  }
);

/* =========================
   MEMBER JOIN DETECTION
========================= */

client.on(
  "guildMemberAdd",
  async member => {
    const guild = member.guild;
    const config = getConfig(guild.id);

    if (!config.enabled) {
      return;
    }

    const now = Date.now();

    const previous =
      joinHistory.get(
        guild.id
      ) || [];

    const recent =
      previous.filter(
        timestamp =>
          now - timestamp <
          config.joinWindowSeconds *
          1000
      );

    recent.push(now);

    joinHistory.set(
      guild.id,
      recent
    );

    console.log(
      `${member.user.tag} joined ${guild.name}`
    );

    if (
      recent.length >=
      config.joinThreshold &&
      !config.lockdown
    ) {
      await startLockdown(
        guild,
        `${recent.length} members joined within ${config.joinWindowSeconds} seconds.`
      );
    }

    if (config.lockdown) {
      await securityLog(
        guild,
        "Member Joined During Lockdown",
        `User ${member.user.tag} joined while AntiRaid lockdown was active.`
      );
    }
  }
);

/* =========================
   HONEYPOT MESSAGE DETECTION
========================= */

client.on(
  "messageCreate",
  async message => {
    if (!message.guild) {
      return;
    }

    if (message.author.bot) {
      return;
    }

    const guild = message.guild;
    const config = getConfig(guild.id);

    if (
      !config.honeypotChannelId
    ) {
      return;
    }

    if (
      message.channel.id !==
      config.honeypotChannelId
    ) {
      return;
    }

    const member =
      message.member;

    if (!member) {
      return;
    }

    if (
      member.permissions.has(
        PermissionFlagsBits.ManageGuild
      )
    ) {
      return;
    }

    await message.delete()
      .catch(() => {});

    let kicked = false;

    if (member.kickable) {
      kicked =
        await member
          .kick(
            "AntiRaid honeypot triggered."
          )
          .then(
            () => true,
            () => false
          );
    }

    if (kicked) {
      config.honeypotKicks++;

      saveDatabase();

      await updateHoneypotMessage(
        guild
      );

      await securityLog(
        guild,
        "Honeypot Triggered",
        `User: <@${member.id}>\n` +
        `User ID: ${member.id}\n` +
        `Channel: <#${message.channel.id}>\n\n` +
        "The message was deleted and the member was kicked."
      );

      console.log(
        `Honeypot kick: ${member.user.tag}`
      );
    } else {
      await securityLog(
        guild,
        "Honeypot Triggered",
        `User: <@${member.id}>\n` +
        `User ID: ${member.id}\n` +
        `Channel: <#${message.channel.id}>\n\n` +
        "The message was deleted, but the member could not be kicked."
      );
    }
  }
);

/* =========================
   INTERACTIONS
========================= */

client.on(
  "interactionCreate",
  async interaction => {

    /* =========================
       VERIFY BUTTON
    ========================= */

    if (
      interaction.isButton() &&
      interaction.customId ===
      "start_verification"
    ) {
      const guild =
        interaction.guild;

      if (!guild) {
        return interaction.reply({
          content:
            "Verification can only be used inside a server.",
          ephemeral: true
        });
      }

      const config =
        getConfig(guild.id);

      if (!config.verifyRoleId) {
        return interaction.reply({
          content:
            "Verification has not been configured by the server administrators.",
          ephemeral: true
        });
      }

      const role =
        guild.roles.cache.get(
          config.verifyRoleId
        );

      if (!role) {
        return interaction.reply({
          content:
            "The configured Verified role could not be found.",
          ephemeral: true
        });
      }

      if (
        interaction.member.roles.cache.has(
          role.id
        )
      ) {
        return interaction.reply({
          content:
            "You are already verified.",
          ephemeral: true
        });
      }

      const code =
        generateVerificationCode();

      verificationCodes.set(
        `${guild.id}:${interaction.user.id}`,
        {
          code,
          expires:
            Date.now() +
            5 * 60 * 1000
        }
      );

      return interaction.reply({
        content:
          `Your verification code is:\n\n**${code}**\n\n` +
          "This code expires in 5 minutes.\n\n" +
          "Press Enter Code below to continue.",
        components: [
          createEnterCodeButton()
        ],
        ephemeral: true
      });
    }

    /* =========================
       ENTER CODE BUTTON
    ========================= */

    if (
      interaction.isButton() &&
      interaction.customId ===
      "enter_verification_code"
    ) {
      const modal =
        new ModalBuilder()
          .setCustomId(
            "verification_code_modal"
          )
          .setTitle(
            "Verification"
          );

      const input =
        new TextInputBuilder()
          .setCustomId(
            "verification_code"
          )
          .setLabel(
            "Enter your verification code"
          )
          .setPlaceholder(
            "Enter the 6-digit code"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setMinLength(6)
          .setMaxLength(6)
          .setRequired(true);

      const row =
        new ActionRowBuilder()
          .addComponents(input);

      modal.addComponents(row);

      return interaction.showModal(
        modal
      );
    }

    /* =========================
       VERIFICATION MODAL
    ========================= */

    if (
      interaction.isModalSubmit() &&
      interaction.customId ===
      "verification_code_modal"
    ) {
      const guild =
        interaction.guild;

      if (!guild) {
        return interaction.reply({
          content:
            "Verification can only be used inside a server.",
          ephemeral: true
        });
      }

      const config =
        getConfig(guild.id);

      const enteredCode =
        interaction.fields
          .getTextInputValue(
            "verification_code"
          )
          .trim();

      const key =
        `${guild.id}:${interaction.user.id}`;

      const stored =
        verificationCodes.get(key);

      if (!stored) {
        return interaction.reply({
          content:
            "You do not have an active verification code. Please press Verify again.",
          ephemeral: true
        });
      }

      if (
        Date.now() >
        stored.expires
      ) {
        verificationCodes.delete(key);

        return interaction.reply({
          content:
            "Your verification code has expired. Please press Verify again.",
          ephemeral: true
        });
      }

      if (
        enteredCode !==
        stored.code
      ) {
        return interaction.reply({
          content:
            "That verification code is incorrect.",
          ephemeral: true
        });
      }

      const role =
        guild.roles.cache.get(
          config.verifyRoleId
        );

      if (!role) {
        return interaction.reply({
          content:
            "The Verified role could not be found.",
          ephemeral: true
        });
      }

      const member =
        await guild.members.fetch(
          interaction.user.id
        ).catch(
          () => null
        );

      if (!member) {
        return interaction.reply({
          content:
            "Your server member information could not be found.",
          ephemeral: true
        });
      }

      if (!role.editable) {
        return interaction.reply({
          content:
            "AntiRaid cannot give you the Verified role. Make sure the bot role is above the Verified role.",
          ephemeral: true
        });
      }

      await member.roles.add(
        role,
        "AntiRaid verification"
      );

      verificationCodes.delete(key);

      await securityLog(
        guild,
        "Member Verified",
        `<@${interaction.user.id}> successfully completed verification.`
      );

      return interaction.reply({
        content:
          "Verification successful. You have been given the Verified role.",
        ephemeral: true
      });
    }

    /* =========================
       SLASH COMMAND CHECK
    ========================= */

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    if (!interaction.guild) {
      return interaction.reply({
        content:
          "This command can only be used inside a server.",
        ephemeral: true
      });
    }

    const guild =
      interaction.guild;

    const config =
      getConfig(guild.id);

    const isAdmin =
      interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
      );

    /* =========================
       /setup
    ========================= */

    if (
      interaction.commandName ===
      "setup"
    ) {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "You need Manage Server to use this command.",
          ephemeral: true
        });
      }

      config.enabled = true;

      saveDatabase();

      return interaction.reply({
        content:
          "AntiRaid has been set up.\n\n" +
          "Protection: Enabled\n" +
          `Raid threshold: ${config.joinThreshold} joins / ${config.joinWindowSeconds} seconds\n` +
          `Lockdown duration: ${config.lockdownMinutes} minutes`
      });
    }

    /* =========================
       /security
    ========================= */

    if (
      interaction.commandName ===
      "security"
    ) {
      const embed =
        new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle(
            "AntiRaid Security"
          )
          .setDescription(
            config.enabled
              ? "Protection is enabled."
              : "Protection is disabled."
          )
          .addFields(
            {
              name:
                "Raid Detection",
              value:
                `${config.joinThreshold} joins / ${config.joinWindowSeconds}s`,
              inline: true
            },
            {
              name:
                "Lockdown",
              value:
                config.lockdown
                  ? "Active"
                  : "Inactive",
              inline: true
            },
            {
              name:
                "Honeypot",
              value:
                config.honeypotChannelId
                  ? `<#${config.honeypotChannelId}>`
                  : "Not configured",
              inline: true
            },
            {
              name:
                "Honeypot Kicks",
              value:
                `${config.honeypotKicks}`,
              inline: true
            },
            {
              name:
                "Verified Role",
              value:
                config.verifyRoleId
                  ? `<@&${config.verifyRoleId}>`
                  : "Not configured",
              inline: true
            },
            {
              name:
                "Logs",
              value:
                config.logChannelId
                  ? `<#${config.logChannelId}>`
                  : "Not configured",
              inline: true
            }
          )
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    /* =========================
       /verify
    ========================= */

    if (
      interaction.commandName ===
      "verify"
    ) {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "You need Manage Server permission.",
          ephemeral: true
        });
      }

      if (!config.verifyRoleId) {
        return interaction.reply({
          content:
            "Please configure the Verified role first using /setverify.",
          ephemeral: true
        });
      }

      const role =
        guild.roles.cache.get(
          config.verifyRoleId
        );

      if (!role) {
        return interaction.reply({
          content:
            "The configured Verified role no longer exists.",
          ephemeral: true
        });
      }

      const message =
        await interaction.channel.send({
          embeds: [
            createVerificationEmbed()
          ],
          components: [
            createVerificationButtons()
          ]
        });

      config.verifyMessageId =
        message.id;

      saveDatabase();

      return interaction.reply({
        content:
          "The verification panel has been sent.",
        ephemeral: true
      });
    }

    /* =========================
       /setverify
    ========================= */

    if (
      interaction.commandName ===
      "setverify"
    ) {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "You need Manage Server permission.",
          ephemeral: true
        });
      }

      const role =
        interaction.options.getRole(
          "role"
        );

      if (
        role.id ===
        guild.roles.everyone.id
      ) {
        return interaction.reply({
          content:
            "You cannot use @everyone as the Verified role.",
          ephemeral: true
        });
      }

      if (!role.editable) {
        return interaction.reply({
          content:
            "AntiRaid cannot assign this role. Move the AntiRaid bot role above the Verified role.",
          ephemeral: true
        });
      }

      config.verifyRoleId =
        role.id;

      saveDatabase();

      return interaction.reply({
        content:
          `The Verified role has been set to ${role}.`
      });
    }

    /* =========================
       /honeypot
    ========================= */

    if (
      interaction.commandName ===
      "honeypot"
    ) {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "You need Manage Server permission.",
          ephemeral: true
        });
      }

      const action =
        interaction.options.getString(
          "action"
        );

      if (
        action ===
        "enable"
      ) {
        const channel =
          interaction.options.getChannel(
            "channel"
          );

        if (!channel) {
          return interaction.reply({
            content:
              "You must select a channel when enabling the honeypot.",
            ephemeral: true
          });
        }

        config.honeypotChannelId =
          channel.id;

        config.honeypotKicks = 0;
        config.honeypotMessageId =
          null;

        saveDatabase();

        const message =
          await channel.send({
            embeds: [
              createHoneypotEmbed(0)
            ],
            components: [
              createHoneypotButtons(0)
            ]
          }).catch(
            () => null
          );

        if (message) {
          config.honeypotMessageId =
            message.id;

          saveDatabase();
        }

        return interaction.reply({
          content:
            `The honeypot has been enabled in ${channel}.`
        });
      }

      if (
        action ===
        "disable"
      ) {
        if (
          !config.honeypotChannelId
        ) {
          return interaction.reply({
            content:
              "The honeypot is not currently enabled.",
            ephemeral: true
          });
        }

        const oldChannel =
          guild.channels.cache.get(
            config.honeypotChannelId
          );

        if (
          oldChannel &&
          oldChannel.isTextBased() &&
          config.honeypotMessageId
        ) {
          const oldMessage =
            await oldChannel.messages
              .fetch(
                config.honeypotMessageId
              )
              .catch(
                () => null
              );

          if (oldMessage) {
            await oldMessage.delete()
              .catch(() => {});
          }
        }

        config.honeypotChannelId =
          null;

        config.honeypotMessageId =
          null;

        saveDatabase();

        return interaction.reply({
          content:
            "The honeypot has been disabled."
        });
      }
    }

    /* =========================
       /lockdown
    ========================= */

    if (
      interaction.commandName ===
      "lockdown"
    ) {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "You need Manage Server permission.",
          ephemeral: true
        });
      }

      if (config.lockdown) {
        return interaction.reply({
          content:
            "The server is already in lockdown.",
          ephemeral: true
        });
      }

      await startLockdown(
        guild,
        `Lockdown manually activated by ${interaction.user.tag}.`
      );

      return interaction.reply({
        content:
          "Server lockdown activated."
      });
    }

    /* =========================
       /unlock
    ========================= */

    if (
      interaction.commandName ===
      "unlock"
    ) {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "You need Manage Server permission.",
          ephemeral: true
        });
      }

      await endLockdown(
        guild,
        false
      );

      return interaction.reply({
        content:
          "Server lockdown ended."
      });
    }

    /* =========================
       /raidmode
    ========================= */

    if (
      interaction.commandName ===
      "raidmode"
    ) {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "You need Manage Server permission.",
          ephemeral: true
        });
      }

      const enabled =
        interaction.options.getBoolean(
          "enabled"
        );

      config.enabled =
        enabled;

      saveDatabase();

      return interaction.reply({
        content:
          enabled
            ? "Raid protection has been enabled."
            : "Raid protection has been disabled."
      });
    }

    /* =========================
       /kick
    ========================= */

    if (
      interaction.commandName ===
      "kick"
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.KickMembers
        )
      ) {
        return interaction.reply({
          content:
            "You need Kick Members permission.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "user"
        );

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
        "No reason provided.";

      const member =
        await guild.members.fetch(
          user.id
        ).catch(
          () => null
        );

      if (!member) {
        return interaction.reply({
          content:
            "That user is not in this server.",
          ephemeral: true
        });
      }

      if (!member.kickable) {
        return interaction.reply({
          content:
            "I cannot kick that member. Check my role position and permissions.",
          ephemeral: true
        });
      }

      await member.kick(
        reason
      );

      return interaction.reply({
        content:
          `${user.tag} has been kicked.\nReason: ${reason}`
      });
    }

    /* =========================
       /ban
    ========================= */

    if (
      interaction.commandName ===
      "ban"
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.BanMembers
        )
      ) {
        return interaction.reply({
          content:
            "You need Ban Members permission.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "user"
        );

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
        "No reason provided.";

      const member =
        await guild.members.fetch(
          user.id
        ).catch(
          () => null
        );

      if (
        member &&
        !member.bannable
      ) {
        return interaction.reply({
          content:
            "I cannot ban that member. Check my role position and permissions.",
          ephemeral: true
        });
      }

      await guild.members.ban(
        user.id,
        {
          reason
        }
      );

      return interaction.reply({
        content:
          `${user.tag} has been banned.\nReason: ${reason}`
      });
    }

    /* =========================
       /unban
    ========================= */

    if (
      interaction.commandName ===
      "unban"
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.BanMembers
        )
      ) {
        return interaction.reply({
          content:
            "You need Ban Members permission.",
          ephemeral: true
        });
      }

      const userId =
        interaction.options.getString(
          "user"
        );

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
        "No reason provided.";

      if (
        !/^\d{17,20}$/.test(
          userId
        )
      ) {
        return interaction.reply({
          content:
            "Please provide a valid Discord user ID.",
          ephemeral: true
        });
      }

      const ban =
        await guild.bans.fetch(
          userId
        ).catch(
          () => null
        );

      if (!ban) {
        return interaction.reply({
          content:
            "That user is not currently banned.",
          ephemeral: true
        });
      }

      await guild.members.unban(
        userId,
        reason
      );

      await securityLog(
        guild,
        "Member Unbanned",
        `User ID: ${userId}\nModerator: <@${interaction.user.id}>\nReason: ${reason}`
      );

      return interaction.reply({
        content:
          `User ${userId} has been unbanned.\nReason: ${reason}`
      });
    }

    /* =========================
       /timeout
    ========================= */

    if (
      interaction.commandName ===
      "timeout"
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ModerateMembers
        )
      ) {
        return interaction.reply({
          content:
            "You need Moderate Members permission.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "user"
        );

      const minutes =
        interaction.options.getInteger(
          "minutes"
        );

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
        "No reason provided.";

      const member =
        await guild.members.fetch(
          user.id
        ).catch(
          () => null
        );

      if (!member) {
        return interaction.reply({
          content:
            "That user is not in this server.",
          ephemeral: true
        });
      }

      if (!member.moderatable) {
        return interaction.reply({
          content:
            "I cannot timeout that member.",
          ephemeral: true
        });
      }

      await member.timeout(
        minutes * 60 * 1000,
        reason
      );

      return interaction.reply({
        content:
          `${user.tag} has been timed out for ${minutes} minutes.\nReason: ${reason}`
      });
    }

    /* =========================
       /untimeout
    ========================= */

    if (
      interaction.commandName ===
      "untimeout"
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ModerateMembers
        )
      ) {
        return interaction.reply({
          content:
            "You need Moderate Members permission.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "user"
        );

      const member =
        await guild.members.fetch(
          user.id
        ).catch(
          () => null
        );

      if (!member) {
        return interaction.reply({
          content:
            "That user is not in this server.",
          ephemeral: true
        });
      }

      await member.timeout(null);

      return interaction.reply({
        content:
          `${user.tag} is no longer timed out.`
      });
    }

    /* =========================
       /warn
    ========================= */

    if (
      interaction.commandName ===
      "warn"
    ) {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "You need Manage Server permission.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "user"
        );

      const reason =
        interaction.options.getString(
          "reason"
        ) ||
        "No reason provided.";

      if (
        !config.warnings[
          user.id
        ]
      ) {
        config.warnings[
          user.id
        ] = [];
      }

      config.warnings[
        user.id
      ].push({
        reason,
        moderator:
          interaction.user.tag,
        timestamp:
          Date.now()
      });

      saveDatabase();

      return interaction.reply({
        content:
          `${user.tag} has been warned.\nReason: ${reason}`
      });
    }

    /* =========================
       /warnings
    ========================= */

    if (
      interaction.commandName ===
      "warnings"
    ) {
      const user =
        interaction.options.getUser(
          "user"
        );

      const warnings =
        config.warnings[
          user.id
        ] || [];

      if (
        warnings.length === 0
      ) {
        return interaction.reply({
          content:
            `${user.tag} has no warnings.`
        });
      }

      const description =
        warnings
          .map(
            (warning, index) =>
              `**${index + 1}.** ${warning.reason}\nModerator: ${warning.moderator}`
          )
          .join("\n\n");

      const embed =
        new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle(
            `Warnings — ${user.tag}`
          )
          .setDescription(
            description
          )
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    /* =========================
       /clear
    ========================= */

    if (
      interaction.commandName ===
      "clear"
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageMessages
        )
      ) {
        return interaction.reply({
          content:
            "You need Manage Messages permission.",
          ephemeral: true
        });
      }

      const amount =
        interaction.options.getInteger(
          "amount"
        );

      const deleted =
        await interaction.channel.bulkDelete(
          amount,
          true
        );

      return interaction.reply({
        content:
          `Deleted ${deleted.size} messages.`,
        ephemeral: true
      });
    }

    /* =========================
       /slowmode
    ========================= */

    if (
      interaction.commandName ===
      "slowmode"
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageChannels
        )
      ) {
        return interaction.reply({
          content:
            "You need Manage Channels permission.",
          ephemeral: true
        });
      }

      const seconds =
        interaction.options.getInteger(
          "seconds"
        );

      await interaction.channel
        .setRateLimitPerUser(
          seconds
        );

      return interaction.reply({
        content:
          seconds === 0
            ? "Slowmode has been disabled."
            : `Slowmode set to ${seconds} seconds.`
      });
    }

    /* =========================
       /lock
    ========================= */

    if (
      interaction.commandName ===
      "lock"
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageChannels
        )
      ) {
        return interaction.reply({
          content:
            "You need Manage Channels permission.",
          ephemeral: true
        });
      }

      await interaction.channel
        .permissionOverwrites
        .edit(
          guild.roles.everyone,
          {
            SendMessages: false
          }
        );

      return interaction.reply({
        content:
          "This channel has been locked."
      });
    }

    /* =========================
       /unlockchannel
    ========================= */

    if (
      interaction.commandName ===
      "unlockchannel"
    ) {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageChannels
        )
      ) {
        return interaction.reply({
          content:
            "You need Manage Channels permission.",
          ephemeral: true
        });
      }

      await interaction.channel
        .permissionOverwrites
        .edit(
          guild.roles.everyone,
          {
            SendMessages: null
          }
        );

      return interaction.reply({
        content:
          "This channel has been unlocked."
      });
    }

    /* =========================
       /setlogchannel
    ========================= */

    if (
      interaction.commandName ===
      "setlogchannel"
    ) {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "You need Manage Server permission.",
          ephemeral: true
        });
      }

      const channel =
        interaction.options.getChannel(
          "channel"
        );

      config.logChannelId =
        channel.id;

      saveDatabase();

      return interaction.reply({
        content:
          `Security logs will now be sent to ${channel}.`
      });
    }

    /* =========================
       /serverinfo
    ========================= */

    if (
      interaction.commandName ===
      "serverinfo"
    ) {
      const embed =
        new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle(
            guild.name
          )
          .addFields(
            {
              name: "Owner",
              value:
                `<@${guild.ownerId}>`,
              inline: true
            },
            {
              name: "Members",
              value:
                `${guild.memberCount}`,
              inline: true
            },
            {
              name: "Channels",
              value:
                `${guild.channels.cache.size}`,
              inline: true
            },
            {
              name: "Created",
              value:
                `<t:${Math.floor(
                  guild.createdTimestamp /
                  1000
                )}:F>`,
              inline: false
            }
          )
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    /* =========================
       /userinfo
    ========================= */

    if (
      interaction.commandName ===
      "userinfo"
    ) {
      const user =
        interaction.options.getUser(
          "user"
        ) ||
        interaction.user;

      const member =
        await guild.members.fetch(
          user.id
        ).catch(
          () => null
        );

      const embed =
        new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle(
            user.tag
          )
          .setThumbnail(
            user.displayAvatarURL()
          )
          .addFields(
            {
              name:
                "User ID",
              value:
                user.id,
              inline: false
            },
            {
              name:
                "Account Created",
              value:
                `<t:${Math.floor(
                  user.createdTimestamp /
                  1000
                )}:F>`,
              inline: false
            }
          )
          .setTimestamp();

      if (member) {
        embed.addFields({
          name:
            "Joined Server",
          value:
            `<t:${Math.floor(
              member.joinedTimestamp /
              1000
            )}:F>`,
          inline: false
        });
      }

      return interaction.reply({
        embeds: [embed]
      });
    }
  }
);

/* =========================
   LOGIN
========================= */

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "DISCORD_TOKEN is missing."
  );

  process.exit(1);
}

if (!process.env.DISCORD_CLIENT_ID) {
  console.error(
    "DISCORD_CLIENT_ID is missing."
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
