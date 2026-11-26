// Premium: plans, limits, activation codes.
// Activated per server from the owner panel or by redeeming a code (/premium or the dashboard).
const crypto = require('crypto');
const store = require('./store');

const DAY = 86_400_000;

/** Numeric limits per plan. Infinity = no limit. */
const PLANS = {
  free: {
    ticketDepartments: 4,
    ticketMaxOpen: 1,
    wheelRewards: 15,
    roleMenus: 3,
    purgeChannels: 1,
    aiDaily: 60,
    aiFacts: 80,
    applyPositions: 2,
  },
  premium: {
    ticketDepartments: 25,
    ticketMaxOpen: 5,
    wheelRewards: Infinity,
    roleMenus: 50,
    purgeChannels: 10,
    aiDaily: 800,
    aiFacts: 600,
    applyPositions: 15,
  },
};

/** Features that only work on premium servers (shown with 👑 in the dashboard). */
const FEATURES = {
  botProfile: 'شكل البوت المخصص',
  guildEmojis: 'إيموجيات البوت الخاصة',
  giveawayMessage: 'تخصيص رسالة القيفاواي',
  giveawayRequirements: 'شروط دخول القيفاواي',
  giveawayBonus: 'إدخالات إضافية للرتب',
  ticketForms: 'فورم أسئلة التذاكر',
  ticketAutoClose: 'الإغلاق التلقائي للتذاكر',
  ticketStats: 'إحصائيات التذاكر',
  welcomeEditor: 'محرر صورة الترحيب الكامل',
  antiRaid: 'Anti-Raid',
  antiNuke: 'Anti-Nuke',
  automodPlus: 'AutoMod المتقدم (قواعد لكل قناة، عقوبات متدرجة، كابس وإيموجي)',
  roleMenusPlus: 'قوائم الرتب المنسدلة والرتب المؤقتة',
  embedSchedule: 'جدولة رسائل الإمبد وإرسالها باسم وصورة خاصة',
  captcha: 'كابتشا بالصورة وعمر الحساب',
  impersonation: 'كشف انتحال الإدارة',
  staffReport: 'تقرير أداء الإدارة بأي وقت (المجاني مرة بالشهر)',
  rankCard: 'تخصيص بطاقة الرانك',
  xpBoost: 'مضاعفة XP لرتب وقنوات',
  wrappedPlus: 'ملخص السيرفر الأسبوعي والمخصص',
  wheelImage: 'صورة خاصة لعجلة الحظ',
  backupPlus: 'نسخ احتياطية للسيرفر لآخر 7 أيام (المجاني 3)',
  youtubePlus: 'تنبيهات يوتيوب لحد 10 قنوات (المجاني 2)',
  gameArt: 'صور خاصة لكل لعبة وعجلة الروليت',
  hideBrand: 'إخفاء زر "ضيف ماركا" من رسائل البوت',
};

const LIMIT_LABELS = {
  ticketDepartments: 'أقسام التذاكر',
  ticketMaxOpen: 'التذاكر المفتوحة للعضو',
  wheelRewards: 'جوائز العجلة',
  roleMenus: 'لوحات الرتب',
  purgeChannels: 'قنوات المسح التلقائي',
  aiDaily: 'ردود المساعد الذكي باليوم',
  aiFacts: 'معلومات المساعد الذكي',
  applyPositions: 'مناصب تقديم الإدارة',
};

function get(guildId) {
  if (!guildId) return null;
  const p = store.get('premium')[guildId];
  if (!p) return null;
  if (p.until && p.until < Date.now()) return null;
  return p;
}

// ---------- owner controls: launch mode & per-feature switches ----------
// premiumConfig (global): { launch: { enabled, endsAt, noticeSent, giftDays, giftGiven }, free: { feature: true|false }, shop: {...} }
// Features that are free unless the owner switches them back to premium:
const DEFAULT_FREE = { antiNuke: true };

const config = () => store.get('premiumConfig');
function launch() {
  const l = config().launch || {};
  return { enabled: false, endsAt: null, noticeSent: false, giftDays: 30, giftGiven: false, ...l };
}
/** Launch period: every premium feature and limit is free for everyone. */
const launchActive = () => {
  const l = launch();
  return Boolean(l.enabled && (!l.endsAt || l.endsAt > Date.now()));
};
/** Is this feature free for everyone right now (owner switch, or default)? */
const isFree = (feature) => {
  const f = config().free || {};
  return feature in f ? Boolean(f[feature]) : Boolean(DEFAULT_FREE[feature]);
};

