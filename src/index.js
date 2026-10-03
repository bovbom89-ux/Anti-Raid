require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const commands = [

  /* =========================
     SETUP
  ========================= */

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up AntiRaid protection."),

  /* =========================
     SECURITY
  ========================= */

  new SlashCommandBuilder()
    .setName("security")
    .setDescription("View the current AntiRaid security status."),

  /* =========================
     LOCKDOWN
  ========================= */

  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock the entire server against member messages."),

  /* =========================
     UNLOCK
  ========================= */

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("End the server-wide lockdown."),

  /* =========================
     KICK
  ========================= */

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to kick.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the kick.")
        .setRequired(false)
    ),

  /* =========================
     BAN
  ========================= */

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to ban.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the ban.")
        .setRequired(false)
    ),

  /* =========================
     TIMEOUT
  ========================= */

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to timeout.")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Timeout duration in minutes.")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the timeout.")
        .setRequired(false)
    ),

  /* =========================
     UNTIMEOUT
  ========================= */

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a member's timeout.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to untimeout.")
        .setRequired(true)
    ),

  /* =========================
     WARN
  ========================= */

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Give a member a warning.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to warn.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the warning.")
        .setRequired(false)
    ),

  /* =========================
     WARNINGS
  ========================= */

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a member's warnings.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to check.")
        .setRequired(true)
    ),

  /* =========================
     CLEAR
  ========================= */

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages from the current channel.")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete.")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  /* =========================
     SLOWMODE
  ========================= */

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set the slowmode for the current channel.")
    .addIntegerOption(option =>
      option
        .setName("seconds")
        .setDescription("Slowmode duration in seconds. Use 0 to disable.")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    ),

  /* =========================
     LOCK CHANNEL
  ========================= */

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock the current channel."),

  /* =========================
     UNLOCK CHANNEL
  ========================= */

  new SlashCommandBuilder()
    .setName("unlockchannel")
    .setDescription("Unlock the current channel."),

  /* =========================
     LOG CHANNEL
  ========================= */

  new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Set the AntiRaid security log channel.")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel where security logs should be sent.")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    ),

  /* =========================
     RAID MODE
  ========================= */

  new SlashCommandBuilder()
    .setName("raidmode")
    .setDescription("Enable or disable automatic raid protection.")
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("Whether raid protection should be enabled.")
        .setRequired(true)
    ),

  /* =========================
     SERVER INFO
  ========================= */

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View information about the server."),

  /* =========================
     USER INFO
  ========================= */

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View information about a member.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to view.")
        .setRequired(false)
    )

].map(command =>
  command
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .toJSON()
);

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

/* =========================================================
   CHECK CONFIGURATION
========================================================= */

if (!token) {
  console.error(
    "❌ DISCORD_TOKEN is missing."
  );

  process.exit(1);
}

if (!clientId) {
  console.error(
    "❌ DISCORD_CLIENT_ID is missing."
  );

  process.exit(1);
}

/* =========================================================
   REGISTER COMMANDS
========================================================= */

const rest = new REST({
  version: "10"
}).setToken(token);

(async () => {
  try {
    console.log(
      `🛡️ Registering ${commands.length} AntiRaid commands...`
    );

    await rest.put(
      Routes.applicationCommands(clientId),
      {
        body: commands
      }
    );

    console.log(
      "✅ All AntiRaid commands registered globally."
    );

    console.log(
      `📋 Registered ${commands.length} commands.`
    );

  } catch (error) {
    console.error(
      "❌ Failed to register commands:"
    );

    console.error(error);
  }
})();
