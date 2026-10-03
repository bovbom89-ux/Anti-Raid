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
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
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
    database[guildId] = { ...DEFAULT_CONFIG };
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

async function securityLog(guild, title, description) {
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

async function startLockdown(guild, reason) {
  const config = getConfig(guild.id);

  if (config.lockdown) return;

  config.lockdown = true;
  config.lockdownUntil =
    Date.now() +
    config.lockdownMinutes * 60 * 1000;

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

async function endLockdown(guild) {
  const config = getConfig(guild.id);

  if (!config.lockdown) return;

  config.lockdown = false;
  config.lockdownUntil = 0;

  saveDatabase();

  await securityLog(
    guild,
    "🔓 LOCKDOWN ENDED",
    "The AntiRaid lockdown timer has expired."
  );

  console.log(
    `Lockdown ended in ${guild.name}`
  );
}

setInterval(async () => {
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    const config = getConfig(guild.id);

    if (
      config.lockdown &&
      config.lockdownUntil &&
      now >= config.lockdownUntil
    ) {
      await endLockdown(guild);
    }
  }
}, 15000);

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
});

client.on("guildCreate", guild => {
  getConfig(guild.id);

  console.log(
    `AntiRaid joined ${guild.name}`
  );
});

process.on("unhandledRejection", error => {
  console.error(
    "Unhandled promise rejection:",
    error
  );
});

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "❌ DISCORD_TOKEN is missing."
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
