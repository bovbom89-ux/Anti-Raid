require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

/* =========================================================
   DATABASE
========================================================= */

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "guilds.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {};
    }

    return JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch (error) {
    console.error("❌ Database load error:", error);
    return {};
  }
}

const database = loadDatabase();

function saveDatabase() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(database, null, 2)
    );
  } catch (error) {
    console.error("❌ Database save error:", error);
  }
}

const DEFAULT_CONFIG = {
  enabled: true,
  joinThreshold: 8,
  joinWindowSeconds: 10,
  lockdownMinutes: 10,
  logChannelId: null,
  lockdown: false,
  lockdownUntil: 0,
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

  if (!database[guildId].warnings) {
    database[guildId].warnings = {};
  }

  return database[guildId];
}

/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const joinHistory = new Map();

/* =========================================================
   LOGGING
========================================================= */

async function securityLog(
  guild,
  title,
  description
) {
  const config = getConfig(guild.id);

  if (!config.logChannelId) return;

  const channel = guild.channels.cache.get(
    config.logChannelId
  );

  if (!channel || !channel.isTextBased()) return;

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

/* =========================================================
   SERVER LOCKDOWN
========================================================= */

async function lockServer(
  guild,
  reason = "Manual lockdown"
) {
  const config = getConfig(guild.id);

  config.lockdown = true;

  config.lockdownUntil =
    Date.now() +
    config.lockdownMinutes * 60 * 1000;

  saveDatabase();

  let locked = 0;

  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased()) continue;

    try {
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: false,
          AddReactions: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false
        },
        {
          reason: `AntiRaid: ${reason}`
        }
      );

      locked++;
    } catch (error) {
      console.error(
        `Could not lock ${channel.name}: ${error.message}`
      );
    }
  }

  await securityLog(
    guild,
    "SERVER LOCKDOWN",
    `🔒 The server has been locked.\n\n**Reason:** ${reason}`
  );

  return locked;
}

/* =========================================================
   SERVER UNLOCK
========================================================= */

async function unlockServer(
  guild,
  automatic = false
) {
  const config = getConfig(guild.id);

  config.lockdown = false;
  config.lockdownUntil = 0;

  saveDatabase();

  let unlocked = 0;

  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased()) continue;

    try {
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: null,
          AddReactions: null,
          CreatePublicThreads: null,
          CreatePrivateThreads: null
        },
        {
          reason: automatic
            ? "AntiRaid lockdown expired"
            : "AntiRaid lockdown manually ended"
        }
      );

      unlocked++;
    } catch (error) {
      console.error(
        `Could not unlock ${channel.name}: ${error.message}`
      );
    }
  }

  await securityLog(
    guild,
    "SERVER UNLOCKED",
    automatic
      ? "🔓 The automatic lockdown timer has expired."
      : "🔓 A server administrator ended the lockdown."
  );

  return unlocked;
}

/* =========================================================
   RAID DETECTION
========================================================= */

async function startRaidLockdown(
  guild,
  reason
) {
  const config = getConfig(guild.id);

  if (config.lockdown) return;

  await lockServer(guild, reason);

  console.log(
    `🚨 Raid lockdown activated in ${guild.name}`
  );
}

/* =========================================================
   LOCKDOWN TIMER
========================================================= */

setInterval(async () => {
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    const config = getConfig(guild.id);

    if (
      config.lockdown &&
      config.lockdownUntil &&
      now >= config.lockdownUntil
    ) {
      await unlockServer(guild, true);
    }
  }
}, 15000);

/* =========================================================
   READY
========================================================= */

client.once("ready", () => {
  console.log(
    `🛡️ AntiRaid is online as ${client.user.tag}`
  );

  console.log(
    `Serving ${client.guilds.cache.size} server(s).`
  );
});

