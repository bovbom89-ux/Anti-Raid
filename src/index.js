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

let database = {};

try {
  if (fs.existsSync(DATA_FILE)) {
    database = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  }
} catch (error) {
  console.error("Could not read guild database:", error);
  database = {};
}

function saveDatabase() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(database, null, 2)
    );
  } catch (error) {
    console.error("Could not save guild database:", error);
  }
}

function getConfig(guildId) {
  if (!database[guildId]) {
    database[guildId] = {
      enabled: true,
      joinThreshold: 8,
      joinWindowSeconds: 10,
      lockdownMinutes: 10,
      logChannelId: null,
      lockdown: false,
      lockdownUntil: 0
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

async function sendSecurityLog(guild, title, description) {
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

  try {
    await channel.send({
      embeds: [embed]
    });
  } catch (error) {
    console.error("Could not send security log:", error);
  }
}

async function startLockdown(guild, reason) {
  const config = getConfig(guild.id);

  if (config.lockdown) {
    return;
  }

  config.lockdown = true;
  config.lockdownUntil =
    Date.now() + config.lockdownMinutes * 60 * 1000;

  saveDatabase();

  console.log(`🔒 Lockdown activated in ${guild.name}`);

  await sendSecurityLog(
    guild,
    "🚨 RAID DETECTED",
    `${reason}\n\n🔒 **Automatic lockdown activated.**`
  );
}

async function endLockdown(guild, automatic = false) {
  const config = getConfig(guild.id);

  if (!config.lockdown) {
    return;
  }

  config.lockdown = false;
  config.lockdownUntil = 0;

  saveDatabase();

  console.log(`🔓 Lockdown ended in ${guild.name}`);

  await sendSecurityLog(
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
  try {
    const guild = member.guild;
    const config = getConfig(guild.id);

    if (!config.enabled) {
      return;
    }

    const now = Date.now();

    const previous = joinHistory.get(guild.id) || [];

    const recent = previous.filter(timestamp => {
      return (
        now - timestamp <
        config.joinWindowSeconds * 1000
      );
    });

    recent.push(now);

    joinHistory.set(guild.id, recent);

    console.log(
      `👤 ${member.user.tag} joined ${guild.name} (${recent.length}/${config.joinThreshold})`
    );

    if (
      recent.length >= config.joinThreshold &&
      !config.lockdown
    ) {
      await startLockdown(
        guild,
        `**${recent.length} members joined within ${config.joinWindowSeconds} seconds.**`
      );
    }

    if (config.lockdown) {
      await sendSecurityLog(
        guild,
        "MEMBER JOINED DURING LOCKDOWN",
        `**${member.user.tag}** joined while lockdown was active.`
      );
    }
  } catch (error) {
    console.error("Member join error:", error);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
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
      interaction.memberPermissions &&
      interaction.memberPermissions.has(
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
            value: `${config.joinThreshold} joins / ${config.joinWindowSeconds}s`,
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

    if (interaction.commandName === "raidstatus") {
      const now = Date.now();

      const recent = (
        joinHistory.get(guild.id) || []
      ).filter(timestamp => {
        return (
          now - timestamp <
          config.joinWindowSeconds * 1000
        );
     
