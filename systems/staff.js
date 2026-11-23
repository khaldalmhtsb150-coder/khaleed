// Staff: activity tracking + monthly performance report (free once a month, premium any time — "staffReport"),
// and admin impersonation detection (premium — "impersonation").
const { Events, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const premium = require('../utils/premium');

const MONTH = 30 * 86_400_000;

function isStaff(member) {
  if (!member || member.user.bot) return false;
  const p = member.permissions;
  if (p.has(PermissionFlagsBits.ManageMessages) || p.has(PermissionFlagsBits.ManageGuild) || p.has(PermissionFlagsBits.Administrator)) return true;
  const mgr = store.peek('guildSettings', member.guild.id)?.managerRoleId;
  const sup = store.peek('ticketConfig', member.guild.id)?.supportRoleId;
  return [mgr, sup].some((r) => r && member.roles.cache.has(r));
}

// staffActivity: { [gid]: { [uid]: { last, days: { 'YYYY-MM-DD': msgs } } } }
function track(message) {
  if (!message.guild || message.author.bot || !isStaff(message.member)) return;
  const all = store.guild('staffActivity', message.guild.id);
  const a = (all[message.author.id] = all[message.author.id] || { last: 0, days: {} });
  a.last = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  a.days[day] = (a.days[day] || 0) + 1;
  for (const d of Object.keys(a.days)) if (Date.now() - new Date(d).getTime() > 40 * 86_400_000) delete a.days[d];
  saveSoon();
}
let saveTimer = null;
const saveSoon = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    store.save('staffActivity');
  }, 30_000);
};

/** Builds the report rows for every staff member. */
async function report(guild) {
  await guild.members.fetch().catch(() => {});
  const staff = [...guild.members.cache.values()].filter(isStaff).slice(0, 40);
  const act = store.peek('staffActivity', guild.id) || {};
  const ratings = store.peek('staffRatings', guild.id) || {};
  const tickets = Object.values(store.peek('tickets', guild.id) || {});
  const since = Date.now() - MONTH;
  const levels = require('./levels');
  return staff
    .map((m) => {
      const a = act[m.id] || { last: 0, days: {} };
      const msgs = Object.entries(a.days || {}).filter(([d]) => new Date(d).getTime() >= since).reduce((s, [, n]) => s + n, 0);
      const r = (ratings[m.id]?.ratings || []).filter((x) => x.at >= since);
      return {
        id: m.id,
        name: m.displayName,
        msgs,
        activeDays: Object.keys(a.days || {}).filter((d) => new Date(d).getTime() >= since).length,
        last: a.last || null,
        claimed: tickets.filter((t) => t.claimedBy === m.id && t.openedAt >= since).length,
        closed: tickets.filter((t) => t.closedBy === m.id && (t.closedAt || 0) >= since).length,
        rating: r.length ? r.reduce((s, x) => s + x.stars, 0) / r.length : null,
        ratings: r.length,
        voiceMin: levels.entry(guild.id, m.id).vmin || 0,
      };
    })
    .sort((x, y) => y.claimed + y.closed + y.msgs / 50 - (x.claimed + x.closed + x.msgs / 50));
}

/** Free servers: one report per 30 days. Returns { ok, nextAt }. */
function canReport(guildId) {
  if (premium.has(guildId, 'staffReport')) return { ok: true };
  const last = store.peek('staffReportLast', guildId)?.at || 0;
  return Date.now() - last >= MONTH ? { ok: true } : { ok: false, nextAt: last + MONTH };
}
function markReported(guildId) {
  store.guild('staffReportLast', guildId).at = Date.now();
  store.save('staffReportLast');
}

