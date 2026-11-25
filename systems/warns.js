// Warnings with automatic punishments: e.g. 3 warnings → 1h timeout, 5 → kick, 7 → ban.
// Old warnings can expire after N days. Everything is logged to the moderation log.
const store = require('../utils/store');
const logs = require('./logs');

const DEFAULT = {
  expireDays: 0, // 0 = never
  dm: true,
  steps: [
    { count: 3, action: 'timeout', minutes: 60 },
    { count: 5, action: 'kick' },
    { count: 7, action: 'ban' },
  ],
};
const config = (gid) => {
  const c = store.peek('warnConfig', gid) || {};
  return { ...DEFAULT, ...c, steps: Array.isArray(c.steps) ? c.steps : DEFAULT.steps };
};
const ACTION_AR = { timeout: 'تايم أوت', kick: 'طرد', ban: 'حظر' };

function list(gid, uid) {
  const all = store.guild('warnings', gid)[uid] || [];
  const days = config(gid).expireDays;
  return days ? all.filter((w) => Date.now() - w.at < days * 86_400_000) : all;
}

async function add(guild, member, by, reason) {
  const map = store.guild('warnings', guild.id);
  const arr = (map[member.id] = map[member.id] || []);
  const id = (arr.reduce((m, w) => Math.max(m, w.id), 0) || 0) + 1;
  const warn = { id, by, reason: String(reason || 'بدون سبب').slice(0, 300), at: Date.now() };
  arr.push(warn);
  store.save('warnings');
  const count = list(guild.id, member.id).length;
  const conf = config(guild.id);
  const step = conf.steps.find((s) => Number(s.count) === count);
  let applied = null;
  if (step) {
    const why = `وصل ${count} تحذيرات`;
    try {
      if (step.action === 'timeout') await member.timeout(Math.min(40320, Number(step.minutes) || 60) * 60_000, why);
      else if (step.action === 'kick') await member.kick(why);
      else if (step.action === 'ban') await guild.members.ban(member.id, { reason: why });
      applied = step.action === 'timeout' ? `${ACTION_AR.timeout} ${step.minutes || 60} دقيقة` : ACTION_AR[step.action];
    } catch {
      applied = `${ACTION_AR[step.action]} (ما زبط، رتبته أعلى؟)`;
    }
  }
  if (conf.dm) member.send(`⚠️ أخذت تحذير بـ **${guild.name}**\nالسبب: ${warn.reason}\nعدد تحذيراتك: **${count}**${applied ? `\nالعقوبة: **${applied}**` : ''}`).catch(() => {});
  logs.modAction(guild, { title: `تحذير #${id}`, target: member.id, by, reason: warn.reason, extra: `**صار معه:** ${count} تحذير${applied ? ` • **العقوبة التلقائية:** ${applied}` : ''}`, icon: 'bell', color: 0xffb02e });
  return { warn, count, applied };
}

function remove(guild, uid, id, by) {
  const map = store.guild('warnings', guild.id);
  const before = (map[uid] || []).length;
  if (id === 'all') map[uid] = [];
  else map[uid] = (map[uid] || []).filter((w) => w.id !== Number(id));
  store.save('warnings');
  const removed = before - map[uid].length;
  if (removed) logs.modAction(guild, { title: id === 'all' ? 'مسح كل التحذيرات' : `حذف تحذير #${id}`, target: uid, by, icon: 'release', color: 0x2fd27a });
  return removed;
}

module.exports = { DEFAULT, config, list, add, remove, ACTION_AR };
