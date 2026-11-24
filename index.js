// MarkaBot — single-process entry: Discord bot + web dashboard on one port.
require('dotenv').config();
require('./utils/errors'); // keeps recent errors for the owner panel

const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { applyPresence } = require('./utils/presence');
const store = require('./utils/store');
const commands = require('./utils/commands');
const messages = require('./systems/messages');
const gctx = require('./utils/guildContext');

const REQUIRED = ['DISCORD_TOKEN'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[config] missing ${key} — copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

// Every event runs "inside" its server, so per-server settings (premium emojis…) apply automatically.
const rawEmit = client.emit.bind(client);
client.emit = (event, ...args) => {
  const gid = gctx.guildIdOf(args[0]) || gctx.guildIdOf(args[1]);
  return gid ? gctx.run(gid, () => rawEmit(event, ...args)) : rawEmit(event, ...args);
};

// ---- load commands & systems ----
commands.load();
const systems = ['appEmojis', 'botEvents', 'logs', 'jail', 'tickets', 'giveaways', 'invites', 'vanity', 'wheel', 'protection', 'premiumWatch', 'botProfile', 'levels', 'shop', 'automod', 'roleMenus', 'embeds', 'verify', 'purge', 'kafeel', 'prayer', 'staff', 'wrapped', 'drop', 'adhkar', 'games', 'tempvoice', 'appeals', 'khatma', 'radar', 'backup', 'youtube'].map((n) => require(`./systems/${n}`));
for (const s of systems) if (typeof s.init === 'function') s.init(client);

// component routers (buttons / selects / modals) from systems and command files
const routers = [
  ...systems.flatMap((s) => s.components || []),
  ...[...commands.commands.values()].flatMap((c) => c.components || []),
];


client.once(Events.ClientReady, async () => {
  console.log(`[bot] ${client.user.tag} online · ${client.guilds.cache.size} servers`);
  applyPresence(client);
  try {
    await commands.register(client);
  } catch (err) {
    console.error('[commands] registration failed:', err.message);
  }
});

client.on(Events.GuildCreate, (guild) => {
  if (store.get('blacklist').servers.includes(guild.id)) guild.leave().catch(() => {});
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) return await commands.handleInteraction(interaction);
    if (!interaction.customId) return;
    const router = routers.find((r) => interaction.customId.startsWith(r.prefix));
    if (router) await router.handle(interaction);
  } catch (err) {
    console.error('[interaction]', err);
    const payload = { content: '• حدث خطأ غير متوقع.', ephemeral: true };
    if (interaction.isRepliable?.()) {
      (interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload)).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  try {
    if (await commands.handleMessage(message)) return;
    if (message.guild) await messages.handle(message);
  } catch (err) {
    console.error('[message]', err);
  }
});

client.on(Events.Error, (err) => console.error('[client]', err.message));
process.on('unhandledRejection', (err) => console.error('[unhandled]', err));

global.client = client;
module.exports = { client };

// ---- dashboard (same process, same data) ----
require('./dashboard/server').start(client);

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('[bot] login failed:', err.message);
  process.exit(1);
});
