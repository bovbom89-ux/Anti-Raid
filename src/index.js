require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "guilds.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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

const DEFAULT_CONFIG = {
  enabled: true,
  joinThreshold: 8,
  joinWindowSeconds: 10,
  lockdownMinutes: 10,
  logChannelId: null,
  lockdown: false,
  lockdownUntil: 0
};

function getConfig(guildId) {
  if (!database[guildId]) {
    database[guildId] = {
      ...DEFAULT_CONFIG
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

  const channel =
    guild.channels.cache.get(
      config.logChannelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: "AntiRaid Security"
    });

  await channel
    .send({
      embeds: [embed]
    })
    .catch(() => {});
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
    config.lockdownMinutes *
      60 *
      1000;

  saveDatabase();

  await securityLog(
    guild,
    "🚨 RAID DETECTED",
    `${reason}\n\n🔒 **Automatic lockdown activated.**`
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

  await securityLog(
    guild,
    "🔓 LOCKDOWN ENDED",
    automatic
      ? "The automatic lockdown timer has expired."
      : "A server administrator ended the lockdown."
  );

  console.log(
    `Lockdown ended in ${guild.name}`
  );
}

/* =========================
   LOCKDOWN TIMER
========================= */

setInterval(
  async () => {
    const now = Date.now();

    for (
      const guild of client.guilds.cache.values()
    ) {
      const config =
        getConfig(guild.id);

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
  },
  15000
);

/* =========================
   BOT READY
========================= */

client.once(
  "ready",
  () => {
    console.log(
      `🛡️ AntiRaid is online as ${client.user.tag}`
    );

    console.log(
      `Serving ${client.guilds.cache.size} server(s).`
    );
  }
);

/* =========================
   MEMBER JOIN DETECTION
========================= */

client.on(
  "guildMemberAdd",
  async member => {
    const guild = member.guild;

    const config =
      getConfig(guild.id);

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
        `**${recent.length} members joined within ${config.joinWindowSeconds} seconds.**`
      );
    }

    if (config.lockdown) {
      await securityLog(
        guild,
        "MEMBER JOINED DURING LOCKDOWN",
        `**${member.user.tag}** joined while AntiRaid lockdown was active.`
      );
    }
  }
);

/* =========================
   SLASH COMMANDS
========================= */

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    if (!interaction.guild) {
      return interaction.reply({
        content:
          "❌ This command can only be used inside a server.",
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

    /*
     * /setup
     */

    if (
      interaction.commandName ===
      "setup"
    ) {
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

    /*
     * /security
     */

    if (
      interaction.commandName ===
      "security"
    ) {
      const embed =
        new EmbedBuilder()
          .setTitle(
            "🛡️ AntiRaid Security"
          )
          .setDescription(
            config.enabled
              ? "Protection is **enabled**."
              : "Protection is **disabled**."
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
                  ? "🔴 ACTIVE"
                  : "🟢 Inactive",
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

    /*
     * /
