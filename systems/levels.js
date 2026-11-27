// Levels: text XP, voice XP, level rewards, leaderboards — and "Echo" (الصدى):
// members who start real conversations earn extra XP when *other* people reply to or react to them.
const { Events, AttachmentBuilder } = require('discord.js');
const path = require('path');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');

// ---------- config ----------
const DEFAULT_CONFIG = {
  enabled: true,
  textMin: 15,
  textMax: 25,
  cooldown: 60, // seconds between XP-earning messages
  minLength: 3, // shorter messages give no XP
  voicePerMin: 10,
  voiceRequireOthers: true, // alone / muted+deafened in voice = no XP
  announce: 'current', // current | channel | dm | off
  announceChannelId: '',
  message: '{user} مبروك! وصلت لفل **{level}** 🎉',
  rewards: [], // [{ level, roleId, type: 'text' | 'voice' }]
  stackRewards: true, // keep lower reward roles when reaching a higher one
  noXpChannels: [],
  noXpRoles: [],
  echo: { enabled: true, reply: 8, reaction: 3, dailyCap: 150 },
};

function config(guildId) {
  const saved = store.peek('levelConfig', guildId) || {};
  return { ...DEFAULT_CONFIG, ...saved, echo: { ...DEFAULT_CONFIG.echo, ...(saved.echo || {}) } };
}

// ---------- math ----------
/** XP needed to go from `level` to `level + 1`. */
const need = (level) => 5 * level * level + 50 * level + 100;
function levelOf(xp) {
  let level = 0;
  let left = xp;
  while (left >= need(level)) {
    left -= need(level);
    level++;
  }
  return { level, current: left, next: need(level) };
}
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** Monday-based week key, e.g. "2026-11-16". */
function weekKey(t = Date.now()) {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const monthKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);

// ---------- data ----------
function entry(guildId, userId) {
  const all = store.guild('levels', guildId);
  if (!all[userId]) all[userId] = { tx: 0, vx: 0, echo: 0, vmin: 0, wk: weekKey(), wtx: 0, wvx: 0 };
  const e = all[userId];
  if (e.wk !== weekKey()) {
    if (e.wk) e.pw = { wk: e.wk, wtx: e.wtx || 0, wvx: e.wvx || 0 };
    Object.assign(e, { wk: weekKey(), wtx: 0, wvx: 0 });
  }
  if (e.mk !== monthKey()) {
    // keep last month's numbers for the monthly server summary
    if (e.mk) e.prev = { mk: e.mk, mtx: e.mtx || 0, mvx: e.mvx || 0, mecho: e.mecho || 0 };
    Object.assign(e, { mk: monthKey(), mtx: 0, mvx: 0, mecho: 0 });
  }
  return e;
}

