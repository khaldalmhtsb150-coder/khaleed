// Images uploaded from the dashboard (welcome backgrounds, bot avatar/banner).
// Stored in data/uploads and served at /media/<file>.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./store');

const UPLOADS = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const MIME = Object.fromEntries(Object.entries(TYPES).map(([m, e]) => [e, m]));

function parseDataUri(dataUri) {
  const m = String(dataUri || '').match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('صيغة الصورة غير مدعومة (PNG / JPG / GIF / WEBP)');
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > MAX_BYTES) throw new Error('حجم الصورة أكبر من 8MB');
  return { mime: m[1], buffer };
}

/** Saves a data: URI and returns its public path (/media/...). Old file with the same prefix is removed. */
function saveDataUri(dataUri, prefix) {
  const { mime, buffer } = parseDataUri(dataUri);
  const safe = String(prefix).replace(/[^\w-]/g, '');
  for (const f of fs.readdirSync(UPLOADS)) if (f.startsWith(`${safe}-`)) fs.unlinkSync(path.join(UPLOADS, f));
  const name = `${safe}-${crypto.randomBytes(4).toString('hex')}.${TYPES[mime]}`;
  fs.writeFileSync(path.join(UPLOADS, name), buffer);
  return `/media/${name}`;
}

function remove(prefix) {
  const safe = String(prefix).replace(/[^\w-]/g, '');
  for (const f of fs.readdirSync(UPLOADS)) if (f.startsWith(`${safe}-`)) fs.unlinkSync(path.join(UPLOADS, f));
}

const isLocal = (p) => typeof p === 'string' && /^\/media\/[\w-]+\.(png|jpg|gif|webp)$/.test(p);

/** Absolute file path for a /media/... value, or null. */
function localPath(p) {
  if (!isLocal(p)) return null;
  const file = path.join(UPLOADS, path.basename(p));
  return fs.existsSync(file) ? file : null;
}

function toDataUri(p) {
  const file = localPath(p);
  if (!file) return null;
  const ext = path.extname(file).slice(1);
  return `data:${MIME[ext]};base64,${fs.readFileSync(file).toString('base64')}`;
}

/** Downloads an image URL into a data: URI (used when the user pastes a link instead of uploading). */
async function fetchToDataUri(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error('تعذر تحميل الصورة من الرابط');
  const mime = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!TYPES[mime]) throw new Error('الرابط ليس صورة مدعومة');
  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error('حجم الصورة أكبر من 8MB');
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

module.exports = { UPLOADS, saveDataUri, remove, isLocal, localPath, toDataUri, fetchToDataUri, parseDataUri };
