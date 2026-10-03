    /*
     * /raidstatus
     */

    if (
      interaction.commandName === "raidstatus"
    ) {
      const now = Date.now();

      const recent =
        (joinHistory.get(guild.id) || []).filter(
          timestamp =>
            now - timestamp <
            config.joinWindowSeconds * 1000
        );

      return interaction.reply({
        content:
          "🛡️ **Raid Status**\n\n" +
          `Recent joins: **${recent.length}/${config.joinThreshold}**\n` +
          `Lockdown: **${config.lockdown ? "ACTIVE" : "Inactive"}**\n` +
          `Protection: **${config.enabled ? "Enabled" : "Disabled"}**`
      });
    }

    /*
     * /lockdown
     */

    if (interaction.commandName === "lockdown") {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "❌ You need **Manage Server** to use this command.",
          ephemeral: true
        });
      }

      await startLockdown(
        guild,
        `Manual lockdown activated by **${interaction.user.tag}**.`
      );

      return interaction.reply({
        content:
          "🔒 **AntiRaid lockdown activated.**"
      });
    }

    /*
     * /unlock
     */

    if (interaction.commandName === "unlock") {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "❌ You need **Manage Server** to use this command.",
          ephemeral: true
        });
      }

      await endLockdown(guild, false);

      return interaction.reply({
        content:
          "🔓 **AntiRaid lockdown ended.**"
      });
    }

    /*
     * /logs
     */

    if (interaction.commandName === "logs") {
      if (!isAdmin) {
        return interaction.reply({
          content:
            "❌ You need **Manage Server** to use this command.",
          ephemeral: true
        });
      }

      const subcommand =
        interaction.options.getSubcommand();

      if (subcommand === "view") {
        return interaction.reply({
          content: config.logChannelId
            ? `📋 Security logs: <#${config.logChannelId}>`
            : "📋 Security logging is currently disabled."
        });
      }

      if (subcommand === "set") {
        config.logChannelId =
          interaction.channel.id;

        saveDatabase();

        return interaction.reply({
          content:
            `📋 Security logs are now being sent to ${interaction.channel}.`
        });
      }

      if (subcommand === "disable") {
        config.logChannelId = null;

        saveDatabase();

        return interaction.reply({
          content:
            "📋 Security logging has been disabled."
        });
      }
    }
  }
);

/* =========================
   ERROR HANDLING
========================= */

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled promise rejection:",
      error
    );
  }
);

/* =========================
   LOGIN
========================= */

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "❌ DISCORD_TOKEN is missing."
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
