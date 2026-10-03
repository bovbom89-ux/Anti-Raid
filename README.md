# 🛡️ AntiRaid

AntiRaid is a Discord security bot designed to protect servers from raid activity and rapid member joins.

## Version 1 Features

- 🛡️ Raid detection
- 🚨 Automatic lockdown
- 📋 Security logging
- 📊 Raid status
- ⚙️ Server setup
- 🔒 Manual lockdown
- 🔓 Manual unlock

## Commands

`/setup` — Set up AntiRaid

`/security` — View security status

`/raidstatus` — View current raid activity

`/lockdown` — Manually activate lockdown

`/unlock` — End lockdown

`/logs view` — View the current log channel

`/logs set` — Set the current channel for security logs

`/logs disable` — Disable security logs

## Default Protection

AntiRaid detects:

**8 member joins within 10 seconds**

When this threshold is reached, AntiRaid activates an automatic lockdown.

## Security

Never upload your Discord bot token to GitHub.

Your token should be stored as a secure environment variable on your hosting provider.
