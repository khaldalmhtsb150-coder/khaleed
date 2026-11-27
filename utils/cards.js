// Drawn cards for messages people react to: the box, application results, ticket summaries.
// Flat and editorial on purpose: a charcoal surface, one accent band on the reading side, right-aligned
// type in a clear hierarchy (kicker → title → details), hairline dividers. No gradients, glows or neon —
// the look of a product, not of a generated poster. Every function returns a PNG buffer, or null when
// no canvas library is installed (callers then fall back to a plain embed).
const art = require('./art');

const W = 1200;
const PAD = 72;
const RIGHT = W - PAD - 10; // text edge, just inside the accent band
const INK = '#121317';
const SURFACE = '#1a1c21';
const LINE = 'rgba(255,255,255,0.08)';
const TEXT = '#f3f4f6';
const MUTED = '#9aa1ad';
const FAINT = '#6b7280';

/** Accents, matching ui.PALETTE. */
const ACC = {
  brand: '#14b8a6',
  info: '#3b82f6',
  success: '#22c55e',
  danger: '#ef4444',
  gold: '#eab308',
  pink: '#ec4899',
  muted: '#64748b',
};

function base(H, acc) {
  const C = art.canvas();
  if (!C) return null;
  const c = C.createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  // the accent band on the reading side (right, for Arabic)
  ctx.fillStyle = acc;
  ctx.fillRect(W - 10, 0, 10, H);
  return { c, ctx };
}

function text(ctx, str, x, y, { weight = 'Bold', size = 32, color = TEXT, max = W - PAD * 2, align = 'right' } = {}) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const t = art.fitText(ctx, String(str ?? ''), max, weight, size);
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
  ctx.restore();
}

function hline(ctx, y, x1 = PAD, x2 = RIGHT) {
  ctx.fillStyle = LINE;
  ctx.fillRect(x1, y, x2 - x1, 2);
}

/** Small label in the accent colour with a short rule before it: "▬ بوكس". */
function kicker(ctx, str, y, acc) {
  ctx.save();
  ctx.font = art.font('Bold', 22);
  ctx.direction = 'rtl';
  const w = ctx.measureText(str).width;
  ctx.restore();
  ctx.fillStyle = acc;
  ctx.fillRect(RIGHT - 36, y - 10, 36, 4);
  text(ctx, str, RIGHT - 50, y, { weight: 'Bold', size: 22, color: acc, max: 600 });
  return w;
}

/** A flat round badge with an outlined ring and a tinted glyph. */
async function badge(ctx, cx, cy, size, key, acc) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = SURFACE;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = art.hexA(acc, 0.55);
  ctx.stroke();
  ctx.restore();
  const img = await art.glyph(key, acc);
  if (img) ctx.drawImage(img, cx - size * 0.27, cy - size * 0.27, size * 0.54, size * 0.54);
}

async function avatar(ctx, cx, cy, size, url, name, acc) {
  const img = await art.loadAvatar(url);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 6, 0, Math.PI * 2);
  ctx.fillStyle = acc;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 2, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img) ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  else {
    ctx.fillStyle = SURFACE;
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.fillStyle = TEXT;
    ctx.font = art.font('Black', size * 0.42);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(name || '?').trim().slice(0, 1).toUpperCase(), cx, cy + size * 0.03);
  }
  ctx.restore();
}

/** A row of label/value cells separated by hairlines, right to left. */
function stats(ctx, items, y, { x1 = PAD, x2 = RIGHT } = {}) {
  const colW = (x2 - x1) / items.length;
  items.forEach(([label, value, color], i) => {
    const right = x2 - colW * i;
    if (i) {
      ctx.fillStyle = LINE;
      ctx.fillRect(right + 1, y - 4, 2, 70);
    }
    const pad = i ? 26 : 0;
    text(ctx, label, right - pad, y + 18, { weight: 'Medium', size: 19, color: MUTED, max: colW - 40 });
    text(ctx, value, right - pad, y + 58, { weight: 'ExtraBold', size: 30, color: color || TEXT, max: colW - 40 });
  });
}

/** Bottom strip: a detail on the right, the brand on the left. */
function footer(ctx, H, str) {
  hline(ctx, H - 66);
  if (str) text(ctx, str, RIGHT, H - 28, { weight: 'Medium', size: 19, color: FAINT, max: 760 });
  text(ctx, 'MARKA', PAD, H - 28, { weight: 'Black', size: 18, color: FAINT, align: 'left', max: 200 });
}

/**
 * The box. state: 'waiting' | 'open' | 'won' | 'expired'
 * { prize, host, winner: { name, avatar }, ms }
 */
