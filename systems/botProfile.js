// Premium: the bot's look inside one server (nickname, avatar, banner, bio).
// Uses Discord's per-server profile: PATCH /guilds/{id}/members/@me — the bot's global profile is untouched.
const store = require('../utils/store');
const media = require('../utils/media');

const DEFAULT = { nick: '', bio: '', avatar: '', banner: '' };
const get = (guildId) => ({ ...DEFAULT, ...(store.peek('botProfiles', guildId) || {}) });

/**
 * data: { nick, bio, avatar, banner } where avatar/banner are
 *   undefined → keep, '' / null → remove, 'data:image/...' → upload new
 */
async function apply(guild, data) {
  const conf = store.guild('botProfiles', guild.id, DEFAULT);
  const body = {};

  if (data.nick !== undefined) {
    const nick = String(data.nick || '').trim().slice(0, 32);
    body.nick = nick || null;
    conf.nick = nick;
  }
  if (data.bio !== undefined) {
    const bio = String(data.bio || '').slice(0, 190);
    body.bio = bio || null;
    conf.bio = bio;
  }
  for (const key of ['avatar', 'banner']) {
    const v = data[key];
    if (v === undefined) continue;
    if (!v) {
      body[key] = null;
      media.remove(`bot-${key}-${guild.id}`);
      conf[key] = '';
    } else {
      media.parseDataUri(v); // validates type & size
      body[key] = v;
      conf[key] = media.saveDataUri(v, `bot-${key}-${guild.id}`);
    }
  }

  if (Object.keys(body).length) {
    try {
      await guild.client.rest.patch(`/guilds/${guild.id}/members/@me`, { body, reason: 'MarkaBot premium profile' });
    } catch (err) {
      const msg = String(err.message || err);
      if (/rate limit|429/i.test(msg)) throw new Error('ديسكورد يحد من تغيير الصورة بشكل متكرر، حاول بعد دقائق');
      if (/nick/i.test(msg) || err.status === 403) throw new Error('البوت يحتاج صلاحية "تغيير الاسم المستعار" في السيرفر');
      throw new Error(`رفض ديسكورد التعديل: ${msg.slice(0, 140)}`);
    }
  }
  store.save('botProfiles');
  return get(guild.id);
}

/**
 * Back to the global look.
 * keep=true (premium ended/removed): the server's saved name, avatar and banner stay on disk and come back on renewal.
 * keep=false (the admin pressed "reset"): everything is deleted.
 */
async function reset(guild, { keep = true } = {}) {
  const conf = store.peek('botProfiles', guild.id);
  if (!conf) return;
  await guild.client.rest
    .patch(`/guilds/${guild.id}/members/@me`, { body: { nick: null, avatar: null, banner: null, bio: null }, reason: keep ? 'Premium ended' : 'Profile reset' })
    .catch((e) => console.error('[botProfile] reset', e.message));
  if (keep) {
    conf.suspended = true;
  } else {
    media.remove(`bot-avatar-${guild.id}`);
    media.remove(`bot-banner-${guild.id}`);
    delete store.get('botProfiles')[guild.id];
  }
  store.save('botProfiles');
}

/** Re-applies a saved profile (called when premium starts again). */
async function restore(guild) {
  const conf = store.peek('botProfiles', guild.id);
  if (!conf || !conf.suspended) return false;
  const body = { nick: conf.nick || null, bio: conf.bio || null };
  for (const key of ['avatar', 'banner']) if (conf[key]) body[key] = media.toDataUri(conf[key]);
  try {
    await guild.client.rest.patch(`/guilds/${guild.id}/members/@me`, { body, reason: 'Premium renewed — restoring profile' });
    conf.suspended = false;
    store.save('botProfiles');
    return true;
  } catch (e) {
    console.error('[botProfile] restore', e.message);
    return false;
  }
}

function init(client) {
  // when premium is activated or renewed, bring the server's custom look back
  require('../utils/premium').onActivate((guildId) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) restore(guild);
  });
  // also catch servers whose premium came back while the bot was offline
  client.once(require('discord.js').Events.ClientReady, () => {
    const premium = require('../utils/premium');
    for (const [id, conf] of Object.entries(store.get('botProfiles'))) {
      const guild = client.guilds.cache.get(id);
      if (guild && conf.suspended && premium.has(id, 'botProfile')) restore(guild);
    }
  });
}

module.exports = { get, apply, reset, restore, init, DEFAULT };
