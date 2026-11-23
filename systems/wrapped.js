// Server Wrapped: a shareable summary card. Monthly (free) — weekly too and a custom accent colour (premium "wrappedPlus").
const { Events, AttachmentBuilder } = require('discord.js');
const path = require('path');
const store = require('../utils/store');
const ui = require('../utils/ui');
const premium = require('../utils/premium');

const DEFAULT = { enabled: false, channelId: '', weekly: false, accent: '#7950E8', tz: 'Asia/Amman' };
const config = (gid) => ({ ...DEFAULT, ...(store.peek('wrappedConfig', gid) || {}) });

const monthKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
const weekKey = (t = Date.now()) => {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `w${d.toISOString().slice(0, 10)}`;
};
const hourIn = (tz) => parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date()), 10);

// wrappedStats: { [gid]: { [periodKey]: { msgs, joins, hours: [24] } } }
function bump(gid, field, tz) {
  const all = store.guild('wrappedStats', gid);
  for (const k of [monthKey(), weekKey()]) {
    const s = (all[k] = all[k] || { msgs: 0, joins: 0, hours: Array(24).fill(0) });
    s[field]++;
    if (field === 'msgs') s.hours[hourIn(tz)]++;
  }
  // keep ~3 months / 6 weeks
  const keys = Object.keys(all).sort();
  for (const k of keys.filter((x) => !x.startsWith('w')).slice(0, -3)) delete all[k];
  for (const k of keys.filter((x) => x.startsWith('w')).slice(0, -6)) delete all[k];
  saveSoon();
}
let t = null;
const saveSoon = () => {
  if (t) return;
  t = setTimeout(() => {
    t = null;
    store.save('wrappedStats');
  }, 30_000);
};

// ---------- data ----------
function collect(guild, period) {
  const isWeek = period.startsWith('w');
  const all = store.peek('levels', guild.id) || {};
  const pick = (e) => {
    if (isWeek) {
      if (e.wk === period.slice(1)) return { tx: e.wtx || 0, vx: e.wvx || 0, echo: 0 };
      if (e.pw?.wk === period.slice(1)) return { tx: e.pw.wtx, vx: e.pw.wvx, echo: 0 };
      return null;
    }
    if (e.mk === period) return { tx: e.mtx || 0, vx: e.mvx || 0, echo: e.mecho || 0 };
    if (e.prev?.mk === period) return { tx: e.prev.mtx, vx: e.prev.mvx, echo: e.prev.mecho };
    return null;
  };
  const rows = Object.entries(all).map(([id, e]) => ({ id, ...(pick(e) || { tx: 0, vx: 0, echo: 0 }) }));
  const top = (k) => rows.filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k])[0] || null;
  const s = store.peek('wrappedStats', guild.id)?.[period] || { msgs: 0, joins: 0, hours: Array(24).fill(0) };
  const peak = s.hours.indexOf(Math.max(...s.hours));
  return { period, isWeek, chatter: top('tx'), voice: top('vx'), echo: isWeek ? null : top('echo'), msgs: s.msgs, joins: s.joins, peakHour: s.msgs ? peak : null, members: guild.memberCount };
}

// ---------- card ----------
let canvas = null;
for (const n of ['canvas', '@napi-rs/canvas']) {
  try {
    canvas = require(n);
    break;
  } catch {}
}
const FONT = 'MarkaSans';
if (canvas?.GlobalFonts && !canvas.GlobalFonts.has?.(FONT)) {
  const dir = path.join(__dirname, '..', 'assets', 'fonts');
  try {
    canvas.GlobalFonts.registerFromPath(path.join(dir, 'DejaVuSans.ttf'), FONT);
    canvas.GlobalFonts.registerFromPath(path.join(dir, 'DejaVuSans-Bold.ttf'), FONT);
  } catch {}
}
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
const hourText = (h) => (h === null ? '—' : `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'ص' : 'م'}`);

