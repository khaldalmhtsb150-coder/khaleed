// MarkaBot visual identity at runtime: ready-made banners (assets/art/banner), the bot's own
// application emojis (uploaded by systems/appEmojis from assets/art/emoji) and a few live images
// (winner card, khatma board) drawn with the same palette and font.
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

const ART = path.join(__dirname, '..', 'assets', 'art');
const FONTS = path.join(__dirname, '..', 'assets', 'fonts');
let manifest = { icons: [], banners: {} };
try {
  manifest = JSON.parse(fs.readFileSync(path.join(ART, 'manifest.json'), 'utf8'));
} catch {}

// ---------- app emojis ----------
const VERSION = 'mk1'; // bump when the icon designs change → fresh uploads
const icons = new Map(); // key → { id, name }
const iconName = (key) => `${VERSION}_${key}`.slice(0, 32);

function setIcon(key, emoji) {
  icons.set(key, { id: emoji.id, name: emoji.name });
}
/** Component emoji for buttons/menus, or undefined while the icon isn't uploaded. */
function icon(key) {
  return icons.get(key);
}
/** Inline text form: <:mk1_join:123>, or the fallback when the icon isn't there. */
function i(key, fallback = '') {
  const e = icons.get(key);
  return e ? `<:${e.name}:${e.id}>` : fallback;
}

