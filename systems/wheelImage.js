// Spinning wheel picture: an animated GIF that lands on the prize, plus a still PNG of the result.
// Free servers get the MarkaBot wheel; premium servers can put their own picture inside the wheel.
const path = require('path');
const gif = require('../utils/gif');
const media = require('../utils/media');

let canvas = null;
for (const name of ['canvas', '@napi-rs/canvas']) {
  try {
    canvas = require(name);
    break;
  } catch {}
}
const FONT = 'MarkaWheel';
if (canvas) {
  const dir = path.join(__dirname, '..', 'assets', 'fonts');
  try {
    if (canvas.registerFont) canvas.registerFont(path.join(dir, 'DejaVuSans-Bold.ttf'), { family: FONT, weight: 'bold' });
    else if (canvas.GlobalFonts) canvas.GlobalFonts.registerFromPath(path.join(dir, 'DejaVuSans-Bold.ttf'), FONT);
  } catch {}
}

const W = 400;
const H = 470;
const CX = 200;
const CY = 212;
const R = 182;
const MAX_SLICES = 12;

const available = () => Boolean(canvas);

/** Up to 12 slices are drawn; the winner is always one of them. */
function slicesFor(rewards, winner, max = MAX_SLICES) {
  const list = rewards.map(String);
  if (list.length <= max) return { slices: list, win: list.indexOf(String(winner)) };
  const others = list.filter((r) => r !== String(winner)).sort(() => Math.random() - 0.5).slice(0, max - 1);
  const win = Math.floor(Math.random() * max);
  others.splice(win, 0, String(winner));
  return { slices: others, win };
}

const short = (t, n = 13) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

function logo(ctx, x, y, s) {
  // the MarkaBot "M" mark (same as the avatar), s = size
  const k = s / 32;
  ctx.save();
  ctx.translate(x - s / 2, y - s / 2);
  ctx.scale(k, k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(8.5, 23.5);
  ctx.lineTo(8.5, 10);
  ctx.lineTo(16, 16.5);
  ctx.lineTo(23.5, 10);
  ctx.lineTo(23.5, 23.5);
  ctx.stroke();
  ctx.fillStyle = '#91C8FF';
  ctx.beginPath();
  ctx.arc(16, 8.4, 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function loadBg(src) {
  if (!src) return null;
  try {
    return await canvas.loadImage(media.localPath(src) || src);
  } catch {
    return null;
  }
}

/** The disc (everything that rotates), drawn once at 2x and reused for every frame. */
function drawDisc(slices, bg, accent) {
  const S = R * 2 * 2;
  const c = canvas.createCanvas(S, S);
  const ctx = c.getContext('2d');
  const r = S / 2;
  ctx.translate(r, r);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();

  if (bg) {
    const scale = Math.max(S / bg.width, S / bg.height);
    ctx.drawImage(bg, (-bg.width * scale) / 2, (-bg.height * scale) / 2, bg.width * scale, bg.height * scale);
  } else {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, '#2a1d6b');
    g.addColorStop(0.65, '#171338');
    g.addColorStop(1, '#0b0a1f');
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, S, S);
    // big faint watermark of the logo
    ctx.globalAlpha = 0.13;
    logo(ctx, 0, 0, r * 1.5);
    ctx.globalAlpha = 1;
  }

  const n = slices.length;
  const seg = (Math.PI * 2) / n;
  // alternating tint so neighbouring slices are easy to tell apart (also keeps text readable on photos)
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, -Math.PI / 2 + i * seg, -Math.PI / 2 + (i + 1) * seg);
    ctx.closePath();
    ctx.fillStyle = bg ? (i % 2 ? 'rgba(10,8,30,0.42)' : 'rgba(10,8,30,0.22)') : i % 2 ? 'rgba(121,80,232,0.22)' : 'rgba(145,200,255,0.06)';
    ctx.fill();
  }
  // divider lines
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * seg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  // labels: along the middle of each slice, reading from the rim inwards
  const size = n > 24 ? 16 : n > 18 ? 19 : n > 12 ? 22 : n > 8 ? 26 : 30;
  const maxLen = n > 18 ? 11 : 13;
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i + 0.5) * seg;
    ctx.save();
    ctx.rotate(a);
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(short(slices[i], maxLen), r - 26, 0);
    ctx.restore();
  }
  // rim
  ctx.beginPath();
  ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 8;
  ctx.stroke();
  return c;
}

