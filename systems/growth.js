// Growth: everything that helps the bot spread and keeps the servers that add it.
//   • Onboarding — the owner gets a short "set up in 3 steps" message with a one-click quick setup.
//   • Leave insight — when the bot is removed, the bot log says how long it stayed and what was set up.
//   • "Add Marka" button — a small link under game winners and giveaway results (premium can hide it).
//   • Referrals — a server's code, used by a new server (50+ members): both get 7 days of premium.
//   • Marka Cup — finished games earn points for the server; every week the top server wins premium.
const crypto = require('crypto');
const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const premium = require('../utils/premium');
const { canManageGuild } = require('../utils/perms');

const DAY = 86_400_000;
let client = null;

// ---------- links ----------
function inviteUrl() {
  const id = process.env.CLIENT_ID || client?.user?.id;
  return id ? `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=8` : null;
}
const supportUrl = () => (/^https:\/\/\S+$/.test(process.env.SUPPORT_URL || '') ? process.env.SUPPORT_URL : null);
const dashboardUrl = (gid) => (/^https?:\/\/\S+$/.test(process.env.DASHBOARD_URL || '') ? `${process.env.DASHBOARD_URL.replace(/\/$/, '')}${gid ? `/dashboard/${gid}` : ''}` : null);
const link = (url, label) => new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label);

/** "Add Marka to your server" link under public results. Premium servers can hide it. */
function brandRow(gid) {
  // only real (paid) premium hides it — the free launch period doesn't
  if (process.env.BRAND_BUTTON === '0' || (gid && premium.isPremium?.(gid))) return null;
  const url = inviteUrl();
  return url ? new ActionRowBuilder().addComponents(link(url, 'ضيف ماركا لسيرفرك')) : null;
}

// ---------- onboarding ----------
function onboardPayload(guild) {
  const e = ui
    .embed()
    .setTitle(`أهلاً فيك بماركا`)
    .setDescription(
      [
        `شكراً إنك ضفت البوت لـ **${guild.name}**. ركّبه بـ 3 خطوات:`,
        '',
        '**1. اكبس «تركيب سريع» تحت**',
        '-# بيعمل رومات السجلات وبيشغّل الحماية الأساسية (البوتات الغريبة، الصلاحيات الخطيرة، روابط النصب).',
        '**2. ركّب الترحيب والتذاكر من الداشبورد**',
        '-# كل إشي بالعربي وبدون أوامر.',
        '**3. جرّب اللي بيحبه أعضاءك**',
        '-# `/play` للألعاب • `/azkar-setup` للأذكار • `/ai` للمساعد الذكي • `/apply-setup` لتقديم الإدارة',
        '',
        refOn() ? 'عندك سيرفر ثاني أو صاحبك عنده سيرفر؟ `/refer` بيعطيكم الاثنين أسبوع بريميوم.' : null,
      ]
        .filter((x) => x !== null)
        .join('\n')
    );
  const row = new ActionRowBuilder().addComponents(ui.button(`grow:setup:${guild.id}`, 'تركيب سريع', { style: ButtonStyle.Success }));
  const dash = dashboardUrl(guild.id);
  if (dash) row.addComponents(link(dash, 'الداشبورد'));
  if (supportUrl()) row.addComponents(link(supportUrl(), 'سيرفر الدعم'));
  return { embeds: [e], components: [row] };
}

async function onJoin(guild) {
  const seen = store.get('growthJoins');
  const first = !seen[guild.id];
  seen[guild.id] = { at: Date.now(), count: (seen[guild.id]?.count || 0) + 1 };
  store.save('growthJoins');
  if (!first) return; // came back: no second welcome
  const payload = onboardPayload(guild);
  const owner = await guild.fetchOwner().catch(() => null);
  const dm = owner ? await owner.send(payload).catch(() => null) : null;
  if (dm) return;
  // DMs closed: the system channel, if the bot may write there
  const ch = guild.systemChannel;
  if (ch?.permissionsFor?.(guild.members.me)?.has?.(['SendMessages', 'EmbedLinks'])) await ch.send(payload).catch(() => {});
}

