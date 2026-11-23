// Premium expiry: warns the server owner 3 days before, and cleans up premium-only looks when it ends.
// Data is never deleted — extra items simply stop working until the server renews.
const { Events } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const botlog = require('../utils/botlog');
const botProfile = require('./botProfile');
const premium = require('../utils/premium');

const DAY = 86_400_000;

async function dmOwner(guild, text) {
  const owner = await guild.fetchOwner().catch(() => null);
  if (!owner) return;
  await owner
    .send({ embeds: [ui.embed().setAuthor({ name: guild.name, iconURL: guild.iconURL() || undefined }).setDescription(text)] })
    .catch(() => {});
}

async function check(client) {
  const all = store.get('premium');
  const now = Date.now();
  let changed = false;
  for (const [id, p] of Object.entries(all)) {
    if (!p.until) continue;
    const guild = client.guilds.cache.get(id);

    if (p.until > now && p.until - now <= 3 * DAY && !p.warned) {
      p.warned = true;
      changed = true;
      if (guild) {
        const days = Math.max(1, Math.ceil((p.until - now) / DAY));
        await dmOwner(
          guild,
          `### 👑 اشتراك البريميوم قارب على الانتهاء\nبريميوم **${guild.name}** ينتهي خلال **${days}** ${days === 1 ? 'يوم' : 'أيام'} (<t:${Math.floor(p.until / 1000)}:F>).\n${ui.hint('جدّد الاشتراك حتى لا تتوقف الميزات المميزة.')}`
        );
      }
    }

    if (p.until <= now && !p.expiredHandled) {
      p.expiredHandled = true;
      changed = true;
      if (guild) {
        if (!premium.has(id, 'botProfile')) await botProfile.reset(guild);
        await dmOwner(
          guild,
          `### 👑 انتهى اشتراك البريميوم\nانتهى بريميوم **${guild.name}**. إعداداتك محفوظة كما هي، وستعود الميزات المميزة فور التجديد.`
        );
        botlog.log('owner', `انتهى البريميوم لـ ${guild.name}`, { guild });
      }
    }
  }
  if (changed) store.save('premium');
}

// ---------- launch period ----------
/** Remember every server that had the bot during the launch period (they get the gift). */
function trackLaunch(client) {
  if (!premium.launchActive()) return;
  const all = store.get('launchGuilds');
  let changed = false;
  for (const g of client.guilds.cache.values()) {
    if (!all[g.id]) {
      all[g.id] = { since: Date.now() };
      changed = true;
    }
  }
  if (changed) store.save('launchGuilds');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** DMs every server owner once (slowly, to respect rate limits). */
async function dmAllOwners(client, text) {
  const seen = new Set();
  for (const g of client.guilds.cache.values()) {
    if (seen.has(g.ownerId)) continue;
    seen.add(g.ownerId);
    await dmOwner(g, text);
    await sleep(1500);
  }
}

async function launchTick(client) {
  const cfg = premium.config();
  const l = premium.launch();
  if (!l.enabled) return;
  trackLaunch(client);
  if (!l.endsAt) return;
  const now = Date.now();

  // 7 days before the end: tell every server owner
  if (!l.noticeSent && l.endsAt - now <= 7 * DAY) {
    cfg.launch = { ...l, noticeSent: true };
    store.save('premiumConfig');
    const left = Math.max(1, Math.ceil((l.endsAt - now) / DAY));
    botlog.log('owner', `بدأ إنذار نهاية فترة الإطلاق (باقي ${left} يوم)`);
    dmAllOwners(
      client,
      `### 🎉 فترة الإطلاق بتنتهي قريباً
كل ميزات البريميوم مجانية لحد <t:${Math.floor(l.endsAt / 1000)}:F> (باقي **${left}** ${left === 1 ? 'يوم' : 'أيام'}).

🎁 **هدية:** لأنك استخدمت البوت بفترة الإطلاق، سيرفرك رح ياخد **${l.giftDays} يوم بريميوم مجاناً** لما يخلص العرض.
${ui.hint('إعداداتك كلها محفوظة — ما في إشي رح ينمسح.')}`
    ).catch(() => {});
  }

  // the end: switch off, gift every launch server that still has the bot
  if (l.endsAt <= now) {
    cfg.launch = { ...l, enabled: false, giftGiven: true };
    store.save('premiumConfig');
    const launchGuilds = store.get('launchGuilds');
    let gifted = 0;
    for (const id of Object.keys(launchGuilds)) {
      const guild = client.guilds.cache.get(id);
      if (!guild) continue;
      premium.activate(id, l.giftDays, { note: 'هدية فترة الإطلاق' });
      gifted++;
      await dmOwner(
        guild,
        `### 🎁 شكراً إنك كنت معنا من البداية
انتهت فترة الإطلاق، وسيرفر **${guild.name}** أخذ **${l.giftDays} يوم بريميوم** هدية. كل ميزاتك شغالة زي ما هي.`
      );
      await sleep(1500);
    }
    botlog.log('owner', `انتهت فترة الإطلاق — ${gifted} سيرفر أخذوا ${l.giftDays} يوم بريميوم هدية`);
  }
}

function init(client) {
  client.on(Events.GuildCreate, () => trackLaunch(client));
  client.once(Events.ClientReady, () => {
    setTimeout(() => check(client).catch((e) => console.error('[premium]', e.message)), 15_000);
    setInterval(() => check(client).catch((e) => console.error('[premium]', e.message)), 30 * 60_000).unref();
    setTimeout(() => launchTick(client).catch((e) => console.error('[launch]', e.message)), 20_000);
    setInterval(() => launchTick(client).catch((e) => console.error('[launch]', e.message)), 10 * 60_000).unref();
  });
}

module.exports = { init, check, launchTick, trackLaunch };
