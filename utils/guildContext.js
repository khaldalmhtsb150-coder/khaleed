// Remembers which server the current code path is working for, without passing guildId everywhere.
// index.js wraps every Discord event in run(guildId, ...); the dashboard wraps each guild request.
// Used by utils/emojis.js so premium servers see their own emojis automatically.
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

const run = (guildId, fn) => (guildId ? als.run({ guildId: String(guildId) }, fn) : fn());
const current = () => als.getStore()?.guildId || null;

/** Best-effort guild id from any discord.js structure (message, member, interaction, reaction, guild...). */
function guildIdOf(x) {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.guildId === 'string') return x.guildId;
  if (x.guild?.id) return x.guild.id;
  if (x.message?.guildId) return x.message.guildId;
  // a Guild itself
  if (typeof x.memberCount === 'number' && x.channels && x.id) return x.id;
  return null;
}

module.exports = { run, current, guildIdOf };
