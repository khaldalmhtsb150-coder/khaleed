const { AttachmentBuilder } = require('discord.js');
const store = require('../utils/store');

const path = require('path');
const media = require('../utils/media');
const premium = require('../utils/premium');

// canvas: "canvas" (node-canvas) or "@napi-rs/canvas" — whichever is installed.
let canvas = null;
for (const name of ['canvas', '@napi-rs/canvas']) {
  try {
    canvas = require(name);
    break;
  } catch {}
}
if (!canvas) console.warn('[welcome] no canvas library installed — welcome images are disabled, text messages still work.');

// Font with Arabic + Latin glyphs, bundled so hosting without system fonts still renders names.
const FONT = 'MarkaSans';
if (canvas) {
  const dir = path.join(__dirname, '..', 'assets', 'fonts');
  try {
    if (canvas.registerFont) {
      canvas.registerFont(path.join(dir, 'DejaVuSans.ttf'), { family: FONT });
      canvas.registerFont(path.join(dir, 'DejaVuSans-Bold.ttf'), { family: FONT, weight: 'bold' });
    } else if (canvas.GlobalFonts) {
      canvas.GlobalFonts.registerFromPath(path.join(dir, 'DejaVuSans.ttf'), FONT);
      canvas.GlobalFonts.registerFromPath(path.join(dir, 'DejaVuSans-Bold.ttf'), FONT);
    }
  } catch (e) {
    console.warn('[welcome] font not loaded:', e.message);
  }
}

const W = 1024;
const H = 500;

/** All welcome-image settings with defaults. Premium-only parts are switched off on free servers. */
const LAYOUT_DEFAULTS = {
  avatarX: 512,
  avatarY: 210,
  avatarRadius: 100,
  avatarShape: 'circle', // circle | rounded | square
  avatarBorderColor: '#ffffff',
  avatarBorderWidth: 6,
  nameEnabled: true,
  nameX: 512,
  nameY: 360,
  nameSize: 46,
  nameColor: '#ffffff',
  nameAlign: 'center',
  textEnabled: false,
  text: 'Welcome to {server}',
  textX: 512,
  textY: 420,
  textSize: 30,
  textColor: '#e5e7eb',
  textAlign: 'center',
};

function layout(conf, isPremium) {
  const l = { ...LAYOUT_DEFAULTS, ...(conf || {}) };
  if (!isPremium) {
    // free plan: avatar position only, classic look
    Object.assign(l, {
      avatarShape: 'circle',
      avatarBorderColor: '#ffffff',
      avatarBorderWidth: 6,
      nameEnabled: false,
      textEnabled: false,
    });
  }
  return l;
}

function fill(template, member, inviter) {
  let invites = 0;
  if (inviter) {
    const e = store.peek('invites', member.guild.id)?.[inviter.id];
    invites = (e?.regular || 0) + (e?.bonus || 0);
  }
  return String(template)
    .replace(/{user}/g, `${member}`)
    .replace(/{username}/g, member.user.username)
    .replace(/{server}/g, member.guild.name)
    .replace(/{membercount}/g, `${member.guild.memberCount}`)
    .replace(/{inviter}/g, inviter ? `<@${inviter.id}>` : 'غير معروف')
    .replace(/{invites}/g, `${invites}`);
}

/** Same as fill() but for text drawn on the image (no mentions). */
function fillPlain(template, member) {
  return String(template)
    .replace(/{user}|{username}/g, member.displayName || member.user.username)
    .replace(/{server}/g, member.guild.name)
    .replace(/{membercount}/g, `${member.guild.memberCount}`)
    .replace(/{inviter}|{invites}/g, '');
}

function shapePath(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'square' || shape === 'rounded') {
    const rad = shape === 'rounded' ? r * 0.28 : 0;
    const left = x - r;
    const top = y - r;
    const size = r * 2;
    ctx.moveTo(left + rad, top);
    ctx.arcTo(left + size, top, left + size, top + size, rad);
    ctx.arcTo(left + size, top + size, left, top + size, rad);
    ctx.arcTo(left, top + size, left, top, rad);
    ctx.arcTo(left, top, left + size, top, rad);
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.closePath();
}

