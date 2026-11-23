// Prayer times & Ramadan mode (free). Times are calculated astronomically (PrayTimes method) per city —
// they can differ by a minute or two from local mosque announcements.
const { Events } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');

// ---------- calculation ----------
const METHODS = {
  jordan: { name: 'وزارة الأوقاف الأردنية (تقريبي)', fajr: 18, isha: 18 },
  egypt: { name: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: 17.5 },
  makkah: { name: 'أم القرى', fajr: 18.5, ishaMin: 90 },
  gulf: { name: 'الإمارات', fajr: 18.2, isha: 18.2 },
  kuwait: { name: 'الكويت', fajr: 18, isha: 17.5 },
  qatar: { name: 'قطر', fajr: 18, ishaMin: 90 },
  mwl: { name: 'رابطة العالم الإسلامي', fajr: 18, isha: 17 },
  morocco: { name: 'المغرب', fajr: 19, isha: 17 },
};
const CITIES = {
  amman: { name: 'عمّان', lat: 31.9539, lng: 35.9106, tz: 'Asia/Amman', method: 'jordan' },
  zarqa: { name: 'الزرقاء', lat: 32.0728, lng: 36.088, tz: 'Asia/Amman', method: 'jordan' },
  irbid: { name: 'إربد', lat: 32.5556, lng: 35.85, tz: 'Asia/Amman', method: 'jordan' },
  aqaba: { name: 'العقبة', lat: 29.5321, lng: 35.0063, tz: 'Asia/Amman', method: 'jordan' },
  jerusalem: { name: 'القدس', lat: 31.7683, lng: 35.2137, tz: 'Asia/Jerusalem', method: 'jordan' },
  gaza: { name: 'غزة', lat: 31.5017, lng: 34.4668, tz: 'Asia/Gaza', method: 'jordan' },
  damascus: { name: 'دمشق', lat: 33.5138, lng: 36.2765, tz: 'Asia/Damascus', method: 'mwl' },
  beirut: { name: 'بيروت', lat: 33.8938, lng: 35.5018, tz: 'Asia/Beirut', method: 'mwl' },
  baghdad: { name: 'بغداد', lat: 33.3152, lng: 44.3661, tz: 'Asia/Baghdad', method: 'mwl' },
  cairo: { name: 'القاهرة', lat: 30.0444, lng: 31.2357, tz: 'Africa/Cairo', method: 'egypt' },
  alexandria: { name: 'الإسكندرية', lat: 31.2001, lng: 29.9187, tz: 'Africa/Cairo', method: 'egypt' },
  riyadh: { name: 'الرياض', lat: 24.7136, lng: 46.6753, tz: 'Asia/Riyadh', method: 'makkah' },
  jeddah: { name: 'جدة', lat: 21.4858, lng: 39.1925, tz: 'Asia/Riyadh', method: 'makkah' },
  mecca: { name: 'مكة المكرمة', lat: 21.3891, lng: 39.8579, tz: 'Asia/Riyadh', method: 'makkah' },
  medina: { name: 'المدينة المنورة', lat: 24.5247, lng: 39.5692, tz: 'Asia/Riyadh', method: 'makkah' },
  dubai: { name: 'دبي', lat: 25.2048, lng: 55.2708, tz: 'Asia/Dubai', method: 'gulf' },
  abudhabi: { name: 'أبوظبي', lat: 24.4539, lng: 54.3773, tz: 'Asia/Dubai', method: 'gulf' },
  kuwait: { name: 'الكويت', lat: 29.3759, lng: 47.9774, tz: 'Asia/Kuwait', method: 'kuwait' },
  doha: { name: 'الدوحة', lat: 25.2854, lng: 51.531, tz: 'Asia/Qatar', method: 'qatar' },
  manama: { name: 'المنامة', lat: 26.2285, lng: 50.586, tz: 'Asia/Bahrain', method: 'gulf' },
  muscat: { name: 'مسقط', lat: 23.588, lng: 58.3829, tz: 'Asia/Muscat', method: 'gulf' },
  casablanca: { name: 'الدار البيضاء', lat: 33.5731, lng: -7.5898, tz: 'Africa/Casablanca', method: 'morocco' },
  algiers: { name: 'الجزائر', lat: 36.7538, lng: 3.0588, tz: 'Africa/Algiers', method: 'mwl' },
  tunis: { name: 'تونس', lat: 36.8065, lng: 10.1815, tz: 'Africa/Tunis', method: 'mwl' },
  khartoum: { name: 'الخرطوم', lat: 15.5007, lng: 32.5599, tz: 'Africa/Khartoum', method: 'egypt' },
  sanaa: { name: 'صنعاء', lat: 15.3694, lng: 44.191, tz: 'Asia/Aden', method: 'makkah' },
};
const NAMES = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
const ADHAN = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const fix = (a, b) => {
  a -= b * Math.floor(a / b);
  return a < 0 ? a + b : a;
};
const dsin = (d) => Math.sin(rad(d));
const dcos = (d) => Math.cos(rad(d));
const dtan = (d) => Math.tan(rad(d));
const darcsin = (x) => deg(Math.asin(x));
const darccos = (x) => deg(Math.acos(Math.max(-1, Math.min(1, x))));
const darctan2 = (y, x) => deg(Math.atan2(y, x));
const darccot = (x) => deg(Math.atan(1 / x));

function julian(y, m, d) {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = darctan2(dcos(e) * dsin(L), dcos(L)) / 15;
  return { decl: darcsin(dsin(e) * dsin(L)), eqt: q / 15 - fix(RA, 24) };
}

