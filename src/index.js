require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "guilds.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = {};

try {
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }
} catch {
  db = {};
}

function saveDB() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function getConfig(guildId) {
  if (!db[guildId]) {
    db[guildId] = {
      enabled: true,
      threshold: 8,
      window: 10,
      lockdownMinutes: 10,
      lockdown: false,
      lockdownUntil: 0,
      logChannel: null,
      warnings: {},
      lockdownChannels: {}
    };

    saveDB();
  }

  return db[guildId];
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const joins = new Map();

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.ManageGuild
  );
}

async function log(guild, title, description) {
  const config = getConfig(guild.id);

  if (!config.logChannel) return;

  const channel = guild.channels.cache.get(config.logChannel);

  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: "Anti-Raid"
    });

  await channel.send({
    embeds: [embed]
  }).catch(() => {});
}

async function lockdown(guild, reason) {
  const config = getConfig(guild.id);

  if (config.lockdown) return;

  config.lockdown = true;
  config.lockdownUntil =
    Date.now() + config.lockdownMinutes * 60 * 1000;

  config.lockdownChannels = {};

  for (const channel of guild.channels.cache.values()) {
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement &&
      channel.type !== ChannelType.GuildForum
    ) {
      continue;
    }

    try {
      const everyone = guild.roles.everyone;

      config.lockdownChannels[channel.id] = {
        sendMessages:
          channel.permissionOverwrites.cache
            .get(everyone.id)
            ?.deny.has(PermissionFlagsBits.SendMessages) ?? false
      };

      await channel.permissionOverwrites.edit(
        everyone,
        {
          SendMessages: false
        },
        {
          reason: "Anti-Raid server lockdown"
        }
      );
    } catch (error) {
      console.error(
        `Could not lock ${channel.name}:`,
        error.message
      );
    }
  }

  saveDB();

  await log(
    guild,
    "🔒 SERVER LOCKDOWN",
    `${reason}\n\nAll supported text channels have been locked for @everyone.`
  );
}

async function unlock(guild, automatic = false) {
  const config = getConfig(guild.id);

  if (!config.lockdown) return;

  for (const channelId of Object.keys(
    config.lockdownChannels || {}
  )) {
    const channel = guild.channels.cache.get(channelId);

    if (!channel) continue;

    try {
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: null
        },
        {
          reason: "Anti-Raid lockdown ended"
        }
      );
    } catch (error) {
      console.error(
        `Could not unlock channel ${channelId}:`,
        error.message
      );
    }
  }

  config.lockdown = false;
  config.lockdownUntil = 0;
  config.lockdownChannels = {};

  saveDB();

  await log(
    guild,
    "🔓 SERVER UNLOCKED",
    automatic
      ? "The automatic lockdown timer expired."
      : "A server administrator ended the lockdown."
  );
}

client.once("ready", () => {
  console.log(
    `🛡️ Anti-Raid is online as ${client.user.tag}`
  );

  console.log(
    `Serving ${client.guilds.cache.size} server(s).`
  );
});

