require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  ChannelType,
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

  const channel = guild.channels.cache.get(config.logChannelId);

  if (!channel || !channel.isTextBased()) return;