function reportEmbed(guild, rows) {
  const ago = (t) => (t ? `<t:${Math.floor(t / 1000)}:R>` : 'ما في نشاط');
  const lines = rows.slice(0, 20).map((r, i) => {
    const stars = r.rating ? `${'★'.repeat(Math.round(r.rating))} ${r.rating.toFixed(1)} (${r.ratings})` : '—';
    const warn = !r.last || Date.now() - r.last > 7 * 86_400_000 ? ' ⚠️' : '';
    return `**${i + 1}. <@${r.id}>**${warn}\n${E.dot} تذاكر: استلم ${r.claimed} · سكّر ${r.closed} · تقييم ${stars}\n${E.dot} رسائل: ${r.msgs} · أيام نشاط: ${r.activeDays}/30 · فويس: ${r.voiceMin} د · آخر نشاط ${ago(r.last)}`;
  });
  return ui
    .embed()
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() || undefined })
    .setDescription(`### 📋 تقرير أداء الإدارة — آخر 30 يوم\n${lines.join('\n\n') || 'ما في إداريين.'}\n\n${ui.hint('⚠️ = ما تفاعل من أكثر من أسبوع. الرسائل بتنحسب من يوم ما انضاف البوت.')}`)
    .setTimestamp();
}

// ---------- impersonation (premium) ----------
const CONFUSE = { 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'l' };
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$!|]/g, (c) => CONFUSE[c])
    .replace(/[\s._\-·•'"`~*]+/g, '')
    .replace(/rn/g, 'm');
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Returns the staff member this member is imitating, or null. */
function imitates(member, staffList) {
  if (isStaff(member)) return null;
  const names = [member.user.username, member.user.globalName, member.nickname].filter(Boolean).map(norm).filter((n) => n.length >= 4);
  for (const s of staffList) {
    if (s.id === member.id) continue;
    const sn = [s.user.username, s.user.globalName, s.nickname].filter(Boolean).map(norm).filter((n) => n.length >= 4);
    if (names.some((n) => sn.some((x) => n === x || lev(n, x) <= 1))) return { staff: s, why: 'الاسم' };
    if (member.user.avatar && s.user.avatar && member.user.avatar === s.user.avatar) return { staff: s, why: 'الصورة' };
  }
  return null;
}

const flagged = new Map(); // gid:uid → time (avoid repeats)
async function checkMember(member) {
  if (!member?.guild || member.user.bot) return;
  if (!premium.has(member.guild.id, 'impersonation')) return;
  const conf = require('./protection').config(member.guild.id).impersonation || {};
  if (!conf.enabled) return;
  const key = `${member.guild.id}:${member.id}`;
  if (Date.now() - (flagged.get(key) || 0) < 3_600_000) return;
  const staffList = [...member.guild.members.cache.values()].filter(isStaff);
  const hit = imitates(member, staffList);
  if (!hit) return;
  flagged.set(key, Date.now());
  let done = 'تنبيه فقط';
  if (conf.action === 'timeout' && member.moderatable) {
    await member.timeout(24 * 3_600_000, `انتحال شخصية إداري (${hit.staff.user.username})`).catch(() => {});
    done = 'إسكات 24 ساعة';
  } else if (conf.action === 'kick' && member.kickable) {
    await member.kick(`انتحال شخصية إداري (${hit.staff.user.username})`).catch(() => {});
    done = 'طرد';
  } else if (conf.action === 'ban' && member.bannable) {
    await member.ban({ reason: `انتحال شخصية إداري (${hit.staff.user.username})` }).catch(() => {});
    done = 'حظر';
  }
  const id = require('./protection').config(member.guild.id).alertChannelId;
  const ch = id ? member.guild.channels.cache.get(id) : null;
  await ch
    ?.send({
      embeds: [
        ui
          .embed()
          .setColor(0xf43f5e)
          .setDescription(`**${E.shield} اشتباه انتحال شخصية إداري**\n${E.dot} العضو: ${member} (\`${member.user.username}\`)\n${E.dot} بيشبه: ${hit.staff} (${hit.why})\n${E.dot} الإجراء: ${done}`)
          .setTimestamp(),
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
}

function init(client) {
  client.on(Events.MessageCreate, (m) => {
    try {
      track(m);
    } catch {}
  });
  client.on(Events.GuildMemberAdd, (m) => checkMember(m).catch(() => {}));
  client.on(Events.GuildMemberUpdate, (_, m) => checkMember(m).catch(() => {}));
  client.on(Events.UserUpdate, (_, user) => {
    for (const g of client.guilds.cache.values()) {
      const m = g.members.cache.get(user.id);
      if (m) checkMember(m).catch(() => {});
    }
  });
}

module.exports = { init, isStaff, report, reportEmbed, canReport, markReported, imitates, norm, lev, checkMember };