async function boxCard({ state = 'open', prize, host, winner, ms }) {
  const H = 400;
  const acc = state === 'expired' ? ACC.muted : state === 'won' ? ACC.gold : ACC.pink;
  const b = base(H, acc);
  if (!b) return null;
  const { c, ctx } = b;
  const textMax = W - PAD * 2 - 300; // leave the left side for the badge / avatar
  if (state === 'won' && winner) {
    kicker(ctx, 'فاز بالبوكس', 92, acc);
    text(ctx, winner.name, RIGHT, 170, { weight: 'Black', size: 66, max: textMax });
    stats(ctx, [['الجائزة', prize, acc], ['سرعة الكبسة', ms != null ? `${(ms / 1000).toFixed(2)} ث` : '—'], ['بواسطة', host || '—']], 210, { x2: RIGHT, x1: PAD + 300 });
    await avatar(ctx, PAD + 120, 170, 200, winner.avatar, winner.name, acc);
    footer(ctx, H, 'مبروك! الجائزة بتوصلك من صاحب البوكس');
    return c.toBuffer('image/png');
  }
  const label = { waiting: 'بوكس • بينفتح بعد شوي', open: 'بوكس • مفتوح هلأ', expired: 'بوكس • انتهى' }[state] || 'بوكس';
  kicker(ctx, label, 92, acc);
  text(ctx, prize, RIGHT, 182, { weight: 'Black', size: 78, max: textMax, color: state === 'expired' ? MUTED : TEXT });
  const sub = state === 'waiting' ? 'جهّز إيدك، الزر بينفتح بعد ثواني' : state === 'expired' ? 'خلص الوقت وما حدا كبس' : 'أول واحد بيكبس الزر تحت بياخذها';
  text(ctx, sub, RIGHT, 236, { weight: 'Medium', size: 28, color: MUTED, max: textMax });
  await badge(ctx, PAD + 120, 175, 190, 'gift', acc);
  footer(ctx, H, host ? `بواسطة ${host}` : null);
  return c.toBuffer('image/png');
}

/** Staff application result for the DM and the ticket: accepted / rejected / trial. */
async function resultCard({ ok, title, position, server, name, avatar: url }) {
  const H = 400;
  const acc = ok ? ACC.success : ACC.danger;
  const b = base(H, acc);
  if (!b) return null;
  const { c, ctx } = b;
  const textMax = W - PAD * 2 - 300;
  kicker(ctx, 'نتيجة التقديم', 92, acc);
  text(ctx, title, RIGHT, 172, { weight: 'Black', size: 62, max: textMax });
  stats(ctx, [['المنصب', position, acc], ['السيرفر', server], ['المتقدّم', name]], 212, { x2: RIGHT, x1: PAD + 300 });
  await avatar(ctx, PAD + 120, 170, 200, url, name, acc);
  const mark = await art.glyph(ok ? 'check' : 'cancel', '#ffffff');
  if (mark) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(PAD + 192, 242, 30, 0, Math.PI * 2);
    ctx.fillStyle = acc;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.drawImage(mark, PAD + 174, 224, 36, 36);
    ctx.restore();
  }
  footer(ctx, H, ok ? 'أهلاً فيك بالفريق' : 'بتقدر تقدّم مرة ثانية لاحقاً');
  return c.toBuffer('image/png');
}

/** Ticket summary when it closes: number, department, who handled it, how long, messages. */
async function ticketCard({ number, department, owner, claimer, minutes, messages }) {
  const H = 380;
  const acc = ACC.info;
  const b = base(H, acc);
  if (!b) return null;
  const { c, ctx } = b;
  kicker(ctx, 'تذكرة مسكّرة', 92, acc);
  text(ctx, `#${String(number).padStart(4, '0')}`, RIGHT, 168, { weight: 'Black', size: 64, max: 360 });
  ctx.save();
  ctx.font = art.font('Black', 64);
  const numW = Math.min(360, ctx.measureText(`#${String(number).padStart(4, '0')}`).width);
  ctx.restore();
  if (department) text(ctx, department, RIGHT - numW - 28, 162, { weight: 'Bold', size: 30, color: MUTED, max: W - PAD * 2 - numW - 40 });
  hline(ctx, 196);
  const m = Number(minutes) || 0;
  const dur = m < 1 ? 'أقل من دقيقة' : m < 60 ? `${m} دقيقة` : m < 1440 ? `${Math.round(m / 60)} ساعة` : `${Math.round(m / 1440)} يوم`;
  stats(ctx, [['صاحب التذكرة', owner || '—'], ['استلمها', claimer || '—', claimer ? acc : MUTED], ['المدة', dur], ['الرسائل', String(messages ?? '—')]], 222);
  footer(ctx, H, 'شكراً لتواصلك معنا');
  return c.toBuffer('image/png');
}

module.exports = { boxCard, resultCard, ticketCard, ACC, _base: base, _badge: badge, _text: text, _stats: stats };