async function quickSetup(guild) {
  const out = [];
  try {
    await require('./logs').autoSetup(guild, { mode: 'grouped' });
    out.push('✓ رومات السجلات جاهزة (6 رومات مقسّمة)');
  } catch (e) {
    out.push(`✕ السجلات: ${e.message}`);
  }
  try {
    const prot = require('./protection');
    const c = prot.config ? prot.config(guild.id) : store.guild('protectionConfig', guild.id);
    for (const k of ['antiBot', 'dangerousPerms', 'antiScam']) c[k] = { ...(c[k] || {}), enabled: true };
    if (premium.has(guild.id, 'antiRaid')) c.antiRaid = { ...(c.antiRaid || {}), enabled: true };
    if (premium.has(guild.id, 'antiNuke')) c.antiNuke = { ...(c.antiNuke || {}), enabled: true };
    store.save('protectionConfig');
    out.push(`✓ الحماية شغّالة: البوتات الغريبة، الصلاحيات الخطيرة، روابط النصب${premium.has(guild.id, 'antiNuke') ? '، Anti-Nuke وAnti-Raid' : ''}`);
  } catch (e) {
    out.push(`✕ الحماية: ${e.message}`);
  }
  return out;
}

// ---------- leave insight ----------
/** What a server had set up — tells us why it may have left. */
function usedFeatures(gid) {
  const has = (key, test = (v) => v && Object.keys(v).length) => test(store.peek(key, gid));
  const list = [];
  if (has('logsConfig', (v) => v && Object.values(v).some((x) => typeof x === 'string' && /^\d{17,}$/.test(x)))) list.push('السجلات');
  if (has('ticketConfig', (v) => v?.categoryId)) list.push('التذاكر');
  if (has('welcome', (v) => v?.channelId || v?.enabled)) list.push('الترحيب');
  if (has('adhkarConfig', (v) => v?.enabled)) list.push('الأذكار');
  if (has('aiConfig', (v) => v?.enabled)) list.push('المساعد الذكي');
  if (has('applyConfig', (v) => v?.enabled)) list.push('التقديم');
  if (has('gameStats')) list.push('الألعاب');
  if (has('levels')) list.push('المستويات');
  return list;
}
function leaveText(guild) {
  const joined = guild.joinedTimestamp || store.peek('growthJoins', guild.id)?.at;
  const days = joined ? Math.max(0, Math.floor((Date.now() - joined) / DAY)) : null;
  const used = usedFeatures(guild.id);
  return `${days === null ? '' : `ضل **${days}** يوم • `}${used.length ? `كان مركّب: ${used.join('، ')}` : 'ما ركّب ولا إشي'}`;
}

// ---------- referrals ----------
function refData() {
  const r = store.get('referrals');
  r.codes ||= {};
  r.used ||= {};
  r.rewards ||= {};
  return r;
}
function codeOf(gid) {
  const r = refData();
  for (const [code, g] of Object.entries(r.codes)) if (g === gid) return code;
  let code;
  do code = crypto.randomBytes(4).toString('base64').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  while (!code || code.length < 5 || r.codes[code]);
  r.codes[code] = gid;
  store.save('referrals');
  return code;
}
const REF_DAYS = () => Number(process.env.REF_DAYS) || 7;
const REF_MIN = () => Number(process.env.REF_MIN_MEMBERS) || 50;

