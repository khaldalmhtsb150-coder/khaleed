// MarkaBot art kit builder. Renders the icon tiles (application emojis), white glyphs (used by
// runtime images) and the panel banners into assets/art/. Run once after changing the design:
//   node tools/art/build.js            (needs @napi-rs/canvas)
// Icons: Lucide (ISC, see tools/art/lucide/LICENSE). Font: Tajawal (OFL, assets/fonts/Tajawal-OFL.txt).
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets', 'art');
const FONTS = path.join(ROOT, 'assets', 'fonts');
for (const w of ['Medium', 'Bold', 'ExtraBold', 'Black']) GlobalFonts.registerFromPath(path.join(FONTS, `Tajawal-${w}.ttf`), `Tajawal ${w}`);
const F = (w, px) => `${px}px "Tajawal ${w}"`;

// ---------- palette ----------
const BRAND = { ink: '#0b0a1a', deep: '#141033', violet: '#6d4aff', lilac: '#b9a6ff', sky: '#8ec5ff' };
const TILE = {
  green: ['#2fd27a', '#14a058'],
  red: ['#ff5d6c', '#d42d43'],
  blurple: ['#7b86ff', '#4f5be8'],
  violet: ['#9a7bff', '#6a44f0'],
  slate: ['#4a4f6a', '#2d3046'],
  amber: ['#ffc24a', '#e8901a'],
  blue: ['#5fb0ff', '#2f7ae0'],
  pink: ['#ff7ab6', '#e0407f'],
  teal: ['#3fd9c6', '#109c8c'],
  emerald: ['#34d399', '#0f9e6e'],
};

// name → [lucide icon, tile colour]
const ICONS = {
  join: ['log-in', 'green'], leave: ['log-out', 'red'], start: ['play', 'blurple'], cancel: ['x', 'red'],
  players: ['users', 'slate'], help: ['circle-question-mark', 'slate'], info: ['info', 'slate'],
  shop: ['shopping-bag', 'amber'], trophy: ['trophy', 'amber'], crown: ['crown', 'amber'], medal: ['medal', 'amber'], star: ['star', 'amber'],
  shield: ['shield', 'blue'], life: ['heart', 'pink'], double: ['swords', 'red'], dice: ['dices', 'violet'], random: ['shuffle', 'violet'],
  withdraw: ['flag', 'slate'], check: ['check', 'green'], lock: ['lock', 'slate'], unlock: ['lock-open', 'green'],
  show: ['eye', 'slate'], hide: ['eye-off', 'slate'], rename: ['pencil', 'slate'], limit: ['gauge', 'slate'],
  permit: ['user-check', 'green'], kick: ['user-x', 'red'], claim: ['crown', 'amber'],
  book: ['book-open', 'emerald'], release: ['undo-2', 'slate'], list: ['list', 'slate'], ticket: ['ticket', 'violet'],
  verify: ['badge-check', 'green'], appeal: ['scale', 'blue'], greet: ['hand', 'amber'], mail: ['mail', 'blue'],
  repair: ['wrench', 'amber'], restore: ['rotate-ccw', 'blue'], box: ['package', 'amber'], bomb: ['bomb', 'red'],
  chair: ['armchair', 'teal'], mafia: ['venetian-mask', 'red'], spy: ['user-round-search', 'violet'],
  rock: ['hand-fist', 'amber'], paper: ['hand', 'blue'], scissors: ['scissors', 'pink'], vote: ['vote', 'blurple'],
  night: ['moon', 'violet'], day: ['sun', 'amber'], doctor: ['stethoscope', 'emerald'], detective: ['search', 'blue'], dead: ['skull', 'slate'],
  timer: ['timer', 'slate'], gift: ['gift', 'pink'], voice: ['volume-2', 'teal'], backup: ['archive', 'blue'],
  radar: ['radar', 'teal'], bell: ['bell', 'amber'], party: ['party-popper', 'pink'], hourglass: ['hourglass', 'slate'],
  userplus: ['user-plus', 'green'], zap: ['zap', 'amber'], chat: ['message-circle', 'blurple'], door: ['door-open', 'green'],
  tasks: ['clipboard-list', 'slate'], megaphone: ['megaphone', 'violet'], sparkles: ['sparkles', 'violet'],
};

