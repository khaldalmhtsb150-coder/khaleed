// Command usage counters (per day, kept for 30 days) — shown in the owner panel.
const store = require('./store');

const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

function record(name) {
  const data = store.get('commandStats');
  const d = day();
  if (!data[d]) {
    data[d] = {};
    const cutoff = day(Date.now() - 30 * 86_400_000);
    for (const k of Object.keys(data)) if (k < cutoff) delete data[k];
  }
  data[d][name] = (data[d][name] || 0) + 1;
  store.save('commandStats');
}

function summary() {
  const data = store.get('commandStats');
  const today = data[day()] || {};
  const week = {};
  const weekCutoff = day(Date.now() - 6 * 86_400_000);
  const daily = [];
  for (const [d, counts] of Object.entries(data).sort()) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    daily.push({ day: d, total });
    if (d >= weekCutoff) for (const [n, c] of Object.entries(counts)) week[n] = (week[n] || 0) + c;
  }
  return {
    today: Object.values(today).reduce((a, b) => a + b, 0),
    week: Object.values(week).reduce((a, b) => a + b, 0),
    top: Object.entries(week).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
    daily: daily.slice(-14),
  };
}

module.exports = { record, summary };
