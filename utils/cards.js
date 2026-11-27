// Drawn cards for messages people react to: the box, application results, ticket summaries.
// One visual language with the banners and winner cards (utils/art): dark violet backdrop, one accent
// colour per kind, an app-icon tile, Tajawal type. Every function returns a PNG buffer, or null when
// no canvas library is installed (callers then fall back to a plain embed).
const art = require('./art');

const W = 1200;

function base(H, acc, glowY) {
  const C = art.canvas();
  if (!C) return null;
  const c = C.createCanvas(W, H);
  const ctx = c.getContext('2d');
  art.backdrop(ctx, W, H, acc, { glowX: W / 2, glowY: glowY ?? H * 0.4, waves: false });
  // a fine frame so the card reads as a card in Discord's dark and light themes
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  art.rr(ctx, 14, 14, W - 28, H - 28, 26);
  ctx.stroke();
  return { c, ctx };
}

/** Rounded "app icon" tile with a glyph in it. */
async function tile(ctx, cx, cy, size, key, acc) {
  ctx.save();
  ctx.shadowColor = art.hexA(acc, 0.8);
  ctx.shadowBlur = 50;
  const g = ctx.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
  g.addColorStop(0, art.hexA(acc, 1));
  g.addColorStop(1, art.hexA(acc, 0.55));
  ctx.fillStyle = g;
  art.rr(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.28);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  art.rr(ctx, cx - size / 2 + 1, cy - size / 2 + 1, size - 2, size - 2, size * 0.28);
  ctx.stroke();
  ctx.restore();
  const img = await art.glyph(key, '#ffffff');
  if (img) ctx.drawImage(img, cx - size * 0.3, cy - size * 0.3, size * 0.6, size * 0.6);
}

async function avatar(ctx, cx, cy, size, url, name, acc) {
  const img = await art.loadAvatar(url);
  ctx.save();
  ctx.shadowColor = art.hexA(acc, 0.9);
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 7, 0, Math.PI * 2);
  ctx.fillStyle = acc;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img) ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  else {
    ctx.fillStyle = '#2a2160';
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.fillStyle = '#fff';
    ctx.font = art.font('Black', size * 0.45);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(name || '?').slice(0, 1), cx, cy);
  }
  ctx.restore();
}

function text(ctx, str, x, y, { weight = 'Bold', size = 32, color = '#fff', max = W - 160, align = 'center', glow = null } = {}) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const t = art.fitText(ctx, String(str), max, weight, size);
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 30;
  }
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
  ctx.restore();
}