async function svgImage(name, size, color = '#ffffff', stroke = 2) {
  let svg = fs.readFileSync(path.join(__dirname, 'lucide', `${name}.svg`), 'utf8');
  svg = svg.replace(/currentColor/g, color).replace(/stroke-width="2"/, `stroke-width="${stroke}"`).replace(/width="24"/, `width="${size}"`).replace(/height="24"/, `height="${size}"`);
  return loadImage(Buffer.from(svg));
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

/** A glossy rounded tile with a white glyph — the look of the bot's buttons. */
async function tile(icon, color, S = 128) {
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  const [a, b] = TILE[color];
  const pad = S * 0.04;
  rr(ctx, pad, pad, S - pad * 2, S - pad * 2, S * 0.27);
  const g = ctx.createLinearGradient(0, pad, 0, S - pad);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fill();
  // soft top sheen
  ctx.save();
  ctx.clip();
  const sh = ctx.createLinearGradient(0, pad, 0, S * 0.55);
  sh.addColorStop(0, 'rgba(255,255,255,0.28)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, S, S * 0.55);
  ctx.restore();
  // inner hairline
  rr(ctx, pad + 1.5, pad + 1.5, S - pad * 2 - 3, S - pad * 2 - 3, S * 0.25);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const gs = Math.round(S * 0.56);
  const img = await svgImage(icon, gs, '#ffffff', 2.3);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(img, (S - gs) / 2, (S - gs) / 2, gs, gs);
  return c;
}

// ---------- banners ----------
const W = 1200;
const H = 600;

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function background(ctx, accent) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0c0a1d');
  g.addColorStop(0.55, '#15113a');
  g.addColorStop(1, '#1d1650');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // big accent glow behind the illustration + a brand glow top-right
  const glow = (x, y, r, col, a) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexA(col, a));
    rg.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  };
  glow(310, 300, 420, accent, 0.42);
  glow(980, 40, 460, BRAND.violet, 0.28);
  // brand waves along the bottom
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const y0 = 440 + i * 20;
    ctx.beginPath();
    for (let x = -10; x <= W + 10; x += 10) {
      const y = y0 + Math.sin(x / 170 + i * 0.7) * 10 + Math.sin(x / 61 + i) * 3;
      x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = i === 2 ? hexA(accent, 0.55) : 'rgba(150,160,255,0.09)';
    ctx.lineWidth = i === 2 ? 2.2 : 1.2;
    if (i === 2) {
      ctx.shadowColor = hexA(accent, 0.9);
      ctx.shadowBlur = 12;
    } else ctx.shadowBlur = 0;
    ctx.stroke();
  }
  ctx.restore();
  // fine grain so flat areas don't look plastic
  const img = ctx.getImageData(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 9;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function brandMark(ctx, x, y, s = 1) {
  // the Marka "M" with its dot, as on the avatar
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  rr(ctx, 0, 0, 44, 44, 12);
  ctx.strokeStyle = 'rgba(185,166,255,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(12, 33);
  ctx.lineTo(12, 15);
  ctx.lineTo(22, 23.5);
  ctx.lineTo(32, 15);
  ctx.lineTo(32, 33);
  ctx.strokeStyle = '#f2f0ff';
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(22, 9.5, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = BRAND.sky;
  ctx.fill();
  ctx.restore();
  ctx.font = F('ExtraBold', 26);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Marka', x + 56 * s, y + 22 * s);
  const w = ctx.measureText('Marka').width;
  ctx.fillStyle = BRAND.lilac;
  ctx.fillText('Bot', x + 56 * s + w, y + 22 * s);
}

/** A frosted circular "stage" with a big glowing glyph in the middle and small tiles around it. */
async function stage(ctx, accent, main, sats = []) {
  const cx = 320;
  const cy = 290;
  // rings
  for (const [r, a] of [[230, 0.08], [182, 0.12]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = hexA(accent, a * 2.2);
    ctx.lineWidth = 1.5;
    ctx.setLineDash(r === 230 ? [4, 10] : []);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const disc = ctx.createRadialGradient(cx - 40, cy - 60, 10, cx, cy, 150);
  disc.addColorStop(0, hexA(accent, 0.55));
  disc.addColorStop(1, hexA(accent, 0.12));
  ctx.beginPath();
  ctx.arc(cx, cy, 140, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const img = await svgImage(main, 170, '#ffffff', 1.6);
  ctx.save();
  ctx.shadowColor = hexA(accent, 1);
  ctx.shadowBlur = 30;
  ctx.drawImage(img, cx - 85, cy - 85, 170, 170);
  ctx.restore();
  const spots = [[cx + 168, cy - 120, -8], [cx - 190, cy - 70, 6], [cx + 150, cy + 128, 5], [cx - 150, cy + 140, -5]];
  for (let i = 0; i < sats.length && i < spots.length; i++) {
    const [x, y, rot] = spots[i];
    const [icon, color] = sats[i];
    const t = await tile(icon, color, 96);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(t, -42, -42, 84, 84);
    ctx.restore();
  }
}

function wheelArt(ctx, accent) {
  const cx = 320;
  const cy = 300;
  const R = 200;
  const cols = ['#2a2160', '#efeaff', accent, '#efeaff', '#2a2160', '#efeaff', accent, '#efeaff', '#2a2160', '#efeaff', accent, '#efeaff'];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 14, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1442';
  ctx.fill();
  ctx.restore();
  const n = cols.length;
  const rot = -0.2;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, rot + (i * 2 * Math.PI) / n, rot + ((i + 1) * 2 * Math.PI) / n);
    ctx.closePath();
    ctx.fillStyle = cols[i];
    ctx.fill();
    ctx.strokeStyle = '#1a1442';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  // depth shading
  const sh = ctx.createRadialGradient(cx - 70, cy - 90, 20, cx, cy, R);
  sh.addColorStop(0, 'rgba(255,255,255,0.18)');
  sh.addColorStop(0.7, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = sh;
  ctx.fill();
  // rim studs
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (R + 7), cy + Math.sin(a) * (R + 7), 3.2, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#ffd36e' : 'rgba(255,255,255,0.7)';
    ctx.fill();
  }
  // hub with the brand M
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  const hub = ctx.createLinearGradient(cx, cy - 46, cx, cy + 46);
  hub.addColorStop(0, '#8b6dff');
  hub.addColorStop(1, '#4d2fd6');
  ctx.fillStyle = hub;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#efeaff';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 15, cy + 15);
  ctx.lineTo(cx - 15, cy - 11);
  ctx.lineTo(cx, cy + 2);
  ctx.lineTo(cx + 15, cy - 11);
  ctx.lineTo(cx + 15, cy + 15);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - 22, 4, 0, Math.PI * 2);
  ctx.fillStyle = BRAND.sky;
  ctx.fill();
  // pointer
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(cx, cy - R + 26);
  ctx.lineTo(cx - 22, cy - R - 26);
  ctx.lineTo(cx + 22, cy - R - 26);
  ctx.closePath();
  ctx.fillStyle = '#ffd36e';
  ctx.fill();
  ctx.restore();
}

function xoArt(ctx, accent) {
  const cx = 320;
  const cy = 295;
  const s = 120;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.08);
  ctx.shadowColor = hexA(accent, 0.9);
  ctx.shadowBlur = 18;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  for (const k of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(k * s, -1.5 * s);
    ctx.lineTo(k * s, 1.5 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.5 * s, k * s);
    ctx.lineTo(1.5 * s, k * s);
    ctx.stroke();
  }
  const X = (i, j, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = 15;
    ctx.shadowColor = col;
    const x = i * s;
    const y = j * s;
    ctx.beginPath();
    ctx.moveTo(x - 30, y - 30);
    ctx.lineTo(x + 30, y + 30);
    ctx.moveTo(x + 30, y - 30);
    ctx.lineTo(x - 30, y + 30);
    ctx.stroke();
  };
  const O = (i, j, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = 14;
    ctx.shadowColor = col;
    ctx.beginPath();
    ctx.arc(i * s, j * s, 33, 0, Math.PI * 2);
    ctx.stroke();
  };
  X(-1, -1, '#ff5d8f');
  O(0, -1, '#6cc6ff');
  X(1, 0, '#ff5d8f');
  O(-1, 1, '#6cc6ff');
  X(0, 0, '#ff5d8f');
  O(1, 1, '#6cc6ff');
  ctx.restore();
}

async function rpsArt(ctx) {
  const items = [['hand-fist', 'amber', 180, 190, -10], ['hand', 'blue', 400, 230, 8], ['scissors', 'pink', 270, 390, -4]];
  for (const [icon, color, x, y, rot] of items) {
    const t = await tile(icon, color, 220);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 14;
    ctx.drawImage(t, -85, -85, 170, 170);
    ctx.restore();
  }
}

async function boxesArt(ctx, accent) {
  const pos = [[150, 330], [320, 360], [490, 330], [235, 190], [405, 190]];
  for (let i = 0; i < pos.length; i++) {
    const [x, y] = pos[i];
    const t = await tile(i === 1 ? 'bomb' : 'package', i === 1 ? 'red' : 'amber', 220);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((i % 2 ? 6 : -6) * Math.PI) / 180);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(t, -70, -70, 140, 140);
    ctx.restore();
  }
}

function textBlock(ctx, { kicker, title, line, chips = [] }, accent) {
  const R = W - 70;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  // kicker (English, letter-spaced)
  ctx.direction = 'ltr';
  ctx.font = F('Bold', 24);
  ctx.fillStyle = hexA(accent, 1);
  const spaced = kicker.split('').join(String.fromCharCode(8202) + String.fromCharCode(8202));
  ctx.fillText(spaced, R, 168);
  ctx.direction = 'rtl';
  // title
  let size = 128;
  ctx.font = F('Black', size);
  while (ctx.measureText(title).width > 560 && size > 70) ctx.font = F('Black', (size -= 4));
  ctx.save();
  ctx.shadowColor = hexA(accent, 0.55);
  ctx.shadowBlur = 40;
  const tg = ctx.createLinearGradient(0, 180, 0, 300);
  tg.addColorStop(0, '#ffffff');
  tg.addColorStop(1, '#d9d1ff');
  ctx.fillStyle = tg;
  ctx.fillText(title, R, 168 + size * 0.95);
  ctx.restore();
  // line
  if (line) {
    ctx.font = F('Medium', 33);
    ctx.fillStyle = 'rgba(228,224,255,0.78)';
    ctx.fillText(line, R, 168 + size * 0.95 + 78);
  }
  // chips
  let x = R;
  const y = 168 + size * 0.95 + 112;
  ctx.font = F('Bold', 26);
  for (const c of chips) {
    const w = ctx.measureText(c).width + 40;
    rr(ctx, x - w, y, w, 48, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = hexA(accent, 0.55);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#f1eeff';
    ctx.textBaseline = 'middle';
    ctx.fillText(c, x - 20, y + 26);
    ctx.textBaseline = 'alphabetic';
    x -= w + 12;
  }
  ctx.direction = 'ltr';
}

const BANNERS = {
  roulette: { accent: '#b26bff', kicker: 'ROULETTE', title: 'روليت', line: 'العجلة بتختار، وإنت بتقرر مين يطلع', chips: ['حتى 30 لاعب', 'آخر واحد بيفوز'], art: 'wheel' },
  mafia: { accent: '#ff4d5e', kicker: 'MAFIA', title: 'مافيا', line: 'اكشفوا المافيا قبل ما يخلّصوا عليكم', chips: ['حتى 20 لاعب', 'ليل ونهار'], main: 'venetian-mask', sats: [['moon', 'violet'], ['stethoscope', 'emerald'], ['search', 'blue'], ['skull', 'slate']] },
  chairs: { accent: '#2fd6c3', kicker: 'CHAIRS', title: 'الكراسي', line: 'كرسي ناقص كل جولة، اقعد بسرعة', chips: ['حتى 25 لاعب', 'سرعة'], main: 'armchair', sats: [['timer', 'slate'], ['zap', 'amber'], ['bomb', 'red']] },
  spy: { accent: '#8b7bff', kicker: 'OUTSIDER', title: 'برا السالفة', line: 'واحد بينكم ما بيعرف الكلمة، مين هو؟', chips: ['حتى 15 لاعب', 'تصويت'], main: 'user-round-search', sats: [['eye-off', 'slate'], ['vote', 'blurple'], ['message-circle', 'violet']] },
  xo: { accent: '#4aa8ff', kicker: 'XO CUP', title: 'بطولة XO', line: 'إقصائيات لحد ما يضل بطل واحد', chips: ['حتى 16 لاعب', 'بطولة'], art: 'xo' },
  rps: { accent: '#ffb02e', kicker: 'ROCK · PAPER · SCISSORS', title: 'حجرة ورقة مقص', line: 'كل جولة، الإشارة الخسرانة بتطلع', chips: ['حتى 25 لاعب', 'حظ وذكاء'], art: 'rps' },
  deathbox: { accent: '#ff4d6d', kicker: 'DEATH BOX', title: 'صندوق الموت', line: 'خمس صناديق، اثنين منهم فخ', chips: ['حتى 20 لاعب', 'حظ'], art: 'boxes' },
  rebelka: { accent: '#3fd9c6', kicker: 'REBELKA', title: 'ريبلكا', line: 'إنسان، حيوان، نبات، جماد، بلاد', chips: ['حتى 20 لاعب', 'كل الحروف'], art: 'letters' },
  fasttype: { accent: '#ffc83a', kicker: 'FAST TYPE', title: 'أسرع كاتب', line: 'أول واحد بيكتب الجملة صح بياخد النقطة', chips: ['5 جولات', 'كل الشات'], main: 'keyboard', sats: [['timer', 'slate'], ['zap', 'amber']] },
  flags: { accent: '#3ddc84', kicker: 'FLAGS', title: 'أعلام', line: 'شوف العلم واكتب اسم الدولة', chips: ['5 جولات', 'كل الشات'], main: 'flag', sats: [['earth', 'blue'], ['timer', 'slate']] },
  capitals: { accent: '#22c7e8', kicker: 'CAPITALS', title: 'عواصم', line: 'اكتب عاصمة الدولة قبل الكل', chips: ['5 جولات', 'كل الشات'], main: 'landmark', sats: [['map-pin', 'red'], ['timer', 'slate']] },
  unscramble: { accent: '#a37bff', kicker: 'UNSCRAMBLE', title: 'فكّك الكلمة', line: 'الحروف مخربطة، رتّبها بسرعة', chips: ['5 جولات', 'كل الشات'], main: 'spell-check', sats: [['shuffle', 'violet'], ['timer', 'slate']] },
  math: { accent: '#ff8a3d', kicker: 'QUICK MATH', title: 'حساب سريع', line: 'حل المسألة قبل ما حدا يسبقك', chips: ['5 جولات', 'كل الشات'], main: 'calculator', sats: [['zap', 'amber'], ['timer', 'slate']] },
  night: { accent: '#9b7bff', kicker: 'GAME NIGHT', title: 'سهرة الألعاب', line: 'ألعاب ورا بعض، وبالآخر أبطال السهرة', chips: ['كل أسبوع'], main: 'moon', sats: [['trophy', 'amber'], ['dices', 'violet'], ['star', 'amber']] },
  shop: { accent: '#ffb02e', kicker: 'GAME SHOP', title: 'متجر الألعاب', line: 'ميزات بتنشرى بنقاط اللعب، بدون مراهنات', chips: [], main: 'shopping-bag', sats: [['shield', 'blue'], ['heart', 'pink'], ['swords', 'red']] },
  top: { accent: '#ffcb47', kicker: 'LEADERBOARD', title: 'الترتيب', line: 'أقوى لاعبين السيرفر', chips: [], main: 'trophy', sats: [['crown', 'amber'], ['medal', 'amber'], ['star', 'amber']] },
  tempvoice: { accent: '#3fd9c6', kicker: 'TEMP VOICE', title: 'رومك الخاص', line: 'قفل، إخفاء، اسم، عدد، وطرد. كله من هون', chips: [], main: 'volume-2', sats: [['lock', 'slate'], ['users', 'blurple'], ['pencil', 'slate']] },
  khatma: { accent: '#34d399', kicker: 'KHATMA', title: 'الختمة الجماعية', line: 'جزء منك، وختمة منا كلنا', chips: [], main: 'book-open', sats: [['check', 'green'], ['moon', 'violet'], ['star', 'amber']] },
  tickets: { accent: '#9a7bff', kicker: 'SUPPORT', title: 'مركز الدعم', line: 'افتح تذكرة والفريق بيرد عليك', chips: [], main: 'ticket', sats: [['message-circle', 'blurple'], ['check', 'green'], ['users', 'slate']] },
  verify: { accent: '#2fd27a', kicker: 'VERIFICATION', title: 'التحقق', line: 'خطوة وحدة وبتفتحلك كل الرومات', chips: [], main: 'badge-check', sats: [['shield', 'blue'], ['lock-open', 'green']] },
  help: { accent: '#8e9bff', kicker: 'COMMANDS', title: 'ماركا بوت', line: 'كل أوامر البوت مرتبة بأقسام', chips: [], main: 'list', sats: [['shield', 'blue'], ['dices', 'violet'], ['ticket', 'violet'], ['gift', 'pink']] },
  appeal: { accent: '#5fb0ff', kicker: 'BAN APPEAL', title: 'طلب فك الحظر', line: 'احكي قصتك، والإدارة بتقرر', chips: [], main: 'scale', sats: [['mail', 'blue'], ['check', 'green'], ['x', 'red']] },
  backup: { accent: '#ffb02e', kicker: 'SERVER REPAIR', title: 'إصلاح السيرفر', line: 'المحذوف بيرجع زي ما كان', chips: [], main: 'archive', sats: [['wrench', 'amber'], ['rotate-ccw', 'blue'], ['shield', 'blue']] },
  radar: { accent: '#3fd9e8', kicker: 'NEWCOMER RADAR', title: 'عضو جديد ساكت', line: 'رحّبوا فيه قبل ما يطلع', chips: [], main: 'radar', sats: [['user-plus', 'green'], ['hand', 'amber'], ['bell', 'amber']] },
};

function lettersArt(ctx, accent) {
  const tiles = [['ب', 150, 215, -10, '#2fd6c3'], ['ر', 320, 175, 6, '#9a7bff'], ['ك', 470, 255, -4, '#ffb02e'], ['ل', 215, 390, 8, '#ff5d8f'], ['ن', 395, 410, -7, '#4aa8ff']];
  for (const [ch, x, y, rot, col] of tiles) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 12;
    rr(ctx, -72, -72, 144, 144, 34);
    const g = ctx.createLinearGradient(0, -72, 0, 72);
    g.addColorStop(0, col);
    g.addColorStop(1, hexA(col, 0.7));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = F('Black', 100);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText(ch, 0, 14);
    ctx.direction = 'ltr';
    ctx.restore();
  }
}

async function banner(key, b) {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  background(ctx, b.accent);
  if (b.art === 'wheel') wheelArt(ctx, b.accent);
  else if (b.art === 'xo') xoArt(ctx, b.accent);
  else if (b.art === 'rps') await rpsArt(ctx);
  else if (b.art === 'boxes') await boxesArt(ctx, b.accent);
  else if (b.art === 'letters') lettersArt(ctx, b.accent);
  else await stage(ctx, b.accent, b.main, b.sats);
  textBlock(ctx, b, b.accent);
  brandMark(ctx, W - 260, H - 82, 1);
  return c;
}

async function main() {
  const only = process.argv[2];
  for (const [name, [icon, color]] of Object.entries(ICONS)) {
    if (only && only !== 'icons') break;
    fs.writeFileSync(path.join(OUT, 'emoji', `${name}.png`), (await tile(icon, color, 128)).toBuffer('image/png'));
    const g = createCanvas(96, 96);
    g.getContext('2d').drawImage(await svgImage(icon, 96, '#ffffff', 2), 0, 0);
    fs.writeFileSync(path.join(OUT, 'glyph', `${name}.png`), g.toBuffer('image/png'));
  }
  for (const [key, b] of Object.entries(BANNERS)) {
    if (only && only !== 'banners' && only !== key) continue;
    const c = await banner(key, b);
    fs.writeFileSync(path.join(OUT, 'banner', `${key}.jpg`), c.toBuffer('image/jpeg', 90));
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ icons: Object.keys(ICONS), banners: Object.fromEntries(Object.entries(BANNERS).map(([k, b]) => [k, { accent: b.accent, title: b.title }])) }, null, 2));
  console.log('art built:', Object.keys(ICONS).length, 'icons,', Object.keys(BANNERS).length, 'banners');
}

if (require.main === module) main().catch((e) => (console.error(e), process.exit(1)));
module.exports = { ICONS, BANNERS, TILE, tile, svgImage };
