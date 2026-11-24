// Local JSON storage — no external database.
// Every file in /data is cached in memory, writes are debounced and atomic (tmp + rename),
// so the bot and the dashboard (same process) always see the same state.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULTS = {
  admins: [],
  blacklist: { users: [], servers: [] },
  giveaways: [],
  drops: {},
  greetings: {},
  welcome: {},
  disabledCommands: {},
  invites: {},
  wheelRewards: {},
  inviteConfig: {},
  autoLine: {},
  feedback: {},
  jail: {},
  jailConfig: {},
  logsConfig: {},
  customReplies: {},
  botSettings: { status: '/help', activityType: 'Watching' },
  prefixes: {},
  linkProtection: {},
  tickets: {},
  ticketConfig: {},
  staffRatings: {},
  emojis: {},
  guildSettings: {},
  // premium
  premiumCodes: {},
  botProfiles: {},
  guildEmojis: {},
  giveawayConfig: {},
  protectionConfig: {},
  ticketStats: {},
  // levels
  levels: {},
  levelConfig: {},
  // premium control (global) + launch period servers + shop purchases
  premiumConfig: {},
  launchGuilds: {},
  shopOrders: {},
  // batch 2
  automodConfig: {},
  automodStrikes: {},
  roleMenus: {},
  tempRoles: {},
  scheduledEmbeds: {},
  verifyConfig: {},
  purgeConfig: {},
  // batch 3
  kafeelConfig: {},
  kafeelPairs: {},
  kafeelStats: {},
  prayerConfig: {},
  adhkarConfig: {},
  adhkarState: {},
  tasbeeh: {},
  gamesConfig: {},
  gameStats: {},
  gamePerks: {},
  gamesState: {},
  tempVoice: {},
  tempRooms: {},
  appealsConfig: {},
  appeals: {},
  khatmaConfig: {},
  khatma: {},
  radarConfig: {},
  radar: {},
  backupConfig: {},
  youtube: {},
  staffActivity: {},
  staffReportLast: {},
  wrappedConfig: {},
  wrappedStats: {},
};

const cache = {};
const timers = {};

function file(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function load(name) {
  const def = name in DEFAULTS ? clone(DEFAULTS[name]) : {};
  try {
    if (!fs.existsSync(file(name))) {
      fs.writeFileSync(file(name), JSON.stringify(def, null, 2));
      cache[name] = def;
    } else {
      const raw = fs.readFileSync(file(name), 'utf8').trim();
      cache[name] = raw ? JSON.parse(raw) : def;
    }
  } catch (err) {
    console.error(`[store] failed to read ${name}.json, using defaults:`, err.message);
    // keep the unreadable file instead of overwriting it, so it can be repaired by hand
    try { fs.copyFileSync(file(name), path.join(DATA_DIR, `${name}.broken-${Date.now()}.json.bak`)); } catch {}
    cache[name] = def;
  }
  return cache[name];
}

function writeNow(name) {
  if (!(name in cache)) return;
  const target = file(name);
  const tmp = `${target}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(cache[name], null, 2));
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error(`[store] failed to write ${name}.json:`, err.message);
  }
}

function get(name) {
  return name in cache ? cache[name] : load(name);
}

function save(name) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => {
    delete timers[name];
    writeNow(name);
  }, 250);
}

function set(name, value) {
  cache[name] = value;
  save(name);
  return value;
}

/** Per-guild object inside a keyed file. Creates it (with defaults) when missing. */
function guild(name, guildId, defaults = {}) {
  const data = get(name);
  if (!data[guildId] || typeof data[guildId] !== 'object') data[guildId] = clone(defaults);
  else for (const [k, v] of Object.entries(defaults)) if (!(k in data[guildId])) data[guildId][k] = clone(v);
  return data[guildId];
}

/** Read without creating. */
function peek(name, guildId) {
  return get(name)[guildId];
}

function flush() {
  for (const name of Object.keys(timers)) {
    clearTimeout(timers[name]);
    delete timers[name];
    writeNow(name);
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    process.exit(0);
  });
}
process.on('exit', flush);

for (const name of Object.keys(DEFAULTS)) get(name);

// ---------- automatic backups ----------
// A copy of every data file goes to data/backups/<date>/ on startup and every 6 hours (newest 14 kept).
// To restore: stop the bot, copy the files from a backup folder back into data/, start the bot.
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
function backup() {
  try {
    flush();
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
    const hasData = files.some((f) => {
      try {
        const name = f.slice(0, -5);
        const data = JSON.stringify(JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));
        return data !== JSON.stringify(name in DEFAULTS ? DEFAULTS[name] : {});
      } catch {
        return false;
      }
    });
    if (!hasData) return; // never let an empty install replace real backups
    const stamp = new Date().toISOString().slice(0, 13).replace('T', '_');
    const dir = path.join(BACKUP_DIR, stamp);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.copyFileSync(path.join(DATA_DIR, f), path.join(dir, f));
    const all = fs.readdirSync(BACKUP_DIR).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 14))) fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true });
  } catch (err) {
    console.error('[store] backup failed:', err.message);
  }
}
setTimeout(backup, 5_000).unref();
setInterval(backup, 6 * 3_600_000).unref();

module.exports = { get, set, save, guild, peek, flush, backup, DATA_DIR, DEFAULTS };