/* =========================================================
   MEMBER JOIN
========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    const guild = member.guild;
    const config = getConfig(guild.id);

    if (!config.enabled) return;

    const now = Date.now();

    const previous =
      joinHistory.get(guild.id) || [];

    const recent = previous.filter(
      timestamp =>
        now - timestamp <
        config.joinWindowSeconds * 1000
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
      recent.length >= config.joinThreshold &&
      !config.lockdown
    ) {
      await startRaidLockdown(
        guild,
        `${recent.length} members joined within ${config.joinWindowSeconds} seconds.`
      );
    }

    if (config.lockdown) {
      await securityLog(
        guild,
        "MEMBER JOINED DURING LOCKDOWN",
        `**${member.user.tag}** joined while lockdown was active.`
      );
    }
  }
);

/* =========================================================
   INTERACTIONS
========================================================= */

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

    /* =====================================================
       SETUP
    ===================================================== */

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

    /* =====================================================
       SECURITY
    ===================================================== */

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
            value:
              config.lockdown
                ? "🔴 ACTIVE"
                : "🟢 Inactive",
            inline: true
          },
          {
            name: "Logs",
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

    /* =====================================================
       LOCKDOWN
    ===================================================== */

    if (interaction.commandName === "lockdown") {

      if (!isAdmin) {
        return interaction.reply({
          content:
            "❌ You need **Manage Server** to use this command.",
          ephemeral: true
        });
      }

      await interaction.deferReply();

      const locked =
        await lockServer(
          guild,
          `Manual lockdown by ${interaction.user.tag}`
        );

      return interaction.editReply({
        content:
          `🔒 **Server locked.**\n\n` +
          `Locked **${locked}** text channel(s).\n` +
          `Automatic unlock: **${config.lockdownMinutes} minutes**.`
      });
    }

    /* =====================================================
       UNLOCK
    ===================================================== */

    if (interaction.commandName === "unlock") {

      if (!isAdmin) {
        return interaction.reply({
          content:
            "❌ You need **Manage Server** to use this command.",
          ephemeral: true
        });
      }

      await interaction.deferReply();

      const unlocked =
        await unlockServer(guild, false);

      return interaction.editReply({
        content:
          `🔓 **Server unlocked.**\n\n` +
          `Unlocked **${unlocked}** text channel(s).`
      });
    }

    /* =====================================================
       KICK
    ===================================================== */

    if (interaction.commandName === "kick") {

      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.KickMembers
      )) {
        return interaction.reply({
          content:
            "❌ You need **Kick Members** permission.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString("reason") ||
        "No reason provided";

      const member =
        await guild.members.fetch(user.id)
          .catch(() => null);

      if (!member) {
        return interaction.reply({
          content:
            "❌ That user is not a member of this server.",
          ephemeral: true
        });
      }

      if (!member.kickable) {
        return interaction.reply({
          content:
            "❌ I cannot kick that member. Check my role position and permissions.",
          ephemeral: true
        });
      }

      await member.kick(reason);

      await securityLog(
        guild,
        "MEMBER KICKED",
        `**User:** ${user.tag}\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}`
      );

      return interaction.reply({
        content:
          `👢 **${user.tag}** has been kicked.\nReason: **${reason}**`
      });
    }

    /* =====================================================
       BAN
    ===================================================== */

    if (interaction.commandName === "ban") {

      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.BanMembers
      )) {
        return interaction.reply({
          content:
            "❌ You need **Ban Members** permission.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString("reason") ||
        "No reason provided";

      const member =
        await guild.members.fetch(user.id)
          .catch(() => null);

      if (member && !member.bannable) {
        return interaction.reply({
          content:
            "❌ I cannot ban that member. Check my role position and permissions.",
          ephemeral: true
        });
      }

      await guild.members.ban(
        user.id,
        {
          reason
        }
      );

      await securityLog(
        guild,
        "MEMBER BANNED",
        `**User:** ${user.tag}\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}`
      );

      return interaction.reply({
        content:
          `🔨 **${user.tag}** has been banned.\nReason: **${reason}**`
      });
    }

    /* =====================================================
       TIMEOUT
    ===================================================== */

    if (interaction.commandName === "timeout") {

      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ModerateMembers
      )) {
        return interaction.reply({
          content:
            "❌ You need **Moderate Members** permission.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser("user");

      const minutes =
        interaction.options.getInteger("minutes");

      const reason =
        interaction.options.getString("reason") ||
        "No reason provided";

      const member =
        await guild.members.fetch(user.id)
          .catch(() => null);

      if (!member) {
        return interaction.reply({
          content:
            "❌ That user is not in this server.",
          ephemeral: true
        });
      }

      if (!member.moderatable) {
        return interaction.reply({
          content:
            "❌ I cannot timeout that member.",
          ephemeral: true
        });
      }

      await member.timeout(
        minutes * 60 * 1000,
        reason
      );

      await securityLog(
        guild,
        "MEMBER TIMED OUT",
        `**User:** ${user.tag}\n**Duration:** ${minutes} minutes\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}`
      );

      return interaction.reply({
        content:
          `⏱️ **${user.tag}** has been timed out for **${minutes} minutes**.\nReason: **${reason}**`
      });
    }

    /* =====================================================
       UNTIMEOUT
    ===================================================== */

    if (interaction.commandName === "untimeout") {

      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ModerateMembers
      )) {
        return interaction.reply({
          content:
            "❌ You need **Moderate Members** permission.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser("user");

      const member =
        await guild.members.fetch(user.id)
          .catch(() => null);

      if (!member) {
        return interaction.reply({
          content:
            "❌ That user is not in this server.",
          ephemeral: true
        });
      }

      await member.timeout(
        null,
        `Timeout removed by ${interaction.user.tag}`
      );

      return interaction.reply({
        content:
          `🔓 Timeout removed from **${user.tag}**.`
      });
    }

    /* =====================================================
       WARN
    ===================================================== */

    if (interaction.commandName === "warn") {

      if (!isAdmin) {
        return interaction.reply({
          content:
            "❌ You need **Manage Server** permission.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString("reason") ||
        "No reason provided";

      if (!config.warnings[user.id]) {
        config.warnings[user.id] = [];
      }

      config.warnings[user.id].push({
        reason,
        moderator: interaction.user.id,
        timestamp: Date.now()
      });

      saveDatabase();

      await securityLog(
        guild,
        "MEMBER WARNED",
        `**User:** ${user.tag}\n**Moderator:** ${interaction.user.tag}\n**Reason:** ${reason}`
      );

      return interaction.reply({
        content:
          `⚠️ **${user.tag}** has been warned.\nReason: **${reason}**`
      });
    }

    /* =====================================================
       WARNINGS
    ===================================================== */

    if (interaction.commandName === "warnings") {

      const user =
        interaction.options.getUser("user");

      const warnings =
        config.warnings[user.id] || [];

      if (warnings.length === 0) {
        return interaction.reply({
          content:
            `✅ **${user.tag}** has no warnings.`
        });
      }

      const description =
        warnings
          .map(
            (warning, index) =>
              `**${index + 1}.** ${warning.reason}\n` +
              `Moderator: <@${warning.moderator}>`
          )
          .join("\n\n");

      const embed =
        new EmbedBuilder()
          .setTitle(`⚠️ Warnings — ${user.tag}`)
          .setDescription(description)
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    /* =====================================================
       CLEAR
    ===================================================== */

    if (interaction.commandName === "clear") {

      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageMessages
      )) {
        return interaction.reply({
          content:
            "❌ You need **Manage Messages** permission.",
          ephemeral: true
        });
      }

      const amount =
        interaction.options.getInteger("amount");

      if (!interaction.channel ||
          !interaction.channel.isTextBased()) {
        return interaction.reply({
          content:
            "❌ This command cannot be used here.",
          ephemeral: true
        });
      }

      const deleted =
        await interaction.channel.bulkDelete(
          amount,
          true
        );

      return interaction.reply({
        content:
          `🧹 Deleted **${deleted.size}** messages.`,
        ephemeral: true
      });
    }

    /* =====================================================
       SLOWMODE
    ===================================================== */

    if (interaction.commandName === "slowmode") {

      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageChannels
      )) {
        return interaction.reply({
          content:
            "❌ You need **Manage Channels** permission.",
          ephemeral: true
        });
      }

      const seconds =
        interaction.options.getInteger("seconds");

      if (!interaction.channel ||
          !interaction.channel.isTextBased() ||
          !("setRateLimitPerUser" in interaction.channel)) {
        return interaction.reply({
          content:
            "❌ Slowmode cannot be configured in this channel.",
          ephemeral: true
        });
      }

      await interaction.channel.setRateLimitPerUser(
        seconds
      );

      return interaction.reply({
        content:
          seconds === 0
            ? "🐌 Slowmode disabled."
            : `🐌 Slowmode set to **${seconds} seconds**.`
      });
    }

    /* =====================================================
       LOCK CHANNEL
    ===================================================== */

    if (interaction.commandName === "lock") {

      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageChannels
      )) {
        return interaction.reply({
          content:
            "❌ You need **Manage Channels** permission.",
          ephemeral: true
        });
      }

      if (!interaction.channel) {
        return interaction.reply({
          content:
            "❌ This command cannot be used here.",
          ephemeral: true
        });
      }

      await interaction.channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: false
        },
        {
          reason:
            `Channel locked by ${interaction.user.tag}`
        }
      );

      return interaction.reply({
        content:
          "🔒 **This channel has been locked.**"
      });
    }

    /* =====================================================
       UNLOCK CHANNEL
    ===================================================== */

    if (
      interaction.commandName === "unlockchannel"
    ) {

      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageChannels
      )) {
        return interaction.reply({
          content:
            "❌ You need **Manage Channels** permission.",
          ephemeral: true
        });
      }

      if (!interaction.channel) {
        return interaction.reply({
          content:
            "❌ This command cannot be used here.",
          ephemeral: true
        });
      }

      await interaction.channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: null
        },
        {
          reason:
            `Channel unlocked by ${interaction.user.tag}`
        }
      );

      return interaction.reply({
        content:
          "🔓 **This channel has been unlocked.**"
      });
    }

    /* =====================================================
       LOG CHANNEL
    ===================================================== */

    if (
      interaction.commandName === "setlogchannel"
    ) {

      if (!isAdmin) {
        return interaction.reply({
          content:
            "❌ You need **Manage Server** permission.",
          ephemeral: true
        });
      }

      const channel =
        interaction.options.getChannel("channel");

      config.logChannelId = channel.id;

      saveDatabase();

      return interaction.reply({
        content:
          `📋 Security logs will now be sent to ${channel}.`
      });
    }

    /* =====================================================
       RAID MODE
    ===================================================== */

    if (
      interaction.commandName === "raidmode"
    ) {

      if (!isAdmin) {
        return interaction.reply({
          content:
            "❌ You need **Manage Server** permission.",
          ephemeral: true
        });
      }

      const enabled =
        interaction.options.getBoolean("enabled");

      config.enabled = enabled;

      saveDatabase();

      return interaction.reply({
        content:
          enabled
            ? "🛡️ **Automatic raid protection enabled.**"
            : "⚠️ **Automatic raid protection disabled.**"
      });
    }

    /* =====================================================
       SERVER INFO
    ===================================================== */

    if (
      interaction.commandName === "serverinfo"
    ) {

      const embed =
        new EmbedBuilder()
          .setTitle(`📊 ${guild.name}`)
          .addFields(
            {
              name: "Owner",
              value: `<@${guild.ownerId}>`,
              inline: true
            },
            {
              name: "Members",
              value: `${guild.memberCount}`,
              inline: true
            },
            {
              name: "Channels",
              value: `${guild.channels.cache.size}`,
              inline: true
            },
            {
              name: "Created",
              value:
                `<t:${Math.floor(
                  guild.createdTimestamp / 1000
                )}:F>`,
              inline: false
            }
          )
          .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    /* =====================================================
       USER INFO
    ===================================================== */

    if (
      interaction.commandName === "userinfo"
    ) {

      const user =
        interaction.options.getUser("user") ||
        interaction.user;

      const member =
        await guild.members.fetch(user.id)
          .catch(() => null);

      const embed =
        new EmbedBuilder()
          .setTitle(`👤 ${user.tag}`)
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            {
              name: "User ID",
              value: user.id,
              inline: true
            },
            {
              name: "Bot",
              value:
                user.bot ? "Yes" : "No",
              inline: true
            },
            {
              name: "Account Created",
              value:
                `<t:${Math.floor(
                  user.createdTimestamp / 1000
                )}:F>`,
              inline: false
            }
          )
          .setTimestamp();

      if (member) {
        embed.addFields({
          name: "Joined Server",
          value:
            `<t:${Math.floor(
              member.joinedTimestamp / 1000
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

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN)
  .catch(error => {
    console.error(
      "❌ Discord login failed:"
    );

    console.error(error);

    process.exit(1);
  });