function drawFrame(ctx, disc, angle, result, accent) {
  ctx.clearRect(0, 0, W, H);
  // soft glow behind the wheel
  const glow = ctx.createRadialGradient(CX, CY, R * 0.6, CX, CY, R + 18);
  glow.addColorStop(0, 'rgba(121,80,232,0.35)');
  glow.addColorStop(1, 'rgba(121,80,232,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(CX, CY, R + 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(angle);
  ctx.drawImage(disc, -R, -R, R * 2, R * 2);
  ctx.restore();

  // outer white ring
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // hub (does not spin)
  ctx.beginPath();
  ctx.arc(CX, CY, 36, 0, Math.PI * 2);
  ctx.fillStyle = '#120f2e';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  logo(ctx, CX, CY, 46);

  // pointer at the top
  ctx.beginPath();
  ctx.moveTo(CX - 15, CY - R - 16);
  ctx.lineTo(CX + 15, CY - R - 16);
  ctx.lineTo(CX, CY - R + 14);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;

  // result box
  const bx = 36;
  const by = H - 54;
  const bw = W - 72;
  const bh = 42;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 10);
  else ctx.rect(bx, by, bw, bh);
  ctx.fillStyle = 'rgba(18,15,46,0.92)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = result ? accent : 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 19px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(result ? short(result, 30) : '• • •', W / 2, by + bh / 2 + 1);
}

/**
 * @returns {Promise<{gif: Buffer, png: Buffer, duration: number} | null>}
 */
async function render(rewards, winner, { background = '', accent = '#7950E8', maxSlices = MAX_SLICES, frames: frameCount = 46, scale = 1 } = {}) {
  if (!canvas) return null;
  const { slices, win } = slicesFor(rewards, winner, maxSlices);
  const disc = drawDisc(slices, await loadBg(background), accent);
  const seg = (Math.PI * 2) / slices.length;
  // land in the winner's slice (a little off-centre so it doesn't look rigged)
  const jitter = (Math.random() - 0.5) * seg * 0.6;
  const target = Math.PI * 2 * 5 + (Math.PI * 2 - (win + 0.5) * seg) + jitter;
  const start = Math.random() * Math.PI * 2;

  const c = canvas.createCanvas(W, H);
  const ctx = c.getContext('2d');
  // optional smaller output (e.g. the compact roulette wheel): draw full size, copy each frame down
  const sw = Math.round(W * scale);
  const sh = Math.round(H * scale);
  const small = scale < 1 ? canvas.createCanvas(sw, sh) : null;
  const sctx = small?.getContext('2d');
  const grab = () => {
    if (!small) return Buffer.from(ctx.getImageData(0, 0, W, H).data);
    sctx.clearRect(0, 0, sw, sh);
    sctx.drawImage(c, 0, 0, sw, sh);
    return Buffer.from(sctx.getImageData(0, 0, sw, sh).data);
  };
  const frames = [];
  const N = frameCount;
  for (let f = 0; f <= N; f++) {
    const t = f / N;
    const eased = 1 - Math.pow(1 - t, 3.2);
    drawFrame(ctx, disc, start + (target - start) * eased, null, accent);
    // frames get slower towards the end, like a real wheel
    frames.push({ data: grab(), delay: 45 + Math.round(70 * t * t) });
  }
  const final = start + target - start;
  drawFrame(ctx, disc, final, slices[win], accent);
  frames.push({ data: grab(), delay: 60_000 });
  const png = (small || c).toBuffer('image/png');
  const duration = frames.slice(0, -1).reduce((s, f) => s + f.delay, 0);
  return { gif: gif.encode(small ? sw : W, small ? sh : H, frames, { loop: false }), png, duration };
}

module.exports = { render, available, slicesFor };