function board(guildId, type = 'text') {
  const all = store.peek('levels', guildId) || {};
  const wk = weekKey();
  const KEYS = { text: 'tx', voice: 'vx', week: null, echo: 'echo' };
  const key = type in KEYS ? KEYS[type] : 'tx';
  return Object.entries(all)
    .map(([userId, e]) => ({ userId, ...e, score: key ? e[key] || 0 : e.wk === wk ? (e.wtx || 0) + (e.wvx || 0) : 0 }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score);
}

function rankOf(guildId, userId, type = 'text') {
  const i = board(guildId, type).findIndex((e) => e.userId === userId);
  return i < 0 ? null : i + 1;
}

// ---------- rewards & level-up ----------
async function applyRewards(member, conf, type, level) {
  const list = conf.rewards.filter((r) => r.type === type && member.guild.roles.cache.has(r.roleId));
  if (!list.length) return [];
  const earned = list.filter((r) => r.level <= level).sort((a, b) => b.level - a.level);
  const keep = conf.stackRewards ? earned : earned.slice(0, 1);
  const drop = list.filter((r) => !keep.includes(r));
  const added = [];
  for (const r of keep) {
    if (member.roles.cache.has(r.roleId)) continue;
    const role = member.guild.roles.cache.get(r.roleId);
    if (!role?.editable) continue;
    if (await member.roles.add(role, `مكافأة لفل ${r.level}`).then(() => true).catch(() => false)) added.push(role);
  }
  for (const r of drop) {
    if (!member.roles.cache.has(r.roleId) || r.level <= level) continue;
    await member.roles.remove(r.roleId, 'رتبة مكافأة لفل أعلى من لفل العضو').catch(() => {});
  }
  if (!conf.stackRewards) {
    for (const r of earned.slice(1)) if (member.roles.cache.has(r.roleId)) await member.roles.remove(r.roleId, 'استبدال برتبة لفل أعلى').catch(() => {});
  }
  return added;
}

function fill(text, member, level, type) {
  return String(text || '')
    .replaceAll('{user}', `${member}`)
    .replaceAll('{username}', member.displayName || member.user.username)
    .replaceAll('{level}', String(level))
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{type}', type === 'voice' ? 'الفويس' : 'الكتابة');
}

async function levelUp(member, conf, type, level, sourceChannel) {
  const added = await applyRewards(member, conf, type, level);
  if (conf.announce === 'off') return;
  if (type === 'voice' && conf.announce === 'current') return; // no chat context for voice, like ProBot
  let content = fill(conf.message, member, level, type);
  if (type === 'voice') content += ` ${ui.hint('لفل الفويس')}`;
  if (added.length) content += `\n${E.gift} حصلت على: ${added.map((r) => `**${r.name}**`).join('، ')}`;
  const payload = { content, allowedMentions: { users: [member.id] } };
  if (conf.announce === 'dm') return member.send({ ...payload, content: `**${member.guild.name}** — ${content}` }).catch(() => {});
  const ch = conf.announce === 'channel' ? member.guild.channels.cache.get(conf.announceChannelId) : sourceChannel;
  if (ch?.isTextBased?.()) await ch.send(payload).catch(() => {});
}

/** Adds XP and handles level-ups. kind: 'text' | 'voice' */
/** Premium XP boost: the highest matching role / channel multiplier. */
function boostOf(member, channel, conf) {
  const b = conf.boosts;
  if (!b || !require('../utils/premium').has(member.guild.id, 'xpBoost')) return 1;
  let m = 1;
  for (const r of b.roles || []) if (member.roles.cache.has(r.roleId)) m = Math.max(m, r.multiplier);
  for (const c of b.channels || []) if (channel && (channel.id === c.channelId || channel.parentId === c.channelId)) m = Math.max(m, c.multiplier);
  return Math.min(5, m);
}

async function addXp(member, amount, kind, sourceChannel = null, conf = config(member.guild.id), voiceChannel = null) {
  if (!amount) return;
  if (amount > 0) amount = Math.round(amount * boostOf(member, sourceChannel || voiceChannel, conf));
  const e = entry(member.guild.id, member.id);
  const key = kind === 'voice' ? 'vx' : 'tx';
  const before = levelOf(e[key]).level;
  e[key] = Math.max(0, e[key] + amount);
  if (amount > 0) {
    e[kind === 'voice' ? 'wvx' : 'wtx'] += amount;
    e[kind === 'voice' ? 'mvx' : 'mtx'] += amount;
  }
  store.save('levels');
  const after = levelOf(e[key]).level;
  if (after > before) await levelUp(member, conf, kind, after, sourceChannel);
}

// ---------- eligibility ----------
function blocked(member, channel, conf) {
  if (!conf.enabled || member.user.bot) return true;
  if (channel && (conf.noXpChannels.includes(channel.id) || (channel.parentId && conf.noXpChannels.includes(channel.parentId)))) return true;
  if (channel?.isThread?.() && conf.noXpChannels.includes(channel.parentId)) return true;
  return conf.noXpRoles.some((r) => member.roles.cache.has(r));
}

// in-memory anti-spam state (resets on restart, which is fine)
const lastXp = new Map(); // guild:user → timestamp
const lastText = new Map(); // guild:user → normalized text
const echoPairs = new Map(); // guild:target:source:kind → timestamp

const norm = (s) => String(s || '').toLowerCase().replace(/<a?:\w+:\d+>|https?:\/\/\S+|\s+/g, ' ').trim();

async function onMessage(message) {
  if (!message.guild || message.author.bot || !message.member) return;
  const conf = config(message.guild.id);
  if (blocked(message.member, message.channel, conf)) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const text = norm(message.content);
  const hasMedia = message.attachments.size > 0 || message.stickers.size > 0;

  // text XP: cooldown + quality (no tiny or repeated messages)
  const now = Date.now();
  const okLength = text.replace(/\s/g, '').length >= conf.minLength || hasMedia;
  const repeated = text && lastText.get(key) === text;
  if (okLength && !repeated && now - (lastXp.get(key) || 0) >= conf.cooldown * 1000) {
    lastXp.set(key, now);
    lastText.set(key, text);
    await addXp(message.member, rand(conf.textMin, conf.textMax), 'text', message.channel, conf);
  } else if (text) {
    lastText.set(key, text);
  }

  // Echo: a reply gives the *original author* XP
  if (conf.echo.enabled && message.reference?.messageId) {
    const ref = await message.fetchReference().catch(() => null);
    if (ref?.author && !ref.author.bot && ref.author.id !== message.author.id && okLength) {
      await giveEcho(message.guild, ref.author.id, message.author.id, 'reply', message.channel, conf);
    }
  }
}

async function giveEcho(guild, targetId, sourceId, kind, channel, conf) {
  const pair = `${guild.id}:${targetId}:${sourceId}:${kind}`;
  const now = Date.now();
  if (now - (echoPairs.get(pair) || 0) < 30 * 60_000) return; // same person can echo you once / 30 min
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (!member || blocked(member, channel, conf)) return;
  const e = entry(guild.id, targetId);
  if (e.echoDay !== dayKey()) Object.assign(e, { echoDay: dayKey(), echoToday: 0 });
  const amount = Math.min(kind === 'reply' ? conf.echo.reply : conf.echo.reaction, conf.echo.dailyCap - e.echoToday);
  if (amount <= 0) return;
  echoPairs.set(pair, now);
  e.echoToday += amount;
  e.echo = (e.echo || 0) + 1;
  e.mecho = (e.mecho || 0) + 1;
  await addXp(member, amount, 'text', channel, conf);
}

async function onReaction(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) reaction = await reaction.fetch().catch(() => null);
  const msg = reaction?.message?.partial ? await reaction.message.fetch().catch(() => null) : reaction?.message;
  if (!msg?.guild || !msg.author || msg.author.bot || msg.author.id === user.id) return;
  const conf = config(msg.guild.id);
  if (!conf.enabled || !conf.echo.enabled) return;
  // only fresh messages (last 24h) can echo
  if (Date.now() - msg.createdTimestamp > 86_400_000) return;
  await giveEcho(msg.guild, msg.author.id, user.id, 'reaction', msg.channel, conf);
}