/** Real paid premium only (used for "your subscription" UI and gifts). */
const isPremium = (guildId) => Boolean(get(guildId));
/** Premium perks apply: paid premium or launch period. */
const perks = (guildId) => isPremium(guildId) || launchActive();
const has = (guildId, feature) => Boolean(FEATURES[feature]) && (perks(guildId) || isFree(feature));
const limits = (guildId) => (perks(guildId) ? PLANS.premium : PLANS.free);
const limit = (guildId, key) => limits(guildId)[key];

/** Status object for the dashboard / commands. */
function status(guildId) {
  const raw = store.get('premium')[guildId] || null;
  const active = isPremium(guildId);
  return {
    active,
    until: raw?.until || null,
    permanent: Boolean(raw && !raw.until),
    expired: Boolean(raw && !active),
    daysLeft: active && raw.until ? Math.max(0, Math.ceil((raw.until - Date.now()) / DAY)) : null,
    limits: limits(guildId),
    plans: PLANS,
    features: FEATURES,
    limitLabels: LIMIT_LABELS,
    launch: { active: launchActive(), endsAt: launch().endsAt },
    unlocked: Object.fromEntries(Object.keys(FEATURES).map((f) => [f, has(guildId, f)])),
    freeFeatures: Object.keys(FEATURES).filter(isFree),
  };
}

const lockedText = (feature) => `${FEATURES[feature] || 'هذه الميزة'} متاحة للسيرفرات البريميوم فقط 👑`;
const limitText = (key, max) =>
  `وصلت للحد الأقصى في ${LIMIT_LABELS[key] || 'هذه الميزة'} (${max}). رقّي السيرفر للبريميوم 👑 لزيادة الحد.`;

/**
 * Activate or extend premium. days = 0/null → permanent.
 * Extending an active subscription adds the days on top of the remaining time.
 */
const activateHooks = [];
/** Run fn(guildId) whenever premium is activated or extended. */
function onActivate(fn) {
  activateHooks.push(fn);
}

function activate(guildId, days, meta = {}) {
  const all = store.get('premium');
  const prev = all[guildId];
  const stillActive = prev && (!prev.until || prev.until > Date.now());
  let until = null;
  if (days && days > 0) {
    if (stillActive && !prev.until) until = null; // already permanent
    else until = (stillActive ? prev.until : Date.now()) + days * DAY;
  }
  all[guildId] = { ...(stillActive ? prev : {}), until, at: Date.now(), warned: false, expiredHandled: false, ...meta };
  store.save('premium');
  for (const fn of activateHooks) {
    try {
      fn(guildId);
    } catch (e) {
      console.error('[premium] hook', e.message);
    }
  }
  return all[guildId];
}

function deactivate(guildId) {
  const all = store.get('premium');
  delete all[guildId];
  store.save('premium');
}

// ---------- activation codes ----------
const codes = () => store.get('premiumCodes');

function generateCodes(count, days, { by = null, note = '' } = {}) {
  const out = [];
  const all = codes();
  for (let i = 0; i < Math.min(50, Math.max(1, count)); i++) {
    let code;
    do {
      const part = () => crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
      code = `MARKA-${part()}-${part()}-${part()}`;
    } while (all[code]);
    all[code] = { days: days > 0 ? days : 0, note: String(note || '').slice(0, 200), createdBy: by, createdAt: Date.now(), usedBy: null, usedGuild: null, usedAt: null };
    out.push(code);
  }
  store.save('premiumCodes');
  return out;
}

/** Returns { ok, error?, days, until } */
function redeem(rawCode, guildId, userId) {
  const code = String(rawCode || '').trim().toUpperCase();
  const c = codes()[code];
  if (!c) return { ok: false, error: 'الكود غير صحيح.' };
  if (c.usedAt) return { ok: false, error: 'هذا الكود مستخدم مسبقاً.' };
  c.usedBy = userId;
  c.usedGuild = guildId;
  c.usedAt = Date.now();
  store.save('premiumCodes');
  const p = activate(guildId, c.days, { by: userId, note: `كود ${code}` });
  return { ok: true, days: c.days, until: p.until, code };
}

function deleteCode(code) {
  delete codes()[code];
  store.save('premiumCodes');
}

module.exports = {
  PLANS,
  FEATURES,
  LIMIT_LABELS,
  get,
  isPremium,
  has,
  limits,
  limit,
  status,
  lockedText,
  limitText,
  activate,
  deactivate,
  codes,
  generateCodes,
  redeem,
  deleteCode,
  onActivate,
  config,
  launch,
  launchActive,
  isFree,
  perks,
  DEFAULT_FREE,
};
