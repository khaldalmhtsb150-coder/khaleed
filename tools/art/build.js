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
// Flat and editorial: charcoal surfaces, one accent per piece, no gradients or glows.
// MarkaBot identity: charcoal and deep navy surfaces, a restrained royal purple, no gradients or glows.
const BRAND = { ink: '#0b0d12', surface: '#12151d', line: 'rgba(255,255,255,0.07)', text: '#eceef3', muted: '#9aa0ae', purple: '#6e56cf', lilac: '#a594f9' };
// Icon tiles: one flat colour each, tuned to sit together (and to keep a white glyph readable).
const TILE = {
  green: '#2f9e68',
  red: '#d9434a',
  blurple: '#5b5bd6',
  violet: '#6e56cf',
  slate: '#3c4252',
  amber: '#c98a1e',
  blue: '#3e63dd',
  pink: '#c2408f',
  teal: '#12a594',
  emerald: '#2f9e68',
};

// name → [lucide icon, tile colour]
const ICONS = {
  join: ['log-in', 'green'], leave: ['log-out', 'red'], start: ['play', 'blurple'], cancel: ['x', 'red'],
  players: ['users', 'slate'], help: ['circle-question-mark', 'slate'], info: ['info', 'blue'],
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
  warn: ['triangle-alert', 'amber'], timer: ['timer', 'slate'], gift: ['gift', 'pink'], voice: ['volume-2', 'teal'], backup: ['archive', 'blue'],
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

/** A flat rounded tile with a white glyph — the look of the bot's buttons. */
async function tile(icon, color, S = 128) {
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  const pad = S * 0.04;
  rr(ctx, pad, pad, S - pad * 2, S - pad * 2, S * 0.24);
  ctx.fillStyle = TILE[color];
  ctx.fill();
  const gs = Math.round(S * 0.56);
  ctx.drawImage(await svgImage(icon, gs, '#ffffff', 2.3), (S - gs) / 2, (S - gs) / 2, gs, gs);
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
  ctx.fillStyle = BRAND.ink;
  ctx.fillRect(0, 0, W, H);
  // the illustration sits on a slightly lighter panel; the accent band marks the reading side
  ctx.fillStyle = BRAND.surface;
  ctx.fillRect(0, 0, 600, H);
  ctx.fillStyle = BRAND.line;
  ctx.fillRect(600, 0, 2, H);
  ctx.fillStyle = accent;
  ctx.fillRect(W - 12, 0, 12, H);
  // a quiet dot grid on the panel, for texture without decoration
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 30; x < 600; x += 30) for (let y = 30; y < H; y += 30) ctx.fillRect(x, y, 2, 2);
}