function drawText(ctx, text, { x, y, size, color, align }) {
  if (!text) return;
  ctx.save();
  ctx.font = `bold ${size}px "${FONT}", sans-serif`;
  ctx.fillStyle = color;
  const a = ['left', 'right', 'center'].includes(align) ? align : 'center';
  ctx.textAlign = a;
  ctx.textBaseline = 'middle';
  // Arabic-first text reads right-to-left (keeps numbers/latin words in the right order)
  const firstStrong = String(text).match(/[A-Za-z\u0590-\u08FF]/)?.[0] || '';
  if ('direction' in ctx) ctx.direction = /[\u0590-\u08FF]/.test(firstStrong) ? 'rtl' : 'ltr';
  const room = a === 'left' ? W - x - 16 : a === 'right' ? x - 16 : 2 * Math.min(x, W - x) - 16;
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillText(text, x, y, Math.max(60, room));
  ctx.restore();
}

function backgroundSource(url) {
  return media.localPath(url) || url;
}

async function renderImage(member, conf) {
  if (!canvas || !conf.imageUrl) return null;
  try {
    const { createCanvas, loadImage } = canvas;
    const l = layout(conf, premium.has(member.guild.id, 'welcomeEditor'));
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');

    // background — cover fit
    const bg = await loadImage(backgroundSource(conf.imageUrl));
    const scale = Math.max(W / bg.width, H / bg.height);
    const bw = bg.width * scale;
    const bh = bg.height * scale;
    ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);

    // avatar
    const { avatarX: x, avatarY: y, avatarRadius: r } = l;
    ctx.save();
    shapePath(ctx, l.avatarShape, x, y, r);
    ctx.clip();
    ctx.drawImage(await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 512 })), x - r, y - r, r * 2, r * 2);
    ctx.restore();
    if (l.avatarBorderWidth > 0) {
      ctx.strokeStyle = l.avatarBorderColor;
      ctx.lineWidth = l.avatarBorderWidth;
      shapePath(ctx, l.avatarShape, x, y, r);
      ctx.stroke();
    }

    if (l.nameEnabled) {
      drawText(ctx, member.displayName || member.user.username, { x: l.nameX, y: l.nameY, size: l.nameSize, color: l.nameColor, align: l.nameAlign });
    }
    if (l.textEnabled) {
      drawText(ctx, fillPlain(l.text, member), { x: l.textX, y: l.textY, size: l.textSize, color: l.textColor, align: l.textAlign });
    }

    const buffer = c.toBuffer ? c.toBuffer('image/png') : await c.encode('png');
    return new AttachmentBuilder(buffer, { name: 'welcome.png' });
  } catch (err) {
    console.error('[welcome] image', err.message);
    return null;
  }
}

async function sendWelcome(member, inviter, { force = false } = {}) {
  const conf = store.peek('welcome', member.guild.id);
  if (!conf || (!conf.enabled && !force) || !conf.channelId) return false;
  const ch = member.guild.channels.cache.get(conf.channelId);
  if (!ch?.isTextBased()) return false;
  const file = await renderImage(member, conf);
  const content = conf.message ? fill(conf.message, member, inviter) : undefined;
  if (!file && !content) return false;
  await ch.send({ content, files: file ? [file] : [], allowedMentions: { users: [member.id] } });
  return true;
}

/** All greet channels (the old single channelId still counts). */
function greetChannels(conf) {
  const ids = Array.isArray(conf?.channelIds) ? [...conf.channelIds] : [];
  if (conf?.channelId && !ids.includes(conf.channelId)) ids.unshift(conf.channelId);
  return ids.slice(0, 10);
}

async function sendGreeting(member, { force = false } = {}) {
  const conf = store.peek('greetings', member.guild.id);
  const ids = greetChannels(conf);
  if (!conf || (!conf.enabled && !force) || !ids.length || !conf.message) return false;
  const content = fill(conf.message, member, null);
  let sent = 0;
  for (const id of ids) {
    const ch = member.guild.channels.cache.get(id);
    if (!ch?.isTextBased()) continue;
    const msg = await ch.send({ content, allowedMentions: { users: [member.id] } }).catch(() => null);
    if (!msg) continue;
    sent++;
    if (conf.duration > 0) setTimeout(() => msg.delete().catch(() => {}), conf.duration * 1000);
  }
  return sent > 0;
}

async function onJoin(member, inviter) {
  await sendWelcome(member, inviter).catch((e) => console.error('[welcome]', e.message));
  await sendGreeting(member).catch((e) => console.error('[greeting]', e.message));
}

module.exports = { greetChannels, onJoin, sendWelcome, sendGreeting, fill, renderImage, layout, LAYOUT_DEFAULTS, W, H, hasCanvas: () => Boolean(canvas) };
