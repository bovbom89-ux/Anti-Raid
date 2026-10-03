require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ DISCORD_CLIENT_ID is missing.");
  process.exit(1);
}

const commands = [

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up AntiRaid protection"),

  new SlashCommandBuilder()
    .setName("security")
    .setDescription("View the current AntiRaid security status"),

  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock all text channels in the server"),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock all text channels in the server"),

  new SlashCommandBuilder()
    .setName("raidmode")
    .setDescription("Enable or disable automatic raid protection")
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("Whether automatic raid protection should be enabled")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to kick")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the kick")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to ban")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the ban")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to timeout")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Timeout duration in minutes")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the timeout")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a timeout from a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member to warn")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the warning")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a member's warnings")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The member")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages from the current channel")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set the slowmode for the current channel")
    .addIntegerOption(option =>
      option
        .setName("seconds")
        .setDescription("Slowmode duration in seconds")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock the current channel"),

  new SlashCommandBuilder()
    .setName("unlockchannel")
    .setDescription("Unlock the current channel"),

  new SlashCommandBuilder()
    .setName("setlogchannel")
    .setDescription("Set the AntiRaid security log channel")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel to use for security logs")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View information about the server"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View information about a user")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The user")
        .setRequired(false)
    )

].map(command => command.toJSON());

const rest = new REST({
  version: "10"
}).setToken(TOKEN);

(async () => {
  try {
    console.log(
      `🛡️ Registering ${commands.length} AntiRaid commands...`
    );

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: commands
      }
    );

    console.log(
      "✅ All AntiRaid commands registered globally."
    );

  } catch (error) {
    console.error(
      "❌ Failed to register commands:"
    );

    console.error(error);

    process.exit(1);
  }
})();
