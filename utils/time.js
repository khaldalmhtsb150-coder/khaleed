const UNITS = {
  s: 1000, sec: 1000, ث: 1000,
  m: 60_000, min: 60_000, د: 60_000,
  h: 3_600_000, hr: 3_600_000, س: 3_600_000,
  d: 86_400_000, day: 86_400_000, ي: 86_400_000,
  w: 604_800_000, أ: 604_800_000,
};

/** "1h", "30m", "1d12h", "2w" → ms. Returns null when invalid. */
function parseDuration(input) {
  if (!input) return null;
  const text = String(input).trim().toLowerCase();
  const re = /(\d+)\s*(sec|min|hr|day|s|m|h|d|w|ث|د|س|ي|أ)/g;
  let total = 0;
  let matched = '';
  let m;
  while ((m = re.exec(text))) {
    total += parseInt(m[1], 10) * UNITS[m[2]];
    matched += m[0];
  }
  if (!total || matched.replace(/\s/g, '') !== text.replace(/\s/g, '')) return null;
  return total;
}

function arabicUnit(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** 90061000 → "يوم و ساعة و دقيقة" */
function formatDuration(ms) {
  if (!ms || ms < 1000) return 'أقل من ثانية';
  const parts = [];
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d) parts.push(arabicUnit(d, 'يوم', 'يومين', 'أيام', 'يوماً'));
  if (h) parts.push(arabicUnit(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة'));
  if (m) parts.push(arabicUnit(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'));
  if (!d && !h && s) parts.push(arabicUnit(s, 'ثانية', 'ثانيتين', 'ثوانٍ', 'ثانية'));
  return parts.join(' و ');
}

function formatDays(days) {
  if (days === 0) return 'أقل من يوم';
  return arabicUnit(days, 'يوم واحد', 'يومين', 'أيام', 'يوماً');
}

const ts = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

module.exports = { parseDuration, formatDuration, formatDays, ts };