/** Uses a referral code for `guild`. Returns { ok, text }. */
const refOn = () => process.env.REFERRALS === '1';
async function redeemRef(guild, user, rawCode) {
  if (!refOn()) return { ok: false, text: 'برنامج الإحالة موقّف حالياً.' };
  const r = refData();
  const code = String(rawCode || '').trim().toUpperCase();
  const from = r.codes[code];
  if (!from) return { ok: false, text: 'الكود مش صحيح.' };
  if (from === guild.id) return { ok: false, text: 'ما بتقدر تستخدم كود سيرفرك.' };
  if (r.used[guild.id]) return { ok: false, text: 'هالسيرفر استخدم كود إحالة قبل.' };
  const joinedAt = guild.members?.me?.joinedTimestamp || Date.now();
  if (Date.now() - joinedAt > 14 * DAY) return { ok: false, text: 'الكود بينستخدم بأول 14 يوم من إضافة البوت بس.' };
  if ((guild.memberCount || 0) < REF_MIN()) return { ok: false, text: `لازم السيرفر يكون فيه ${REF_MIN()} عضو أو أكثر.` };
  const src = client?.guilds?.cache?.get(from);
  if (!src) return { ok: false, text: 'السيرفر صاحب الكود ما عاد فيه البوت.' };
  if (src.ownerId && src.ownerId === guild.ownerId) return { ok: false, text: 'الكود لازم يكون من سيرفر لشخص ثاني.' };
  // at most 8 rewards a month per referring server
  const recent = (r.rewards[from] || []).filter((t) => Date.now() - t < 30 * DAY);
  r.used[guild.id] = { by: from, at: Date.now(), user: user.id };
  premium.activate(guild.id, REF_DAYS(), { by: 'referral' });
  let both = false;
  if (recent.length < 8) {
    premium.activate(from, REF_DAYS(), { by: 'referral' });
    r.rewards[from] = [...recent, Date.now()];
    both = true;
  }
  store.save('referrals');
  if (both) {
    const owner = await src.fetchOwner?.().catch(() => null);
    owner?.send({ embeds: [ui.embed().setDescription(`سيرفر **${guild.name}** ضاف ماركا بكودك، وأخذ **${src.name}** ${REF_DAYS()} أيام بريميوم. شكراً إنك بتنشر البوت`)] }).catch(() => {});
  }
  return { ok: true, text: `تم! **${guild.name}** أخذ ${REF_DAYS()} أيام بريميوم${both ? `، و**${src.name}** كمان` : ''}.` };
}
function refStats(gid) {
  const r = refData();
  return { code: codeOf(gid), count: Object.values(r.used).filter((u) => u.by === gid).length };
}

// ---------- Marka Cup (weekly, between servers) ----------
function weekKey(t = Date.now()) {
  // weeks start Saturday 00:00 Amman time (UTC+3)
  const d = new Date(t + 3 * 3600_000);
  const day = (d.getUTCDay() + 1) % 7; // Saturday = 0
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) - 3 * 3600_000;
  return { key: new Date(start + 3 * 3600_000).toISOString().slice(0, 10), start, end: start + 7 * DAY };
}
function cup() {
  const c = store.get('tourney');
  const w = weekKey();
  if (!c.week) c.week = w.key;
  c.scores ||= {};
  c.hourly ||= {};
  c.history ||= [];
  return c;
}
/** A finished game in this server: +1, +2 with 4+ players. Capped at 15 points an hour per server. */
function cupPoint(gid, players = 2) {
  if (!gid || players < 2) return 0;
  const c = cup();
  const hour = Math.floor(Date.now() / 3600_000);
  const h = c.hourly[gid]?.h === hour ? c.hourly[gid] : { h: hour, n: 0 };
  const pts = players >= 4 ? 2 : 1;
  if (h.n + pts > 15) return 0;
  h.n += pts;
  c.hourly[gid] = h;
  c.scores[gid] = (c.scores[gid] || 0) + pts;
  store.save('tourney');
  return pts;
}
function cupBoard(limit = 10) {
  const c = cup();
  return Object.entries(c.scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([gid, pts], k) => ({ rank: k + 1, gid, pts, name: client?.guilds?.cache?.get(gid)?.name || 'سيرفر' }));
}
async function cupRoll() {
  const c = cup();
  const now = weekKey();
  if (c.week === now.key) return null;
  const board = cupBoard(3);
  const top = board[0];
  let result = null;
  if (top && top.pts >= 10) {
    premium.activate(top.gid, 7, { by: 'cup' });
    result = { week: c.week, gid: top.gid, name: top.name, pts: top.pts, podium: board };
    c.history.push({ week: c.week, gid: top.gid, name: top.name, pts: top.pts });
    if (c.history.length > 52) c.history.shift();
    const g = client?.guilds?.cache?.get(top.gid);
    const owner = g ? await g.fetchOwner().catch(() => null) : null;
    owner?.send({ embeds: [ui.embed().setTitle('سيرفرك بطل كأس ماركا!').setDescription(`**${g.name}** فاز ببطولة الأسبوع بـ **${top.pts}** نقطة، وأخذ أسبوع بريميوم هدية. مبروك لأعضاءك`)] }).catch(() => {});
    const ch = process.env.TOURNEY_CHANNEL_ID ? await client?.channels?.fetch(process.env.TOURNEY_CHANNEL_ID).catch(() => null) : null;
    if (ch?.isTextBased?.()) {
      const medals = ['🥇', '🥈', '🥉'];
      await ch
        .send({ embeds: [ui.embed().setTitle('نتائج كأس ماركا الأسبوعي').setDescription([...board.map((b, k) => `${medals[k]} **${b.name}** — ${b.pts} نقطة`), '', `-# البطل أخذ أسبوع بريميوم. البطولة الجديدة بلّشت، العبوا \`/play\` بسيرفراتكم 🔥`].join('\n'))] })
        .catch(() => {});
    }
  }
  c.week = now.key;
  c.scores = {};
  c.hourly = {};
  store.save('tourney');
  return result;
}
function cupPayload(gid) {
  const board = cupBoard(10);
  const c = cup();
  const mine = Object.entries(c.scores).sort((a, b) => b[1] - a[1]).findIndex(([g]) => g === gid);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = board.length ? board.map((b) => `${medals[b.rank - 1] || `\`${b.rank}\``} ${b.gid === gid ? `**${b.name}** ←` : b.name} — **${b.pts}**`) : ['لسا ما حدا لعب هالأسبوع، كونوا الأوائل 🔥'];
  const last = c.history[c.history.length - 1];
  return {
    embeds: [
      ui
        .embed()
        .setTitle('كأس ماركا — بطولة السيرفرات')
        .setDescription(
          [
            'كل لعبة بتخلص بسيرفركم بتعطيه نقطة (ونقطتين إذا لعبها 4 أو أكثر). أقوى سيرفر آخر الأسبوع بياخذ **أسبوع بريميوم**.',
            '',
            ...lines,
            '',
            mine >= 0 ? `-# سيرفركم بالمركز **${mine + 1}** • ${c.scores[gid]} نقطة` : '-# سيرفركم لسا ما دخل البطولة — `/play` وابدأوا',
            `-# البطولة بتخلص <t:${Math.floor(weekKey().end / 1000)}:R>${last ? ` • بطل الأسبوع الماضي: ${last.name}` : ''}`,
          ].join('\n')
        ),
    ],
  };
}

