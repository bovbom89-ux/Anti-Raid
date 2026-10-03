require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up AntiRaid for this server.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

  new SlashCommandBuilder()
    .setName("security")
    .setDescription("View AntiRaid security status."),

  new SlashCommandBuilder()
    .setName("raidstatus")
    .setDescription("View current raid activity."),

  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Manually activate lockdown.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("End the current lockdown.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    ),

  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Configure the AntiRaid log channel.")
    .addSubcommand(command =>
      command
        .setName("view")
        .setDescription("View the current log channel.")
    )
    .addSubcommand(command =>
      command
        .setName("set")
        .setDescription("Set the current channel as the log channel.")
    )
    .addSubcommand(command =>
      command
        .setName("disable")
        .setDescription("Disable security logs.")
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
].map(command => command.toJSON());

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error("❌ CLIENT_ID is missing.");
  process.exit(1);
}

const rest = new REST({
  version: "10"
}).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🛡️ Registering AntiRaid commands...");

    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID
        ),
        {
          body: commands
        }
      );

      console.log(
        "✅ Commands registered to your test server."
      );
    } else {
      await rest.put(
        Routes.applicationCommands(
          process.env.CLIENT_ID
        ),
        {
          body: commands
        }
      );

      console.log(
        "✅ Commands registered globally."
      );
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
