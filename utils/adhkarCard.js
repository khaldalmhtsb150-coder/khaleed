// Cards for the automatic adhkar posts: a framed page in deep green / ink with gold lines,
// an eight-pointed-star lattice, and the text set in Amiri (a Naskh face that carries full tashkeel).
// Everything is drawn here, so there are no image files to ship. Returns a PNG buffer, or null
// when no canvas library is installed (the caller then falls back to a plain embed).
const path = require('path');
const art = require('./art');

const FONTS = path.join(__dirname, '..', 'assets', 'fonts');
let amiri = null;
function lib() {
  const C = art.canvas();
  if (!C) return null;
  if (amiri === null) {
    amiri = false;
    try {
      if (C.GlobalFonts?.registerFromPath) {
        C.GlobalFonts.registerFromPath(path.join(FONTS, 'Amiri-Regular.ttf'), 'Amiri');
        C.GlobalFonts.registerFromPath(path.join(FONTS, 'Amiri-Bold.ttf'), 'Amiri Bold');
        amiri = true;
      } else if (C.registerFont) {
        C.registerFont(path.join(FONTS, 'Amiri-Regular.ttf'), { family: 'Amiri' });
        C.registerFont(path.join(FONTS, 'Amiri-Bold.ttf'), { family: 'Amiri Bold' });
        amiri = true;
      }
    } catch {}
  }
  return C;
}
const naskh = (px, bold = true) => (amiri ? `${px}px "${bold ? 'Amiri Bold' : 'Amiri'}"` : `bold ${px}px serif`);

const GOLD = '#d6b46a';
const GOLD_LIGHT = '#f0dba4';
const CREAM = '#f7f0dd';

// one palette per kind of post; all of them stay dark and quiet so the gold and the text lead
const THEMES = {
  dhikr: { top: '#0f5141', bottom: '#03191a', glow: '#2f8f74', label: 'ذِكْر' },
  ayah: { top: '#0d3f50', bottom: '#031219', glow: '#2b7f99', label: 'آيَة' },
  dua: { top: '#232a5c', bottom: '#080b1f', glow: '#5a63b5', label: 'دُعَاء' },
  sabah: { top: '#0f4552', bottom: '#06141c', glow: '#e0a252', label: 'أَذْكَارُ الصَّبَاحِ', sky: 'dawn' },
  masa: { top: '#161d45', bottom: '#05071a', glow: '#4a5aa8', label: 'أَذْكَارُ الْمَسَاءِ', sky: 'night' },
  friday: { top: '#0f5141', bottom: '#03191a', glow: '#c9a24f', label: 'جُمُعَةٌ مُبَارَكَةٌ' },
};
const KIND_THEME = { ذكر: 'dhikr', آية: 'ayah', دعاء: 'dua' };

const hexA = art.hexA;