// ---------- interactions ----------
async function onButton(i) {
  const [, action, gid] = i.customId.split(':');
  if (action !== 'setup') return;
  const guild = client.guilds.cache.get(gid);
  if (!guild) return i.reply({ content: '• البوت مش بهالسيرفر.', ephemeral: Boolean(i.guild) });
  const member = await guild.members.fetch(i.user.id).catch(() => null);
  if (!member || !canManageGuild(member)) return i.reply({ content: '• التركيب لإدارة السيرفر بس.', ephemeral: Boolean(i.guild) });
  await i.deferReply({ ephemeral: Boolean(i.guild) });
  const lines = await require('../utils/guildContext').run(guild.id, () => quickSetup(guild));
  const dash = dashboardUrl(guild.id);
  return i.editReply({ content: [`**${guild.name}** — التركيب السريع:`, ...lines, '', dash ? `الخطوة الجاية: الترحيب والتذاكر من الداشبورد\n${dash}` : 'الخطوة الجاية: الترحيب والتذاكر من الداشبورد.'].join('\n') });
}

function init(c) {
  client = c;
  c.on(Events.GuildCreate, (g) => onJoin(g).catch((e) => console.error('[growth] join', e.message)));
  c.once(Events.ClientReady, () => {
    cupRoll().catch(() => {});
    setInterval(() => cupRoll().catch((e) => console.error('[growth] cup', e.message)), 10 * 60_000).unref();
  });
}

module.exports = {
  init,
  inviteUrl,
  brandRow,
  onboardPayload,
  quickSetup,
  usedFeatures,
  leaveText,
  codeOf,
  redeemRef,
  refStats,
  refOn,
  cupPoint,
  cupBoard,
  cupRoll,
  cupPayload,
  weekKey,
  _setClient: (x) => (client = x),
  components: [{ prefix: 'grow:', type: 'button', handle: onButton }],
};