// ---------- banners ----------
const bannerPath = (key) => path.join(ART, 'banner', `${key}.jpg`);
const hasBanner = (key) => fs.existsSync(bannerPath(key));
/** AttachmentBuilder for a ready banner (or null). Name is stable so embeds can use attachment://. */
const GAME_ART_KEYS = ['roulette', 'mafia', 'chairs', 'spy', 'xo', 'rps', 'deathbox', 'rebelka', 'fasttype', 'flags', 'capitals', 'unscramble', 'math', 'night'];
/** A premium server's own picture for this key (uploaded /media/... file or https link), or null. */
function customArt(key, gid) {
  if (!gid) return null;
  const ref = require('./store').peek('gameArt', gid)?.[key];
  if (!ref || !require('./premium').has(gid, 'gameArt')) return null;
  const file = require('./media').localPath(ref);
  if (file) return new AttachmentBuilder(file, { name: `${key}${path.extname(file)}` });
  if (/^https:\/\//.test(ref)) return new AttachmentBuilder(ref, { name: `${key}${(ref.match(/\.(png|jpe?g|gif|webp)(\?|$)/i) || ['.png'])[0].replace('?', '')}` });
  return null;
}
function banner(key, gid = null) {
  const custom = customArt(key, gid);
  if (custom) return custom;
  if (!hasBanner(key)) return null;
  return new AttachmentBuilder(bannerPath(key), { name: `${key}.jpg` });
}
const accent = (key, d = '#7c5cff') => manifest.banners?.[key]?.accent || d;
const accentInt = (key) => parseInt(accent(key).slice(1), 16);

// ---------- canvas ----------
let C = null;
let FONT = 'sans-serif';
function canvas() {
  if (C !== null) return C || null;
  C = false;
  for (const n of ['@napi-rs/canvas', 'canvas']) {
    try {
      const lib = require(n);
      if (lib.GlobalFonts?.registerFromPath) {
        for (const w of ['Medium', 'Bold', 'ExtraBold', 'Black']) lib.GlobalFonts.registerFromPath(path.join(FONTS, `Tajawal-${w}.ttf`), `Tajawal ${w}`);
        FONT = 'Tajawal';
      } else if (lib.registerFont) {
        for (const w of ['Medium', 'Bold', 'ExtraBold', 'Black']) lib.registerFont(path.join(FONTS, `Tajawal-${w}.ttf`), { family: `Tajawal ${w}` });
        FONT = 'Tajawal';
      }
      C = lib;
      break;
    } catch {}
  }
  return C || null;
}
const font = (w, px) => (FONT === 'Tajawal' ? `${px}px "Tajawal ${w}"` : `bold ${px}px sans-serif`);

function hexA(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The brand backdrop: indigo gradient, accent glow, soft waves. */
function backdrop(ctx, W, H, acc, { glowX = W / 2, glowY = H * 0.45, waves = true } = {}) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0c0a1d');
  g.addColorStop(0.55, '#15113a');
  g.addColorStop(1, '#1d1650');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, col, a) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexA(col, a));
    rg.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  };
  glow(glowX, glowY, Math.max(W, H) * 0.45, acc, 0.4);
  glow(W * 0.85, 0, W * 0.4, '#6d4aff', 0.25);
  if (!waves) return;
  ctx.save();
  for (let k = 0; k < 7; k++) {
    const y0 = H * 0.78 + k * (H * 0.035);
    ctx.beginPath();
    for (let x = -10; x <= W + 10; x += 12) {
      const y = y0 + Math.sin(x / 160 + k * 0.7) * 8;
      x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = k === 1 ? hexA(acc, 0.5) : 'rgba(150,160,255,0.08)';
    ctx.lineWidth = k === 1 ? 2 : 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

async function loadAvatar(url) {
  const lib = canvas();
  if (!lib || !url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await lib.loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}
/** A white icon glyph, optionally tinted. Returns a drawable (image or canvas) or null. */
async function glyph(key, color = null) {
  const lib = canvas();
  const p = path.join(ART, 'glyph', `${key}.png`);
  if (!lib || !fs.existsSync(p)) return null;
  const img = await lib.loadImage(fs.readFileSync(p)).catch(() => null);
  if (!img || !color) return img;
  const c = lib.createCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

function fitText(ctx, text, max, weight, size, min = 18) {
  ctx.font = font(weight, size);
  while (ctx.measureText(text).width > max && size > min) ctx.font = font(weight, (size -= 2));
  let t = text;
  while (ctx.measureText(t).width > max && t.length > 2) t = t.slice(0, -2);
  return t === text ? t : `${t}…`;
}

/**
 * Winner card: avatars of the winners with a crown, the game's name and the reward.
 * winners: [{ name, avatar }], returns a PNG buffer or null when no canvas is available.
 */
async function winnerCard({ gameKey, gameTitle, title, winners, reward }) {
  const lib = canvas();
  if (!lib) return null;
  const W = 1200;
  const H = 520;
  const c = lib.createCanvas(W, H);
  const ctx = c.getContext('2d');
  const acc = accent(gameKey, '#ffcb47');
  backdrop(ctx, W, H, acc, { glowX: W / 2, glowY: 210 });
  const list = winners.slice(0, 5).reverse(); // RTL: the first winner sits on the right
  const size = list.length === 1 ? 190 : list.length === 2 ? 160 : 128;
  const gap = 40;
  const total = list.length * size + (list.length - 1) * gap;
  let x = (W - total) / 2;
  const y = list.length === 1 ? 70 : 90;
  const crown = await glyph('crown', '#ffcb47');
  for (const w of list) {
    const img = await loadAvatar(w.avatar);
    ctx.save();
    ctx.shadowColor = hexA(acc, 0.9);
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 7, 0, Math.PI * 2);
    ctx.fillStyle = acc;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    if (img) ctx.drawImage(img, x, y, size, size);
    else {
      ctx.fillStyle = '#2a2160';
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = '#fff';
      ctx.font = font('Black', size * 0.45);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((w.name || '?').slice(0, 1), x + size / 2, y + size / 2);
    }
    ctx.restore();
    if (crown && list.length <= 3) {
      const cs = size * 0.42;
      ctx.save();
      ctx.translate(x + size * 0.82, y + size * 0.08);
      ctx.rotate(0.45);
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.drawImage(crown, -cs / 2, -cs / 2, cs, cs);
      ctx.restore();
    }
    if (list.length > 1) {
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(fitText(ctx, w.name || '', size + 30, 'Bold', 28), x + size / 2, y + size + 18);
    }
    x += size + gap;
  }
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const ty = list.length === 1 ? y + size + 92 : y + size + 120;
  const head = list.length === 1 ? winners[0].name : title || '';
  ctx.save();
  ctx.shadowColor = hexA(acc, 0.6);
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fitText(ctx, head, W - 160, 'Black', list.length === 1 ? 72 : 56), W / 2, ty);
  ctx.restore();
  ctx.font = font('Bold', 30);
  ctx.fillStyle = hexA(acc, 1);
  const sub = list.length === 1 ? (String(title || '').includes(gameTitle) ? title : `${title || 'الفائز'} • ${gameTitle}`) : gameTitle;
  ctx.fillText(sub, W / 2, ty + 52);
  if (reward) {
    ctx.font = font('Medium', 24);
    ctx.fillStyle = 'rgba(230,226,255,0.7)';
    ctx.fillText(reward, W / 2, ty + 92);
  }
  return c.toBuffer('image/png');
}

module.exports = { GAME_ART_KEYS, customArt, VERSION, manifest, iconName, setIcon, icon, i, icons, banner, hasBanner, accent, accentInt, canvas, font, hexA, rr, backdrop, loadAvatar, glyph, fitText, winnerCard, ART };