function brandMark(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(10, 30);
  ctx.lineTo(10, 12);
  ctx.lineTo(20, 20.5);
  ctx.lineTo(30, 12);
  ctx.lineTo(30, 30);
  ctx.strokeStyle = BRAND.text;
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(20, 6.5, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = BRAND.lilac;
  ctx.fill();
  ctx.restore();
  ctx.font = F('ExtraBold', 22);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = BRAND.text;
  ctx.fillText('Marka', x + 42 * s, y + 21 * s);
  const w = ctx.measureText('Marka').width;
  ctx.fillStyle = BRAND.lilac;
  ctx.fillText('Bot', x + 42 * s + w, y + 21 * s);
}

/** The main glyph in an outlined ring, with the supporting icons as small flat tiles in a row. */
async function stage(ctx, accent, main, sats = []) {
  const cx = 300;
  const cy = sats.length ? 262 : 300;
  ctx.beginPath();
  ctx.arc(cx, cy, 150, 0, Math.PI * 2);
  ctx.fillStyle = BRAND.ink;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.drawImage(await svgImage(main, 150, accent, 1.6), cx - 75, cy - 75, 150, 150);
  const n = Math.min(sats.length, 4);
  const size = 64;
  const gap = 18;
  let x = cx - (n * size + (n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    const [icon, color] = sats[i];
    ctx.drawImage(await tile(icon, color, size), x, cy + 190, size, size);
    x += size + gap;
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
  ctx.fillStyle = BRAND.purple;
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
  const R = W - 76;
  ctx.textBaseline = 'alphabetic';
  // kicker: a short rule and a letter-spaced English label
  ctx.fillStyle = accent;
  ctx.fillRect(R - 40, 156, 40, 5);
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.font = F('Bold', 22);
  ctx.fillText(kicker.split('').join(String.fromCharCode(8202, 8202)), R - 56, 166);
  ctx.direction = 'rtl';
  // title
  let size = 112;
  ctx.font = F('Black', size);
  while (ctx.measureText(title).width > 500 && size > 64) ctx.font = F('Black', (size -= 4));
  ctx.fillStyle = BRAND.text;
  ctx.fillText(title, R, 190 + size * 0.92);
  let y = 190 + size * 0.92;
  if (line) {
    ctx.font = F('Medium', 30);
    ctx.fillStyle = BRAND.muted;
    ctx.fillText(line, R, (y += 66));
  }
  // chips: flat outlined labels
  let x = R;
  y += 40;
  ctx.font = F('Bold', 24);
  for (const c of chips) {
    const w = ctx.measureText(c).width + 36;
    rr(ctx, x - w, y, w, 46, 10);
    ctx.strokeStyle = BRAND.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = BRAND.text;
    ctx.textBaseline = 'middle';
    ctx.fillText(c, x - 18, y + 25);
    ctx.textBaseline = 'alphabetic';
    x -= w + 12;
  }
  ctx.direction = 'ltr';
}

const BANNERS = {
  roulette: { accent: '#8e4ec6', kicker: 'ROULETTE', title: 'روليت', line: 'العجلة بتختار، وإنت بتقرر مين يطلع', chips: ['حتى 30 لاعب', 'آخر واحد بيفوز'], art: 'wheel' },
  mafia: { accent: '#e5484d', kicker: 'MAFIA', title: 'مافيا', line: 'اكشفوا المافيا قبل ما يخلّصوا عليكم', chips: ['حتى 20 لاعب', 'ليل ونهار'], main: 'venetian-mask', sats: [['moon', 'violet'], ['stethoscope', 'emerald'], ['search', 'blue'], ['skull', 'slate']] },
  chairs: { accent: '#12a594', kicker: 'CHAIRS', title: 'الكراسي', line: 'كرسي ناقص كل جولة، اقعد بسرعة', chips: ['حتى 25 لاعب', 'سرعة'], main: 'armchair', sats: [['timer', 'slate'], ['zap', 'amber'], ['bomb', 'red']] },
  spy: { accent: '#6e56cf', kicker: 'OUTSIDER', title: 'برا السالفة', line: 'واحد بينكم ما بيعرف الكلمة، مين هو؟', chips: ['حتى 15 لاعب', 'تصويت'], main: 'user-round-search', sats: [['eye-off', 'slate'], ['vote', 'blurple'], ['message-circle', 'violet']] },
  xo: { accent: '#3e63dd', kicker: 'XO CUP', title: 'بطولة XO', line: 'إقصائيات لحد ما يضل بطل واحد', chips: ['حتى 16 لاعب', 'بطولة'], art: 'xo' },
  rps: { accent: '#d9932b', kicker: 'ROCK · PAPER · SCISSORS', title: 'حجرة ورقة مقص', line: 'كل جولة، الإشارة الخسرانة بتطلع', chips: ['حتى 25 لاعب', 'حظ وذكاء'], art: 'rps' },
  deathbox: { accent: '#e5484d', kicker: 'DEATH BOX', title: 'صندوق الموت', line: 'خمس صناديق، اثنين منهم فخ', chips: ['حتى 20 لاعب', 'حظ'], art: 'boxes' },
  rebelka: { accent: '#12a594', kicker: 'REBELKA', title: 'ريبلكا', line: 'إنسان، حيوان، نبات، جماد، بلاد', chips: ['حتى 20 لاعب', 'كل الحروف'], art: 'letters' },
  fasttype: { accent: '#d4a72c', kicker: 'FAST TYPE', title: 'أسرع كاتب', line: 'أول واحد بيكتب الجملة صح بياخد النقطة', chips: ['5 جولات', 'كل الشات'], main: 'keyboard', sats: [['timer', 'slate'], ['zap', 'amber']] },
  flags: { accent: '#30a46c', kicker: 'FLAGS', title: 'أعلام', line: 'شوف العلم واكتب اسم الدولة', chips: ['5 جولات', 'كل الشات'], main: 'flag', sats: [['earth', 'blue'], ['timer', 'slate']] },
  capitals: { accent: '#0d9cc0', kicker: 'CAPITALS', title: 'عواصم', line: 'اكتب عاصمة الدولة قبل الكل', chips: ['5 جولات', 'كل الشات'], main: 'landmark', sats: [['map-pin', 'red'], ['timer', 'slate']] },
  unscramble: { accent: '#8e4ec6', kicker: 'UNSCRAMBLE', title: 'فكّك الكلمة', line: 'الحروف مخربطة، رتّبها بسرعة', chips: ['5 جولات', 'كل الشات'], main: 'spell-check', sats: [['shuffle', 'violet'], ['timer', 'slate']] },
  math: { accent: '#e07a2f', kicker: 'QUICK MATH', title: 'حساب سريع', line: 'حل المسألة قبل ما حدا يسبقك', chips: ['5 جولات', 'كل الشات'], main: 'calculator', sats: [['zap', 'amber'], ['timer', 'slate']] },
  night: { accent: '#6e56cf', kicker: 'GAME NIGHT', title: 'سهرة الألعاب', line: 'ألعاب ورا بعض، وبالآخر أبطال السهرة', chips: ['كل أسبوع'], main: 'moon', sats: [['trophy', 'amber'], ['dices', 'violet'], ['star', 'amber']] },
  shop: { accent: '#d9932b', kicker: 'GAME SHOP', title: 'متجر الألعاب', line: 'ميزات بتنشرى بنقاط اللعب، بدون مراهنات', chips: [], main: 'shopping-bag', sats: [['shield', 'blue'], ['heart', 'pink'], ['swords', 'red']] },
  top: { accent: '#d4a72c', kicker: 'LEADERBOARD', title: 'الترتيب', line: 'أقوى لاعبين السيرفر', chips: [], main: 'trophy', sats: [['crown', 'amber'], ['medal', 'amber'], ['star', 'amber']] },
  tempvoice: { accent: '#12a594', kicker: 'TEMP VOICE', title: 'رومك الخاص', line: 'قفل، إخفاء، اسم، عدد، وطرد. كله من هون', chips: [], main: 'volume-2', sats: [['lock', 'slate'], ['users', 'blurple'], ['pencil', 'slate']] },
  khatma: { accent: '#30a46c', kicker: 'KHATMA', title: 'الختمة الجماعية', line: 'جزء منك، وختمة منا كلنا', chips: [], main: 'book-open', sats: [['check', 'green'], ['moon', 'violet'], ['star', 'amber']] },
  tickets: { accent: '#3e63dd', kicker: 'SUPPORT', title: 'مركز الدعم', line: 'افتح تذكرة والفريق بيرد عليك', chips: [], main: 'ticket', sats: [['message-circle', 'blurple'], ['check', 'green'], ['users', 'slate']] },
  verify: { accent: '#30a46c', kicker: 'VERIFICATION', title: 'التحقق', line: 'خطوة وحدة وبتفتحلك كل الرومات', chips: [], main: 'badge-check', sats: [['shield', 'blue'], ['lock-open', 'green']] },
  help: { accent: '#6e56cf', kicker: 'COMMANDS', title: 'ماركا بوت', line: 'كل أوامر البوت مرتبة بأقسام', chips: [], main: 'list', sats: [['shield', 'blue'], ['dices', 'violet'], ['ticket', 'violet'], ['gift', 'pink']] },
  apply: { accent: '#6e56cf', kicker: 'STAFF APPLICATIONS', title: 'تقديم الإدارة', line: 'قدّم، وخلّينا نتعرّف عليك', chips: [], main: 'user-check', sats: [['clipboard-list', 'blue'], ['shield', 'blue'], ['star', 'amber']] },
  appeal: { accent: '#3e63dd', kicker: 'BAN APPEAL', title: 'طلب فك الحظر', line: 'احكي قصتك، والإدارة بتقرر', chips: [], main: 'scale', sats: [['mail', 'blue'], ['check', 'green'], ['x', 'red']] },
  backup: { accent: '#d9932b', kicker: 'SERVER REPAIR', title: 'إصلاح السيرفر', line: 'المحذوف بيرجع زي ما كان', chips: [], main: 'archive', sats: [['wrench', 'amber'], ['rotate-ccw', 'blue'], ['shield', 'blue']] },
  radar: { accent: '#0d9cc0', kicker: 'NEWCOMER RADAR', title: 'عضو جديد ساكت', line: 'رحّبوا فيه قبل ما يطلع', chips: [], main: 'radar', sats: [['user-plus', 'green'], ['hand', 'amber'], ['bell', 'amber']] },
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
    ctx.fillStyle = col;
    ctx.fill();
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
  // flat look: the hand-drawn illustrations set shadows; ignore them
  for (const k of ['shadowBlur', 'shadowOffsetX', 'shadowOffsetY']) Object.defineProperty(ctx, k, { get: () => 0, set: () => {}, configurable: true });
  if (b.art === 'wheel') wheelArt(ctx, b.accent);
  else if (b.art === 'xo') xoArt(ctx, b.accent);
  else if (b.art === 'rps') await rpsArt(ctx);
  else if (b.art === 'boxes') await boxesArt(ctx, b.accent);
  else if (b.art === 'letters') lettersArt(ctx, b.accent);
  else await stage(ctx, b.accent, b.main, b.sats);
  textBlock(ctx, b, b.accent);
  brandMark(ctx, 640, H - 70, 1);
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
