// Central emoji dictionary.
// Values come from /data/emojis.json (editable from the dashboard) and fall back to
// plain typographic symbols — never default Unicode emojis.
const store = require('./store');

const FALLBACK = {
  // UI
  success: '✓',
  error: '✕',
  warning: '△',
  loading: '…',
  dot: '•',
  star: '★',
  crown: '♔',
  heart: '♡',
  upvote: '▲',
  downvote: '▼',
  // Systems
  gift: '◆',
  timer: '◷',
  wheel: '◎',
  ticket: '▤',
  coins: '◉',
  announce: '»',
  shield: '◈',
  lock: '■',
  unlock: '□',
  ban: '⊘',
  show: '○',
  hide: '●',
  brokenLink: '⌀',
  // Logs
  joinLeave: '⇄',
  edit: '✎',
  delete: '⌫',
  voice: '♪',
  roles: '◇',
  settings: '≡',
  // Giveaway
  gwHost: '<:emoji_65:1571539092045430816>',
  gwEnds: '<:emoji_72:1571539597853462638>',
  gwWinners: '<:emoji_62:1571538811366936606>',
};

const GROUPS = {
  ui: ['success', 'error', 'warning', 'loading', 'dot', 'star', 'crown', 'heart', 'upvote', 'downvote'],
  systems: ['gift', 'timer', 'wheel', 'ticket', 'coins', 'announce', 'shield', 'lock', 'unlock', 'ban', 'show', 'hide', 'brokenLink'],
  logs: ['joinLeave', 'edit', 'delete', 'voice', 'roles', 'settings'],
  giveaway: ['gwHost', 'gwEnds', 'gwWinners'],
};

const KEYS = Object.keys(FALLBACK);
const CUSTOM_RE = /^<(a?):([\w~]{2,32}):(\d{17,21})>$/;

/** Normalises whatever the user pasted: `<:name:id>`, `<a:name:id>`, `name:id` or a bare id. */
function normalize(input) {
  if (!input) return '';
  const value = String(input).trim();
  if (CUSTOM_RE.test(value)) return value;
  const pair = value.match(/^(a:)?([\w~]{2,32}):(\d{17,21})$/);
  if (pair) return `<${pair[1] ? 'a' : ''}:${pair[2]}:${pair[3]}>`;
  if (/^\d{17,21}$/.test(value)) return `<:e:${value}>`;
  return '';
}

// Premium servers can override the bot's emojis with their own (dashboard → إيموجيات السيرفر).
// The active server comes from utils/guildContext (set for every event / dashboard request).
let premium = null;
let gctx = null;
function guildValue(key) {
  premium = premium || require('./premium');
  gctx = gctx || require('./guildContext');
  const gid = gctx.current();
  if (!gid || !premium.has(gid, 'guildEmojis')) return '';
  const v = store.peek('guildEmojis', gid)?.[key];
  return v && CUSTOM_RE.test(v) ? v : '';
}

/** The stored value for key: server override (premium) → global custom → '' */
function stored(key) {
  return guildValue(key) || store.get('emojis')[key] || '';
}

// The bot's own icon set (application emojis, see systems/appEmojis) stands in for the
// plain symbols when no custom emoji was set for a key.
const ICON_FOR = { success: 'check', error: 'cancel', crown: 'crown', star: 'star', gift: 'gift', timer: 'timer', ticket: 'ticket', shield: 'shield', lock: 'lock', unlock: 'unlock', show: 'show', hide: 'hide', edit: 'rename', voice: 'voice', announce: 'megaphone', wheel: 'dice', ban: 'kick', settings: 'repair', delete: 'cancel', roles: 'players', joinLeave: 'door', heart: 'life', warning: 'bell' };
let art = null;
function appIcon(key) {
  art = art || require('./art');
  return art.icon(ICON_FOR[key] || key);
}

function raw(key) {
  const custom = stored(key);
  if (custom && CUSTOM_RE.test(custom)) return custom;
  const a = appIcon(key);
  return a ? `<:${a.name}:${a.id}>` : FALLBACK[key] || '•';
}

function isCustom(key) {
  return CUSTOM_RE.test(stored(key));
}

/** Component emoji object (buttons / select options) — only for custom emojis, symbols are not valid there. */
function component(key) {
  const m = stored(key).match(CUSTOM_RE);
  if (m) return { id: m[3], name: m[2], animated: m[1] === 'a' };
  return appIcon(key);
}

/** Value usable for message reactions — custom only. */
function reaction(key) {
  const m = stored(key).match(CUSTOM_RE);
  return m ? `${m[2]}:${m[3]}` : null;
}

const E = { KEYS, GROUPS, FALLBACK, CUSTOM_RE, normalize, isCustom, component, reaction, raw };
for (const key of KEYS) {
  Object.defineProperty(E, key, { get: () => raw(key), enumerable: true });
}

module.exports = E;