/** A rounded label (e.g. the prize, a time). */
function pill(ctx, str, cx, cy, { size = 30, color = '#fff', bg = 'rgba(255,255,255,0.1)', border = 'rgba(255,255,255,0.18)', weight = 'Bold' } = {}) {
  ctx.save();
  ctx.font = art.font(weight, size);
  ctx.direction = 'rtl';
  const w = Math.min(W - 200, ctx.measureText(str).width + size * 1.6);
  const h = size * 1.9;
  ctx.fillStyle = bg;
  art.rr(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  art.rr(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(art.fitText(ctx, str, w - size, weight, size), cx, cy + 2);
  ctx.restore();
}

const BOX = '#ff5fa8';

/**
 * The box. state: 'waiting' | 'open' | 'won' | 'expired'
 * { prize, host, winner: { name, avatar }, ms }
 */
async function boxCard({ state = 'open', prize, host, winner, ms }) {
  const H = 500;
  const acc = state === 'expired' ? '#8b8fb8' : state === 'won' ? '#ffcb47' : BOX;
  const b = base(H, acc, 170);
  if (!b) return null;
  const { c, ctx } = b;
  if (state === 'won' && winner) {
    await avatar(ctx, W / 2, 150, 170, winner.avatar, winner.name, acc);
    const crown = await art.glyph('crown', '#ffcb47');
    if (crown) {
      ctx.save();
      ctx.translate(W / 2 + 62, 72);
      ctx.rotate(0.45);
      ctx.drawImage(crown, -36, -36, 72, 72);
      ctx.restore();
    }
    text(ctx, winner.name, W / 2, 318, { weight: 'Black', size: 64, glow: art.hexA(acc, 0.6) });
    text(ctx, 'فتح البوكس وفاز', W / 2, 362, { weight: 'Bold', size: 28, color: art.hexA(acc, 1) });
    pill(ctx, prize, W / 2, 420, { size: 30 });
    if (ms != null) text(ctx, `كبس خلال ${(ms / 1000).toFixed(2)} ثانية`, W / 2, 478, { weight: 'Medium', size: 20, color: 'rgba(230,226,255,0.6)' });
    return c.toBuffer('image/png');
  }
  await tile(ctx, W / 2, 128, 150, 'gift', acc);
  text(ctx, state === 'expired' ? 'انتهى البوكس' : 'بوكس!', W / 2, 262, { weight: 'Black', size: 40, color: art.hexA(acc, 1) });
  text(ctx, prize, W / 2, 342, { weight: 'Black', size: 76, glow: art.hexA(acc, 0.6), color: state === 'expired' ? 'rgba(255,255,255,0.55)' : '#fff' });
  const sub = state === 'waiting' ? 'جهّز إيدك… الزر بينفتح بعد شوي' : state === 'expired' ? 'خلص الوقت وما حدا كبس' : 'أول واحد بيكبس الزر بيفوز';
  pill(ctx, sub, W / 2, 410, { size: 26, color: state === 'open' ? '#fff' : 'rgba(255,255,255,0.75)' });
  if (host) text(ctx, `بواسطة ${host}`, W / 2, 470, { weight: 'Medium', size: 20, color: 'rgba(230,226,255,0.55)' });
  return c.toBuffer('image/png');
}

/** Staff application result for the DM and the ticket: accepted / rejected / trial. */
async function resultCard({ ok, title, position, server, name, avatar: url }) {
  const H = 460;
  const acc = ok ? '#3ddc84' : '#ff6b6b';
  const b = base(H, acc, 150);
  if (!b) return null;
  const { c, ctx } = b;
  await avatar(ctx, W / 2, 140, 150, url, name, acc);
  const badge = await art.glyph(ok ? 'check' : 'cancel', '#ffffff');
  if (badge) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2 + 58, 196, 30, 0, Math.PI * 2);
    ctx.fillStyle = acc;
    ctx.fill();
    ctx.drawImage(badge, W / 2 + 38, 176, 40, 40);
    ctx.restore();
  }
  text(ctx, title, W / 2, 290, { weight: 'Black', size: 60, glow: art.hexA(acc, 0.5) });
  pill(ctx, position, W / 2, 350, { size: 30, color: art.hexA(acc, 1) });
  text(ctx, server, W / 2, 420, { weight: 'Medium', size: 22, color: 'rgba(230,226,255,0.6)' });
  return c.toBuffer('image/png');
}

/** Ticket summary when it closes: number, department, who handled it, how long, rating. */
async function ticketCard({ number, department, owner, closer, claimer, minutes, messages }) {
  const H = 420;
  const acc = '#5fb0ff';
  const b = base(H, acc, 120);
  if (!b) return null;
  const { c, ctx } = b;
  await tile(ctx, W / 2, 105, 120, 'ticket', acc);
  text(ctx, `تذكرة #${String(number).padStart(4, '0')} انسكّرت`, W / 2, 228, { weight: 'Black', size: 52, glow: art.hexA(acc, 0.5) });
  text(ctx, department || '', W / 2, 272, { weight: 'Bold', size: 26, color: art.hexA(acc, 1) });
  const dur = minutes < 60 ? `${minutes} دقيقة` : minutes < 1440 ? `${Math.round(minutes / 60)} ساعة` : `${Math.round(minutes / 1440)} يوم`;
  const stats = [
    ['صاحب التذكرة', owner],
    ['استلمها', claimer || '—'],
    ['المدة', dur],
    ['الرسائل', String(messages ?? '—')],
  ];
  const colW = (W - 160) / stats.length;
  stats.forEach(([k, v], i) => {
    const cx = W - 80 - colW * i - colW / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    art.rr(ctx, cx - colW / 2 + 10, 300, colW - 20, 90, 18);
    ctx.fill();
    ctx.restore();
    text(ctx, v, cx, 345, { weight: 'Black', size: 28, max: colW - 40 });
    text(ctx, k, cx, 375, { weight: 'Medium', size: 18, color: 'rgba(230,226,255,0.6)', max: colW - 40 });
  });
  void closer;
  return c.toBuffer('image/png');
}

module.exports = { boxCard, resultCard, ticketCard, _base: base, _tile: tile, _pill: pill, _text: text };
