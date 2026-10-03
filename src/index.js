require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "guilds.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let database = {};

if (fs.existsSync(dataFile)) {
  try {
    database = JSON.parse(
      fs.readFileSync(dataFile, "utf8")
    );
  } catch {
    database = {};
  }
}

function saveDatabase() {
  fs.writeFileSync(
    dataFile,
    JSON.stringify(database, null, 2)
  );
}

function getConfig(guildId) {
  if (!database[guildId]) {
    database[guildId] = {
      enabled: true,
      joinThreshold: 8,
      joinWindowSeconds: 10,
      lockdownMinutes: 10,
      lockdown: false,
      lockdownUntil: 0,
      logChannelId: null
    };

    saveDatabase();
  }

  return database[guildId];
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const joinHistory = new Map();

async function sendLog(guild, title, description) {
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
    .setTitle(`🛡️ ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: "AntiRaid Security"
    });

  await channel.send({
    embeds: [embed]
  }).catch(() => {});
}

async function lockdown(guild, reason) {
  const config = getConfig(guild.id);

  if (config.lockdown) {
    return;
  }

  config.lockdown = true;
  config.lockdownUntil =
    Date.now() +
    config.lockdownMinutes * 60 * 1000;

  saveDatabase();

  console.log(
    `🔒 Lockdown activated in ${guild.name}`
  );

  await sendLog(
    guild,
    "🚨 RAID DETECTED",
    `${reason}\n\n🔒 **Lockdown activated.**`
  );
}

async function unlock(guild, automatic = false) {
  const config = getConfig(guild.id);

  if (!config.lockdown) {
    return;
  }

  config.lockdown = false;
  config.lockdownUntil = 0;

  saveDatabase();

  console.log(
    `🔓 Lockdown ended in ${guild.name}`
  );

  await sendLog(
    guild,
    "🔓 LOCKDOWN ENDED",
    automatic
      ? "The automatic lockdown timer has expired."
      : "A server administrator ended the lockdown."
  );
}

client.once("ready", () => {
  console.log(
    `🛡️ AntiRaid is online as ${client.user.tag}`
  );

  console.log(
    `Serving ${client.guilds.cache.size} server(s).`
  );
});

client.on("guildMemberAdd", async member => {
  const guild = member.guild;
  const config = getConfig(guild.id);

  if (!config.enabled) {
    return;
  }

  const now = Date.now();

  const history =
    joinHistory.get(guild.id) || [];

  const recent = history.filter(
    timestamp =>
      now - timestamp <
      config.joinWindowSeconds * 1000
  );

  recent.push(now);

  joinHistory.set(guild.id, recent);

  console.log(
    `👤 ${member.user.tag} joined ${guild.name}`
  );

  if (
    recent.length >= config.joinThreshold &&
    !config.lockdown
  ) {
    await lockdown(
      guild,
      `**${recent.length} members joined within ${config.joinWindowSeconds} seconds.**`
    );
  }
});

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (!interaction.guild) {
      return interaction.reply({
        content:
          "❌ This command can only be used inside a server.",
        ephemeral: true
      });
    }

    const guild = interaction.guild;
    const config = getConfig(guild.id);

    const isAdmin =
      interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
      );

    if (interaction.commandName === "setup") {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "❌ You need **Manage Server** to use this command.",
          ephemeral: true
        });
      }

      config.enabled = true;

      saveDatabase();

      return interaction.reply({
        content:
          "🛡️ **AntiRaid has been set up!**\n\n" +
          "Protection: **Enabled**\n" +
          `Raid threshold: **${config.joinThreshold} joins / ${config.joinWindowSeconds} seconds**\n` +
          `Lockdown duration: **${config.lockdownMinutes} minutes**`
      });
    }

    if (interaction.commandName === "security") {
      const embed = new EmbedBuilder()
        .setTitle("🛡️ AntiRaid Security")
        .setDescription(
          config.enabled
            ? "Protection is **enabled**."
            : "Protection is **disabled**."
        )
        .addFields(
          {
            name: "Raid Detection",
            value:
              `${config.joinThreshold} joins / ${config.joinWindowSeconds}s`,
            inline: true
          },
          {
            name: "Lockdown",
            value: config.lockdown
              ? "🔴 ACTIVE"
              : "🟢 Inactive",
            inline: true
          },
          {
            name: "Logs",
            value: config.logChannelId
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

    if (
      interaction.commandName ===
      "raidstatus"
    ) {
      const now = Date.now();

      const history =
        joinHistory.get(guild.id) || [];

      const recent = history.filter(
        timestamp =>
          now - timestamp <
          config.joinWindowSeconds * 1000
      );

      return interaction.reply({
        content:
          "🛡️ **Raid Status**\n\n" +
          `Recent joins: **${recent.length}/${config.joinThreshold}**\n` +
          `Lockdown: **${config.lockdown ? "ACTIVE" : "Inactive"}**\n` +
          `Protection: **${config.enabled ? "Enabled" : "Disabled"}**`
      });
    }

    if (
      [
        "lockdown",
        "unlock",
        "logs"
      ].includes(interaction.commandName) &&
      !isAdmin
    ) {
      return interaction.reply({
        content:
          "❌ You need **Manage Server** to use this command.",
        ephemeral: true
      });
    }

    if (
      interaction.commandName ===
      "lockdown"
    ) {
      await lockdown(
        guild,
        `Manual lockdown activated by **${interaction.user.tag}**.`
      );

      return interaction.reply({
        content:
          "🔒 **AntiRaid lockdown activated.**"
      });
    }

    if (
      interaction.commandName ===
      "unlock"
    ) {
      await unlock(guild, false);

      return interaction.reply({
        content:
          "🔓 **AntiRaid lockdown ended.**"
      });
    }

    if (
      interaction.commandName ===
      "logs"
    ) {
      const subcommand =
        interaction.options.getSubcommand();

      if (subcommand === "view") {
        return interaction.reply({
          content:
            config.logChannelId
              ? `📋 Security logs: <#${config.logChannelId}>`
              : "📋 Security logging is currently disabled."
        });
      }

      if (subcommand === "set") {
        config.logChannelId =
          interaction.channelId;

        saveDatabase();

        return interaction.reply({
          content:
            `📋 Security logs are now being sent to <#${interaction.channelId}>.`
        });
      }

      if (subcommand === "disable") {
        config.logChannelId = null;

        saveDatabase();

        return interaction.reply({
          content:
            "📋 Security logging has been disabled."
        });
      }
    }

    return interaction.reply({
      content:
        "❓ Unknown AntiRaid command.",
      ephemeral: true
    });
  }
);

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
      await unlock(guild, true);
    }
  }
}, 15000);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled promise rejection:",
      error
    );
  }
);

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "❌ DISCORD_TOKEN is missing."
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