// ---------- voice ----------
async function voiceTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const conf = config(guild.id);
    if (!conf.enabled || !conf.voicePerMin) continue;
    const byChannel = new Map();
    for (const vs of guild.voiceStates.cache.values()) {
      if (!vs.channelId || !vs.member || vs.member.user.bot) continue;
      if (vs.channelId === guild.afkChannelId) continue;
      if (!byChannel.has(vs.channelId)) byChannel.set(vs.channelId, []);
      byChannel.get(vs.channelId).push(vs);
    }
    for (const [, states] of byChannel) {
      const active = states.filter((vs) => !(vs.selfDeaf || vs.serverDeaf));
      if (conf.voiceRequireOthers && active.length < 2) continue;
      for (const vs of active) {
        if (vs.selfMute && vs.selfDeaf) continue;
        if (blocked(vs.member, vs.channel, conf)) continue;
        entry(guild.id, vs.member.id).vmin += 1;
        await addXp(vs.member, conf.voicePerMin, 'voice', null, conf, vs.channel).catch(() => {});
      }
    }
  }
}

// ---------- rank card ----------
let canvas = null;
for (const name of ['canvas', '@napi-rs/canvas']) {
  try {
    canvas = require(name);
    break;
  } catch {}
}
const FONT = 'MarkaSans'; // registered by systems/welcome.js (same bundled DejaVu fonts)
if (canvas) {
  const dir = path.join(__dirname, '..', 'assets', 'fonts');
  try {
    if (canvas.GlobalFonts && !canvas.GlobalFonts.has?.(FONT)) {
      canvas.GlobalFonts.registerFromPath(path.join(dir, 'DejaVuSans.ttf'), FONT);
      canvas.GlobalFonts.registerFromPath(path.join(dir, 'DejaVuSans-Bold.ttf'), FONT);
    } else if (canvas.registerFont) {
      canvas.registerFont(path.join(dir, 'DejaVuSans.ttf'), { family: FONT });
      canvas.registerFont(path.join(dir, 'DejaVuSans-Bold.ttf'), { family: FONT, weight: 'bold' });
    }
  } catch {}
}

const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, s, x, y, { size = 24, color = '#F5F5FA', bold = false, align = 'left', max } = {}) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px "${FONT}", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('direction' in ctx) ctx.direction = 'ltr'; // bidi still shapes Arabic; a fixed base keeps names at the same x
  ctx.fillText(String(s), x, y, max);
}