client.on("guildMemberAdd", async member => {
  const guild = member.guild;
  const config = getConfig(guild.id);

  if (!config.enabled) return;

  const now = Date.now();

  const previous = joins.get(guild.id) || [];

  const recent = previous.filter(
    time => now - time < config.window * 1000
  );

  recent.push(now);

  joins.set(guild.id, recent);

  if (
    recent.length >= config.threshold &&
    !config.lockdown
  ) {
    await lockdown(
      guild,
      `🚨 **${recent.length} members joined within ${config.window} seconds.**`
    );
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.guild) {
    return interaction.reply({
      content: "❌ This command must be used in a server.",
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  const config = getConfig(guild.id);

  try {
    if (interaction.commandName === "ping") {
      return interaction.reply({
        content: `🏓 Pong! ${client.ws.ping}ms`
      });
    }

    if (interaction.commandName === "botinfo") {
      const embed = new EmbedBuilder()
        .setTitle("🛡️ Anti-Raid")
        .setDescription(
          "Security and moderation bot."
        )
        .addFields(
          {
            name: "Servers",
            value: `${client.guilds.cache.size}`,
            inline: true
          },
          {
            name: "Ping",
            value: `${client.ws.ping}ms`,
            inline: true
          }
        )
        .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    if (interaction.commandName === "setup") {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ You need Manage Server.",
          ephemeral: true
        });
      }

      config.enabled = true;
      saveDB();

      return interaction.reply({
        content:
          "🛡️ **Anti-Raid is enabled.**\n\n" +
          `Raid threshold: **${config.threshold} joins / ${config.window}s**\n` +
          `Lockdown duration: **${config.lockdownMinutes} minutes**`
      });
    }

    if (interaction.commandName === "security") {
      const embed = new EmbedBuilder()
        .setTitle("🛡️ Security Status")
        .addFields(
          {
            name: "Protection",
            value: config.enabled
              ? "🟢 Enabled"
              : "🔴 Disabled",
            inline: true
          },
          {
            name: "Lockdown",
            value: config.lockdown
              ? "🔴 Active"
              : "🟢 Inactive",
            inline: true
          },
          {
            name: "Raid Threshold",
            value: `${config.threshold} / ${config.window}s`,
            inline: true
          },
          {
            name: "Log Channel",
            value: config.logChannel
              ? `<#${config.logChannel}>`
              : "Not configured",
            inline: true
          }
        )
        .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    if (interaction.commandName === "raidstatus") {
      const now = Date.now();

      const recent = (
        joins.get(guild.id) || []
      ).filter(
        time => now - time < config.window * 1000
      );

      return interaction.reply({
        content:
          "🛡️ **Raid Status**\n\n" +
          `Recent joins: **${recent.length}/${config.threshold}**\n` +
          `Protection: **${config.enabled ? "Enabled" : "Disabled"}**\n` +
          `Lockdown: **${config.lockdown ? "Active" : "Inactive"}**`
      });
    }

    if (interaction.commandName === "lockdown") {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ You need Manage Server.",
          ephemeral: true
        });
      }

      await lockdown(
        guild,
        `Manual lockdown activated by **${interaction.user.tag}**.`
      );

      return interaction.reply({
        content:
          "🔒 **The server has been locked down.**\n\n@everyone can no longer send messages in supported text channels."
      });
    }

    if (interaction.commandName === "unlock") {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ You need Manage Server.",
          ephemeral: true
        });
      }

      await unlock(guild);

      return interaction.reply({
        content:
          "🔓 **The server has been unlocked.**"
      });
    }

    if (interaction.commandName === "logs") {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ You need Manage Server.",
          ephemeral: true
        });
      }

      const action =
        interaction.options.getString("action");

      if (action === "set") {
        config.logChannel = interaction.channelId;
        saveDB();

        return interaction.reply({
          content:
            `📋 Logs are now being sent to <#${interaction.channelId}>.`
        });
      }

      if (action === "disable") {
        config.logChannel = null;
        saveDB();

        return interaction.reply({
          content:
            "📋 Security logging has been disabled."
        });
      }

      return interaction.reply({
        content: config.logChannel
          ? `📋 Logs: <#${config.logChannel}>`
          : "📋 Logs are not configured."
      });
    }

    if (interaction.commandName === "ban") {
      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.BanMembers
      )) {
        return interaction.reply({
          content: "❌ You need Ban Members.",
          ephemeral: true
        });
      }

      const member =
        interaction.options.getMember("user");

      const reason =
        interaction.options.getString("reason") ||
        "No reason provided.";

      if (!member) {
        return interaction.reply({
          content: "❌ Member not found.",
          ephemeral: true
        });
      }

      await member.ban({
        reason
      });

      await log(
        guild,
        "🔨 MEMBER BANNED",
        `**${member.user.tag}** was banned by **${interaction.user.tag}**.\n\nReason: ${reason}`
      );

      return interaction.reply({
        content:
          `🔨 **${member.user.tag}** has been banned.`
      });
    }

    if (interaction.commandName === "kick") {
      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.KickMembers
      )) {
        return interaction.reply({
          content: "❌ You need Kick Members.",
          ephemeral: true
        });
      }

      const member =
        interaction.options.getMember("user");

      const reason =
        interaction.options.getString("reason") ||
        "No reason provided.";

      if (!member) {
        return interaction.reply({
          content: "❌ Member not found.",
          ephemeral: true
        });
      }

      await member.kick(reason);

      await log(
        guild,
        "👢 MEMBER KICKED",
        `**${member.user.tag}** was kicked by **${interaction.user.tag}**.\n\nReason: ${reason}`
      );

      return interaction.reply({
        content:
          `👢 **${member.user.tag}** has been kicked.`
      });
    }

    if (interaction.commandName === "timeout") {
      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ModerateMembers
      )) {
        return interaction.reply({
          content: "❌ You need Moderate Members.",
          ephemeral: true
        });
      }

      const member =
        interaction.options.getMember("user");

      const minutes =
        interaction.options.getInteger("minutes");

      const reason =
        interaction.options.getString("reason") ||
        "No reason provided.";

      if (!member) {
        return interaction.reply({
          content: "❌ Member not found.",
          ephemeral: true
        });
      }

      if (!minutes || minutes < 1 || minutes > 40320) {
        return interaction.reply({
          content:
            "❌ Timeout must be between 1 minute and 28 days.",
          ephemeral: true
        });
      }

      await member.timeout(
        minutes * 60 * 1000,
        reason
      );

      await log(
        guild,
        "⏱️ MEMBER TIMED OUT",
        `**${member.user.tag}** was timed out for **${minutes} minutes** by **${interaction.user.tag}**.\n\nReason: ${reason}`
      );

      return interaction.reply({
        content:
          `⏱️ **${member.user.tag}** has been timed out for **${minutes} minutes**.`
      });
    }

    if (interaction.commandName === "clear") {
      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageMessages
      )) {
        return interaction.reply({
          content: "❌ You need Manage Messages.",
          ephemeral: true
        });
      }

      const amount =
        interaction.options.getInteger("amount");

      if (!amount || amount < 1 || amount > 100) {
        return interaction.reply({
          content:
            "❌ Choose an amount between 1 and 100.",
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
          `🧹 Deleted **${deleted.size} messages**.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "warn") {
      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ModerateMembers
      )) {
        return interaction.reply({
          content: "❌ You need Moderate Members.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser("user");

      const reason =
        interaction.options.getString("reason") ||
        "No reason provided.";

      if (!user) {
        return interaction.reply({
          content: "❌ User not found.",
          ephemeral: true
        });
      }

      if (!config.warnings[user.id]) {
        config.warnings[user.id] = [];
      }

      config.warnings[user.id].push({
        reason,
        moderator: interaction.user.id,
        timestamp: Date.now()
      });

      saveDB();

      await log(
        guild,
        "⚠️ MEMBER WARNED",
        `**${user.tag}** was warned by **${interaction.user.tag}**.\n\nReason: ${reason}`
      );

      return interaction.reply({
        content:
          `⚠️ **${user.tag}** has been warned.`
      });
    }

    if (interaction.commandName === "warnings") {
      const user =
        interaction.options.getUser("user");

      if (!user) {
        return interaction.reply({
          content: "❌ User not found.",
          ephemeral: true
        });
      }

      const warnings =
        config.warnings[user.id] || [];

      if (!warnings.length) {
        return interaction.reply({
          content:
            `✅ **${user.tag}** has no warnings.`
        });
      }

      const text = warnings
        .slice(-10)
        .map(
          (warning, index) =>
            `**${index + 1}.** ${warning.reason}`
        )
        .join("\n");

      return interaction.reply({
        content:
          `⚠️ **Warnings for ${user.tag}**\n\n${text}`
      });
    }

    if (interaction.commandName === "serverinfo") {
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${guild.name}`)
        .addFields(
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
            name: "Roles",
            value: `${guild.roles.cache.size}`,
            inline: true
          },
          {
            name: "Owner",
            value: `<@${guild.ownerId}>`,
            inline: true
          }
        )
        .setTimestamp();

      return interaction.reply({
        embeds: [embed]
      });
    }

    if (interaction.commandName === "user") {
      const user =
        interaction.options.getUser("user") ||
        interaction.user;

      const member =
        await guild.members.fetch(user.id).catch(() => null);

      const embed = new EmbedBuilder()
        .setTitle(`👤 ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          {
            name: "User ID",
            value: user.id,
            inline: false
          },
          {
            name: "Account Created",
            value: `<t:${Math.floor(
              user.createdTimestamp / 1000
            )}:F>`,
            inline: false
          },
          {
            name: "Joined Server",
            value: member
              ? `<t:${Math.floor(
                  member.joinedTimestamp / 1000
                )}:F>`
              : "Not available",
            inline: false
          }
        );

      return interaction.reply({
        embeds: [embed]
      });
    }

    if (interaction.commandName === "slowmode") {
      if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageChannels
      )) {
        return interaction.reply({
          content: "❌ You need Manage Channels.",
          ephemeral: true
        });
      }

      const seconds =
        interaction.options.getInteger("seconds");

      if (
        seconds < 0 ||
        seconds > 21600
      ) {
        return interaction.reply({
          content:
            "❌ Slowmode must be between 0 and 21600 seconds.",
          ephemeral: true
        });
      }

      await interaction.channel.setRateLimitPerUser(
        seconds
      );

      return interaction.reply({
        content:
          seconds === 0
            ? "🐢 Slowmode disabled."
            : `🐢 Slowmode set to **${seconds} seconds**.`
      });
    }

    return interaction.reply({
      content: "❓ Unknown command.",
      ephemeral: true
    });
  } catch (error) {
    console.error(error);

    if (interaction.replied) {
      return interaction.followUp({
        content:
          "❌ Something went wrong while executing this command.",
        ephemeral: true
      });
    }

    return interaction.reply({
      content:
        "❌ Something went wrong while executing this command.",
      ephemeral: true
    });
  }
});

setInterval(async () => {
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
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

process.on("unhandledRejection", error => {
  console.error(
    "Unhandled promise rejection:",
    error
  );
});

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