async function render(guild, data, accent = '#7950E8') {
  if (!canvas) return null;
  const { createCanvas, loadImage } = canvas;
  const W = 1200;
  const H = 675;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.direction = 'rtl';
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b0c18');
  bg.addColorStop(1, '#171A2A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.8, 0, 10, W * 0.8, 0, 700);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 12) ctx.lineTo(x, 560 + i * 16 + 10 * Math.sin(x / 120 + i * 0.7) + 5 * Math.sin(x / 41 - i));
    ctx.strokeStyle = i % 2 ? 'rgba(145,200,255,.08)' : 'rgba(167,139,250,.09)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  const txt = (s, x, y, size, color = '#F5F5FA', bold = false, align = 'right') => {
    ctx.direction = /[\u0600-\u06FF]/.test(String(s)) ? 'rtl' : 'ltr';
    ctx.font = `${bold ? 'bold ' : ''}${size}px "${FONT}", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(String(s), x, y);
  };
  const [y, m] = data.isWeek ? [] : data.period.split('-').map(Number);
  const title = data.isWeek ? 'ملخص الأسبوع' : `ملخص ${MONTHS[m - 1]} ${y}`;
  txt(title, W - 60, 92, 50, '#fff', true);
  txt(guild.name, W - 60, 140, 28, '#9298AD');

  const fetchName = async (row) => {
    if (!row) return { name: '—', avatar: null };
    const mem = guild.members.cache.get(row.id) || (await guild.members.fetch(row.id).catch(() => null));
    return { name: mem?.displayName || '—', avatar: mem?.displayAvatarURL({ extension: 'png', size: 128 }) };
  };
  const people = await Promise.all([fetchName(data.chatter), fetchName(data.voice), fetchName(data.echo)]);
  const tiles = [
    { label: 'أنشط عضو', value: people[0].name, sub: data.chatter ? `${short(data.chatter.tx)} XP` : '', avatar: people[0].avatar },
    { label: 'ملك الفويس', value: people[1].name, sub: data.voice ? `${short(data.voice.vx)} XP` : '', avatar: people[1].avatar },
    data.isWeek ? { label: 'أعضاء السيرفر', value: short(data.members), sub: '' } : { label: 'صاحب أكثر صدى', value: people[2].name, sub: data.echo ? `${data.echo.echo} صدى` : '', avatar: people[2].avatar },
    { label: 'أعضاء جدد', value: short(data.joins), sub: '' },
    { label: 'رسائل', value: short(data.msgs), sub: '' },
    { label: 'أكثر ساعة تفاعل', value: hourText(data.peakHour), sub: '' },
  ];
  const tw = 340;
  const th = 150;
  for (let i = 0; i < tiles.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = W - 60 - tw - col * (tw + 30);
    const yy = 190 + row * (th + 24);
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    ctx.strokeStyle = 'rgba(167,139,250,.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, yy, tw, th, 20) : ctx.rect(x, yy, tw, th);
    ctx.fill();
    ctx.stroke();
    const t = tiles[i];
    let textRight = x + tw - 24;
    if (t.avatar) {
      try {
        const img = await loadImage(t.avatar);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + tw - 24 - 30, yy + 82, 30, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, x + tw - 24 - 60, yy + 52, 60, 60);
        ctx.restore();
        textRight -= 76;
      } catch {}
    }
    txt(t.label, x + tw - 24, yy + 40, 20, '#9298AD');
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 10, yy, tw - 20, th);
    ctx.clip();
    txt(t.value, textRight, yy + 92, 34, '#fff', true);
    ctx.restore();
    if (t.sub) txt(t.sub, textRight, yy + 124, 18, accent);
  }
  txt('MarkaBot', 60, H - 40, 22, 'rgba(255,255,255,.4)', true, 'left');
  return new AttachmentBuilder(c.toBuffer('image/png'), { name: 'wrapped.png' });
}

async function post(guild, period) {
  const conf = config(guild.id);
  const ch = conf.channelId ? guild.channels.cache.get(conf.channelId) : null;
  if (!ch?.isTextBased()) return false;
  const accent = premium.has(guild.id, 'wrappedPlus') && /^#[0-9a-f]{6}$/i.test(conf.accent) ? conf.accent : '#7950E8';
  const file = await render(guild, collect(guild, period), accent);
  if (!file) return false;
  await ch.send({ content: period.startsWith('w') ? '📊 **ملخص الأسبوع**' : '📊 **ملخص الشهر**', files: [file] }).catch(() => {});
  return true;
}

// post on the 1st of each month (previous month) and Mondays (premium weekly)
async function tick(client) {
  const all = store.get('wrappedConfig');
  for (const [gid, raw] of Object.entries(all)) {
    const conf = { ...DEFAULT, ...raw };
    if (!conf.enabled) continue;
    const guild = client.guilds.cache.get(gid);
    if (!guild) continue;
    const now = new Date();
    const local = new Intl.DateTimeFormat('en-US', { timeZone: conf.tz, day: 'numeric', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
    const p = Object.fromEntries(local.map((x) => [x.type, x.value]));
    if (+p.hour < 12) continue; // post at noon local
    const prevMonth = monthKey(Date.now() - 5 * 86_400_000);
    if (+p.day <= 3 && raw.lastMonth !== prevMonth && prevMonth !== monthKey()) {
      raw.lastMonth = prevMonth;
      store.save('wrappedConfig');
      await post(guild, prevMonth);
    }
    const lastWeek = weekKey(Date.now() - 7 * 86_400_000);
    if (conf.weekly && premium.has(gid, 'wrappedPlus') && p.weekday === 'Mon' && raw.lastWeek !== lastWeek) {
      raw.lastWeek = lastWeek;
      store.save('wrappedConfig');
      await post(guild, lastWeek);
    }
  }
}

function init(client) {
  client.on(Events.MessageCreate, (m) => {
    if (m.guild && !m.author.bot) bump(m.guild.id, 'msgs', config(m.guild.id).tz);
  });
  client.on(Events.GuildMemberAdd, (m) => bump(m.guild.id, 'joins', config(m.guild.id).tz));
  client.once(Events.ClientReady, () => setInterval(() => tick(client).catch((e) => console.error('[wrapped]', e.message)), 15 * 60_000).unref());
}

module.exports = { init, config, DEFAULT, collect, render, post, monthKey, weekKey, bump, hasCanvas: () => Boolean(canvas) };
