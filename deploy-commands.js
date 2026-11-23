// Manual slash-command registration (the bot also does this automatically on startup).
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./utils/commands');

commands.load();
const body = commands.slashPayload();
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID is missing in .env');
    const target = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);
    const data = await rest.put(target, { body });
    console.log(`[deploy] registered ${data.length} slash commands`);
    process.exit(0);
  } catch (err) {
    console.error('[deploy] failed:', err.message);
    process.exit(1);
  }
})();
