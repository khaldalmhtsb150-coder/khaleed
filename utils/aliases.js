// Per-server command shortcuts (like ProBot): e.g. "باند" → ban
const store = require('./store');

const MAX_PER_COMMAND = 5;
const VALID = /^[\p{L}\p{N}_\-.!?$#]{1,20}$/u;

function ofGuild(guildId) {
  return store.get('commandAliases')[guildId] || {};
}

/** Find the command name for a shortcut in this server. */
function resolve(guildId, word) {
  if (!guildId || !word) return null;
  const w = word.toLowerCase();
  for (const [cmd, list] of Object.entries(ofGuild(guildId))) {
    if (list.includes(w)) return cmd;
  }
  return null;
}

/** Validate & save the shortcuts of one command. Returns { ok } or { error }. */
function setFor(guildId, commandName, input, lookup) {
  const list = [...new Set((Array.isArray(input) ? input : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean))];
  if (list.length > MAX_PER_COMMAND) return { error: `الحد الأقصى ${MAX_PER_COMMAND} اختصارات لكل أمر` };
  const current = ofGuild(guildId);
  for (const a of list) {
    if (!VALID.test(a)) return { error: `الاختصار «${a}» غير صالح (بدون مسافات، حتى 20 حرفاً)` };
    const builtIn = lookup.get(a);
    if (builtIn && builtIn.name !== commandName) return { error: `«${a}» مستخدم كاسم للأمر ${builtIn.name}` };
    for (const [cmd, other] of Object.entries(current)) {
      if (cmd !== commandName && other.includes(a)) return { error: `«${a}» مستخدم كاختصار للأمر ${cmd}` };
    }
  }
  const all = store.get('commandAliases');
  if (!all[guildId]) all[guildId] = {};
  if (list.length) all[guildId][commandName] = list;
  else delete all[guildId][commandName];
  store.save('commandAliases');
  return { ok: true, aliases: list };
}

module.exports = { ofGuild, resolve, setFor, MAX_PER_COMMAND };