async function renderCard(member) {
  if (!canvas) return null;
  const { createCanvas, loadImage } = canvas;
  const W = 934;
  const H = 300;
  const gid = member.guild.id;
  const e = entry(gid, member.id);
  const t = levelOf(e.tx);
  const v = levelOf(e.vx);
  const rank = rankOf(gid, member.id, 'text');
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // background
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.save();
  ctx.clip();
  const conf = config(gid);
  const custom = require('../utils/premium').has(gid, 'rankCard') ? conf.card || {} : {};
  const accent = /^#[0-9a-f]{6}$/i.test(custom.accent || '') ? custom.accent : '#6E56CF';
  ctx.fillStyle = '#0B0D12';
  ctx.fillRect(0, 0, W, H);
  if (custom.background) {
    try {
      const media = require('../utils/media');
      const img = await loadImage(media.localPath(custom.background) || custom.background);
      const scale = Math.max(W / img.width, H / img.height);
      ctx.drawImage(img, (W - img.width * scale) / 2, (H - img.height * scale) / 2, img.width * scale, img.height * scale);
      ctx.fillStyle = 'rgba(8,9,18,.62)';
      ctx.fillRect(0, 0, W, H);
    } catch {}
  }
  // flat: the avatar side on a slightly lighter panel, a hairline between, the accent band at the edge
  if (!custom.background) {
    ctx.fillStyle = '#151924';
    ctx.fillRect(0, 0, 284, H);
  }
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fillRect(284, 0, 2, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 8, H);
  ctx.restore();

  // avatar
  const ax = 150;
  const ay = 150;
  const ar = 92;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.clip();
  try {
    ctx.drawImage(await loadImage(member.displayAvatarURL({ extension: 'png', size: 256 })), ax - ar, ay - ar, ar * 2, ar * 2);
  } catch {
    ctx.fillStyle = '#151924';
    ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(ax, ay, ar + 5, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.stroke();

  // name + rank / level
  const left = 316;
  const right = W - 48;
  text(ctx, member.displayName || member.user.username, left, 92, { size: 38, bold: true, max: 360 });
  text(ctx, `LVL ${t.level}`, right, 92, { size: 40, bold: true, color: accent, align: 'right' });
  ctx.font = `bold 40px "${FONT}", sans-serif`;
  const lvlW = ctx.measureText(`LVL ${t.level}`).width;
  text(ctx, rank ? `#${rank}` : '#—', right - lvlW - 24, 92, { size: 40, bold: true, color: '#F3F4F6', align: 'right' });

  // progress bar
  const bx = left;
  const by = 128;
  const bw = right - left;
  const bh = 34;
  roundRect(ctx, bx, by, bw, bh, bh / 2);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.fill();
  const pct = Math.max(0.02, Math.min(1, t.current / t.next));
  roundRect(ctx, bx, by, Math.max(bh, bw * pct), bh, bh / 2);
  ctx.fillStyle = accent;
  ctx.fill();
  text(ctx, `${short(t.current)} / ${short(t.next)} XP`, right, by + bh + 32, { size: 22, color: '#9AA1AD', align: 'right' });

  // bottom stats: voice level, echo, weekly
  const stat = (x, label, value, color) => {
    text(ctx, value, x, 262, { size: 28, bold: true, color });
    text(ctx, label, x, 286, { size: 16, color: '#9AA1AD' });
  };
  stat(left, 'VOICE LVL', String(v.level), '#F3F4F6');
  stat(left + 170, 'ECHO', short(e.echo || 0), '#F3F4F6');
  stat(left + 320, 'THIS WEEK', `${short((e.wtx || 0) + (e.wvx || 0))} XP`, '#F5F5FA');
  text(ctx, 'MarkaBot', right, 286, { size: 16, bold: true, color: 'rgba(255,255,255,.35)', align: 'right' });

  return new AttachmentBuilder(c.toBuffer('image/png'), { name: 'rank.png' });
}

// ---------- init ----------
function init(client) {
  client.on(Events.MessageCreate, (m) => onMessage(m).catch((e) => console.error('[levels]', e.message)));
  client.on(Events.MessageReactionAdd, (r, u) => onReaction(r, u).catch((e) => console.error('[levels]', e.message)));
  client.once(Events.ClientReady, () => {
    setInterval(() => voiceTick(client).catch((e) => console.error('[levels] voice', e.message)), 60_000).unref();
  });
}

module.exports = { monthKey, boostOf, init, config, DEFAULT_CONFIG, entry, board, rankOf, levelOf, need, addXp, applyRewards, renderCard, weekKey, voiceTick, __voiceTick: voiceTick, hasCanvas: () => Boolean(canvas) };
