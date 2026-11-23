// Bot-wide activity log (owner panel + optional Discord channel).
const store = require('./store');

const MAX = 3000;
let client = null;

const TYPES = {
  guild_join: 'دخول سيرفر',
  guild_leave: 'خروج من سيرفر',
  giveaway_start: 'بدء قيفاواي',
  giveaway_end: 'انتهاء قيفاواي',
  command: 'استخدام أمر',
  dashboard: 'تعديل من اللوحة',
  owner: 'إجراء المالك',
};

// types sent to the Discord log channel (commands are too noisy, they stay in the panel only)
const DEFAULT_CHANNEL_TYPES = ['guild_join', 'guild_leave', 'giveaway_start', 'giveaway_end', 'dashboard', 'owner'];

function init(c) {
  client = c;
}

function list() {
  const l = store.get('botLogs');
  return Array.isArray(l) ? l : store.set('botLogs', []);
}

/**
 * log('owner', 'أخرج البوت من سيرفر', { user: {id, name}, guild: {id, name} })
 */
function log(type, text, { user = null, guild = null } = {}) {
  const entry = {
    at: Date.now(),
    type,
    text: String(text).slice(0, 500),
    userId: user?.id || null,
    userName: user?.name || user?.username || null,
    guildId: guild?.id || null,
    guildName: guild?.name || null,
  };
  const l = list();
  l.unshift(entry);
  if (l.length > MAX) l.length = MAX;
  store.save('botLogs');
  sendToChannel(entry).catch(() => {});
  return entry;
}

async function sendToChannel(entry) {
  const s = store.get('botSettings');
  if (!client?.isReady() || !s.logChannelId) return;
  const types = s.logTypes || DEFAULT_CHANNEL_TYPES;
  if (!types.includes(entry.type)) return;
  const ch = await client.channels.fetch(s.logChannelId).catch(() => null);
  if (!ch?.isTextBased()) return;
  const ui = require('./ui');
  const lines = [`**${TYPES[entry.type] || entry.type}**`, entry.text];
  if (entry.userId) lines.push(`• بواسطة: <@${entry.userId}>${entry.userName ? ` (${entry.userName})` : ''}`);
  if (entry.guildId) lines.push(`• السيرفر: ${entry.guildName || ''} \`${entry.guildId}\``);
  await ch.send({ embeds: [ui.embed().setDescription(lines.join('\n')).setTimestamp(entry.at)], allowedMentions: { parse: [] } });
}

module.exports = { init, log, list, TYPES, DEFAULT_CHANNEL_TYPES };