/** The eight-pointed star (two squares turned 45° apart), as a path. */
function starPath(ctx, x, y, r, inner = 0.414) {
  ctx.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (Math.PI / 8) * k - Math.PI / 2;
    const rad = k % 2 === 0 ? r : r * (1 - inner * 0.55);
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function khatam(ctx, x, y, r) {
  // two overlapping squares, the classic eight-pointed star outline
  for (const turn of [0, Math.PI / 4]) {
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = turn + (Math.PI / 2) * k;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function lattice(ctx, W, H, color) {
  const s = 92;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  for (let y = -s; y < H + s; y += s) {
    for (let x = -s; x < W + s; x += s) {
      const ox = (Math.round(y / s) % 2) * (s / 2);
      khatam(ctx, x + ox, y, s * 0.36);
      ctx.beginPath();
      ctx.arc(x + ox, y, s * 0.12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function background(ctx, W, H, th) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.top);
  g.addColorStop(1, th.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  lattice(ctx, W, H, hexA(GOLD, 0.075));
  // a soft light behind the text, and the lattice fades out where the text sits
  const glow = ctx.createRadialGradient(W / 2, H * 0.48, 10, W / 2, H * 0.48, W * 0.55);
  glow.addColorStop(0, hexA(th.glow, 0.28));
  glow.addColorStop(1, hexA(th.glow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const calm = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, Math.max(W, H) * 0.42);
  calm.addColorStop(0, hexA(th.top, 0.85));
  calm.addColorStop(1, hexA(th.top, 0));
  ctx.fillStyle = calm;
  ctx.fillRect(0, 0, W, H);
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function sky(ctx, W, H, th) {
  if (th.sky === 'dawn') {
    // the sun just rising behind the bottom edge
    const cx = W / 2;
    const cy = H + 40;
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, W * 0.6);
    g.addColorStop(0, hexA('#ffcf7a', 0.55));
    g.addColorStop(0.35, hexA('#e08c3c', 0.22));
    g.addColorStop(1, hexA('#e08c3c', 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.strokeStyle = hexA(GOLD_LIGHT, 0.07);
    ctx.lineWidth = 2;
    for (let k = 1; k < 12; k++) {
      const a = Math.PI + (Math.PI / 12) * k;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 130, cy + Math.sin(a) * 130);
      ctx.lineTo(cx + Math.cos(a) * 250, cy + Math.sin(a) * 250);
      ctx.stroke();
    }
    ctx.restore();
  } else if (th.sky === 'night') {
    // a crescent and a few still stars, kept to the upper corners
    const rnd = (n) => ((Math.sin(n * 91.7) * 43758.5453) % 1 + 1) % 1;
    ctx.save();
    for (let k = 0; k < 38; k++) {
      const x = 60 + rnd(k) * (W - 120);
      const y = 60 + rnd(k + 100) * H * 0.32;
      if (Math.abs(x - W / 2) < 260) continue;
      ctx.fillStyle = hexA(CREAM, 0.25 + rnd(k + 7) * 0.45);
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + rnd(k + 3) * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    const mx = W - 170;
    const my = 150;
    const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 160);
    halo.addColorStop(0, hexA(GOLD_LIGHT, 0.22));
    halo.addColorStop(1, hexA(GOLD_LIGHT, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(mx - 170, my - 170, 340, 340);
    // cut the crescent on its own small canvas, so the cut never punches through the card
    const C = lib();
    const m = C.createCanvas(120, 120);
    const mc = m.getContext('2d');
    mc.fillStyle = GOLD_LIGHT;
    mc.beginPath();
    mc.arc(60, 60, 44, 0, Math.PI * 2);
    mc.fill();
    mc.globalCompositeOperation = 'destination-out';
    mc.beginPath();
    mc.arc(80, 48, 40, 0, Math.PI * 2);
    mc.fill();
    ctx.drawImage(m, mx - 60, my - 60);
    ctx.restore();
  }
}

function frame(ctx, W, H, th) {
  const o = 30;
  ctx.save();
  ctx.strokeStyle = hexA(GOLD, 0.9);
  ctx.lineWidth = 2;
  art.rr(ctx, o, o, W - 2 * o, H - 2 * o, 22);
  ctx.stroke();
  ctx.strokeStyle = hexA(GOLD, 0.35);
  ctx.lineWidth = 1;
  art.rr(ctx, o + 11, o + 11, W - 2 * (o + 11), H - 2 * (o + 11), 16);
  ctx.stroke();
  // a small star at each corner, sitting on the frame
  for (const [x, y] of [
    [o + 5, o + 5],
    [W - o - 5, o + 5],
    [o + 5, H - o - 5],
    [W - o - 5, H - o - 5],
  ]) {
    ctx.fillStyle = th.bottom;
    starPath(ctx, x, y, 17);
    ctx.fill();
    ctx.fillStyle = GOLD;
    starPath(ctx, x, y, 12);
    ctx.fill();
  }
  ctx.restore();
}

/** The seal at the top centre: a gold star in a ring, breaking the frame line. */
function seal(ctx, W, th) {
  const x = W / 2;
  const y = 30;
  ctx.save();
  ctx.fillStyle = th.top;
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  khatam(ctx, x, y, 17);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Title between two gold rules that fade outward, with a diamond at each inner end. */
function heading(ctx, W, y, text, size = 44) {
  ctx.save();
  ctx.font = naskh(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  const tw = ctx.measureText(text).width;
  const gap = tw / 2 + 34;
  const len = 230;
  for (const s of [-1, 1]) {
    const x0 = W / 2 + s * gap;
    const x1 = W / 2 + s * (gap + len);
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, hexA(GOLD, 0.95));
    g.addColorStop(1, hexA(GOLD, 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(x0 - s * 2, y);
    ctx.lineTo(x0 + s * 7, y - 6);
    ctx.lineTo(x0 + s * 16, y);
    ctx.lineTo(x0 + s * 7, y + 6);
    ctx.closePath();
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  g.addColorStop(0, GOLD_LIGHT);
  g.addColorStop(1, GOLD);
  ctx.fillStyle = g;
  ctx.fillText(text, W / 2, y + 2);
  ctx.restore();
}

function divider(ctx, W, y) {
  ctx.save();
  for (const s of [-1, 1]) {
    const g = ctx.createLinearGradient(W / 2 + s * 22, 0, W / 2 + s * 180, 0);
    g.addColorStop(0, hexA(GOLD, 0.8));
    g.addColorStop(1, hexA(GOLD, 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(W / 2 + s * 22, y);
    ctx.lineTo(W / 2 + s * 180, y);
    ctx.stroke();
  }
  ctx.fillStyle = GOLD;
  starPath(ctx, W / 2, y, 10);
  ctx.fill();
  ctx.restore();
}

/** Word-wrap right-to-left text; keeps "﴿٥﴾"-style markers glued to their word. */
function wrap(ctx, text, max) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > max && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Picks the biggest size (down to min) whose wrapped text fits in maxLines. */
function layout(ctx, text, max, { size = 62, min = 34, maxLines = 6, bold = true } = {}) {
  let lines;
  for (; size >= min; size -= 2) {
    ctx.font = naskh(size, bold);
    lines = wrap(ctx, text, max);
    if (lines.length <= maxLines) break;
  }
  size = Math.max(size, min);
  ctx.font = naskh(size, bold);
  lines = wrap(ctx, text, max);
  // even out the lines, so a verse never ends on a lonely word
  if (lines.length > 1) {
    let w = max;
    while (w > max * 0.5 && wrap(ctx, text, w - 20).length === lines.length) w -= 20;
    lines = wrap(ctx, text, w);
  }
  return { size, lines, lh: Math.round(size * 1.85) };
}

function drawLines(ctx, W, y, { size, lines, lh }, { color = CREAM, bold = true, shadow = true } = {}) {
  ctx.save();
  ctx.font = naskh(size, bold);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillStyle = color;
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
  }
  lines.forEach((l, k) => ctx.fillText(l, W / 2, y + lh * k + lh / 2));
  ctx.restore();
  return y + lh * lines.length;
}

/**
 * Draws one card.
 * opts: { theme: 'dhikr'|'ayah'|'dua'|'sabah'|'masa'|'friday', text, source, virtue?, virtueLabel?, title? }
 */
async function render({ theme = 'dhikr', text, source, virtue, virtueLabel, title }) {
  const C = lib();
  if (!C) return null;
  const th = THEMES[theme] || THEMES.dhikr;
  const W = 1200;
  const textMax = W - 260;
  const isAyah = theme === 'ayah' || /^[^:]+: \d/.test(source || '');
  // Qur'anic pause marks (ۖ ۚ …) belong to the word before them, not to a space
  const clean = String(text).replace(/\s+([\u06D6-\u06DC])/g, '$1');

  // measure first, then size the canvas to the content
  const probe = C.createCanvas(10, 10).getContext('2d');
  const main = layout(probe, clean, textMax - (isAyah ? 80 : 0), { size: text.length < 40 ? 70 : 60, min: 36, maxLines: 6 });
  if (isAyah && !/^﴿/.test(clean)) {
    // the ornate brackets go on the first and last line, never on a line of their own
    main.lines[0] = `﴿ ${main.lines[0]}`;
    main.lines[main.lines.length - 1] = `${main.lines[main.lines.length - 1]} ﴾`;
  }
  let vb = null;
  if (virtue) {
    vb = layout(probe, virtue, textMax - 120, { size: 32, min: 24, maxLines: 4, bold: false });
    vb.lh = Math.round(vb.size * 1.7);
  }
  const top = 150;
  const mainH = main.lh * main.lines.length;
  const virtueH = vb ? 70 + vb.lh * vb.lines.length + 40 : 0;
  const H = Math.max(560, top + 30 + mainH + 40 + 20 + 60 + virtueH + 90);

  const c = C.createCanvas(W, H);
  const ctx = c.getContext('2d');
  background(ctx, W, H, th);
  sky(ctx, W, H, th);
  frame(ctx, W, H, th);
  seal(ctx, W, th);
  heading(ctx, W, 112, title || th.label, theme === 'sabah' || theme === 'masa' || theme === 'friday' ? 48 : 44);

  let y = top + 30;
  // the text block sits in the middle of the space left above the source line
  const free = H - 90 - virtueH - 60 - 20 - 40 - top - 30;
  y += Math.max(0, (free - mainH) / 2);
  y = drawLines(ctx, W, y, main);

  y += 30;
  divider(ctx, W, y);
  y += 44;
  if (source) {
    ctx.save();
    ctx.font = art.font('Medium', 26);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillStyle = hexA(GOLD_LIGHT, 0.85);
    ctx.fillText(source, W / 2, y);
    ctx.restore();
  }
  y += 50;

  if (vb) {
    const bw = W - 220;
    const bh = 54 + vb.lh * vb.lines.length + 24;
    const bx = (W - bw) / 2;
    ctx.save();
    ctx.fillStyle = hexA(GOLD, 0.07);
    art.rr(ctx, bx, y, bw, bh, 18);
    ctx.fill();
    ctx.strokeStyle = hexA(GOLD, 0.3);
    ctx.lineWidth = 1;
    art.rr(ctx, bx, y, bw, bh, 18);
    ctx.stroke();
    // label tab on the top edge
    const label = virtueLabel || 'فَضْلُهُ';
    ctx.font = naskh(26);
    const lw = ctx.measureText(label).width + 44;
    ctx.fillStyle = th.bottom;
    art.rr(ctx, W / 2 - lw / 2, y - 19, lw, 38, 19);
    ctx.fill();
    ctx.strokeStyle = hexA(GOLD, 0.6);
    art.rr(ctx, W / 2 - lw / 2, y - 19, lw, 38, 19);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText(label, W / 2, y + 1);
    ctx.restore();
    drawLines(ctx, W, y + 34, vb, { color: hexA(CREAM, 0.88), bold: false, shadow: false });
  }

  return c.toBuffer('image/png');
}

module.exports = { render, THEMES, KIND_THEME };