/** UTC offset in hours for an IANA zone on a given date (handles DST). */
function tzOffset(tz, date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime()) / 3_600_000;
}
/** y/m/d of "today" in that zone. */
function localDate(tz, date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day };
}

/** Returns { fajr, sunrise, dhuhr, asr, maghrib, isha } as Date objects for the city's local day. */
function times(cityKey, date = new Date(), { ramadan = false } = {}) {
  const c = CITIES[cityKey] || CITIES.amman;
  const meth = METHODS[c.method] || METHODS.mwl;
  const { y, m, d } = localDate(c.tz, date);
  const jDate = julian(y, m, d) - c.lng / (15 * 24);
  const lat = c.lat;
  const midDay = (t) => fix(12 - sunPosition(jDate + t).eqt, 24);
  const angleTime = (angle, t, ccw) => {
    const { decl } = sunPosition(jDate + t);
    const T = (1 / 15) * darccos((-dsin(angle) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat)));
    return midDay(t) + (ccw ? -T : T);
  };
  const asrTime = (factor, t) => {
    const { decl } = sunPosition(jDate + t);
    return angleTime(-darccot(factor + dtan(Math.abs(lat - decl))), t);
  };
  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 };
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / 24]));
    t = {
      fajr: angleTime(meth.fajr, p.fajr, true),
      sunrise: angleTime(0.833, p.sunrise, true),
      dhuhr: midDay(p.dhuhr),
      asr: asrTime(1, p.asr),
      sunset: angleTime(0.833, p.sunset),
      isha: meth.isha ? angleTime(meth.isha, p.isha) : 0,
    };
  }
  if (meth.ishaMin) t.isha = t.sunset + (meth.ishaMin + (ramadan && c.method === 'makkah' ? 30 : 0)) / 60;
  t.maghrib = t.sunset;
  const out = {};
  for (const k of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    const solar = t[k] - c.lng / 15; // hours UTC
    // minute precision, rounded like mosque tables
    out[k] = new Date(Math.round((Date.UTC(y, m - 1, d) + solar * 3_600_000) / 60_000) * 60_000);
  }
  return out;
}

const hijri = (date = new Date(), tz = 'Asia/Amman') => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: tz, day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(date).map((x) => [x.type, x.value]));
  return { day: parseInt(p.day, 10), month: parseInt(p.month, 10), year: parseInt(p.year, 10) };
};
const isRamadan = (date, tz) => hijri(date, tz).month === 9;
const fmt = (d, tz) => d.toLocaleTimeString('ar', { timeZone: tz, hour: 'numeric', minute: '2-digit' });

// ---------- scheduler ----------
const DEFAULT = { enabled: false, channelId: '', city: 'amman', roleId: '', prayers: ADHAN, ramadan: true, suhoorMinutes: 30 };
const config = (gid) => ({ ...DEFAULT, ...(store.peek('prayerConfig', gid) || {}) });
const sent = new Map(); // gid → Set of keys already announced today

async function tick(client) {
  const all = store.get('prayerConfig');
  const now = Date.now();
  for (const [gid, raw] of Object.entries(all)) {
    const conf = { ...DEFAULT, ...raw };
    if (!conf.enabled) continue;
    const guild = client.guilds.cache.get(gid);
    const ch = guild && conf.channelId ? guild.channels.cache.get(conf.channelId) : null;
    if (!ch?.isTextBased()) continue;
    const c = CITIES[conf.city] || CITIES.amman;
    const ram = conf.ramadan && isRamadan(new Date(), c.tz);
    const t = times(conf.city, new Date(), { ramadan: ram });
    const done = sent.get(gid) || new Set();
    sent.set(gid, done);
    const mention = conf.roleId ? `<@&${conf.roleId}> ` : '';
    const events = [];
    for (const k of conf.prayers) events.push({ key: k, at: t[k].getTime() });
    if (ram) events.push({ key: 'suhoor', at: t.fajr.getTime() - conf.suhoorMinutes * 60_000 });
    for (const ev of events) {
      const id = `${new Date(ev.at).toISOString().slice(0, 10)}:${ev.key}`;
      if (done.has(id) || now < ev.at || now - ev.at > 3 * 60_000) continue;
      done.add(id);
      let text;
      if (ev.key === 'suhoor') text = `### 🌙 تذكير السحور\nباقي **${conf.suhoorMinutes} دقيقة** على أذان الفجر (${fmt(t.fajr, c.tz)}) حسب توقيت ${c.name}.`;
      else if (ev.key === 'maghrib' && ram) text = `### 🌙 حان موعد الإفطار\nأذان المغرب حسب توقيت ${c.name}. تقبّل الله صيامكم 🤍`;
      else text = `### 🕌 حان موعد أذان ${NAMES[ev.key]}\nحسب توقيت ${c.name}.`;
      await ch
        .send({ content: mention || undefined, embeds: [ui.embed().setDescription(text)], allowedMentions: { roles: conf.roleId ? [conf.roleId] : [] } })
        .catch(() => {});
    }
    if (done.size > 40) sent.set(gid, new Set([...done].slice(-20)));
  }
}

function init(client) {
  client.once(Events.ClientReady, () => setInterval(() => tick(client).catch((e) => console.error('[prayer]', e.message)), 30_000).unref());
}

module.exports = { init, times, CITIES, METHODS, NAMES, ADHAN, hijri, isRamadan, fmt, config, DEFAULT, tick };
