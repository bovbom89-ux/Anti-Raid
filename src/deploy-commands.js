const {
  SlashCommandBuilder,
  ChannelType
} = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up AntiRaid protection"),

  new SlashCommandBuilder()
    .setName("security")
    .setDescription("View AntiRaid security status"),

  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock the entire server"),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock the entire server"),

  new SlashCommandBuilder()
    .setName("raidmode")
    .setDescription("Enable or disable raid protection")
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("Enable raid protection")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to kick")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to ban")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to timeout")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Timeout duration")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a timeout")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member to warn")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason")
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a member's warnings")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Member")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Number of messages")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set channel slowmode")
    .addIntegerOption(option =>
      option
        .setName("seconds")
        .setDescription("Slowmode duration")
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
    .setDescription("Set the security log channel")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Log channel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View server information"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View user information")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
    )
].map(command => command.toJSON());

module.exports = commands;
