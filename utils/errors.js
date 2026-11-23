// Keeps the last errors in memory so bot owners can read them from the dashboard.
const util = require('util');

const MAX = 200;
const entries = [];
const original = console.error.bind(console);

console.error = (...args) => {
  original(...args);
  try {
    const text = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : util.inspect(a, { depth: 2 }))).join(' ');
    entries.unshift({ at: Date.now(), text: text.slice(0, 4000) });
    if (entries.length > MAX) entries.length = MAX;
  } catch {}
};

module.exports = {
  list: () => entries,
  clear: () => (entries.length = 0),
};
