// Auto purge: clear chosen channels every N hours. Free: 1 channel, premium: 10 (limit "purgeChannels").
// Discord only bulk-deletes messages younger than 14 days; older ones are left alone.
const { Events } = require('discord.js');
const store = require('../utils/store');
const premium = require('../utils/premium');

// purgeConfig: { [guildId]: [{ channelId, hours, keepPinned, last }] }
const listOf = (gid) => {
  const all = store.get('purgeConfig');
  if (!Array.isArray(all[gid])) all[gid] = [];
  return all[gid];
};

async function purgeChannel(channel, keepPinned = true) {
  let deleted = 0;
  for (let round = 0; round < 10; round++) {
    const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!msgs?.size) break;
    const fresh = msgs.filter((m) => (!keepPinned || !m.pinned) && Date.now() - m.createdTimestamp < 13.9 * 86_400_000);
    if (!fresh.size) break;
    const res = await channel.bulkDelete(fresh, true).catch(() => null);
    if (!res?.size) break;
    deleted += res.size;
    if (res.size < 2) break;
  }
  return deleted;
}

async function tick(client) {
  const all = store.get('purgeConfig');
  let changed = false;
  for (const [gid, list] of Object.entries(all)) {
    if (!Array.isArray(list)) continue;
    const guild = client.guilds.cache.get(gid);
    if (!guild) continue;
    const max = premium.limit(gid, 'purgeChannels');
    for (const item of list.slice(0, max)) {
      if (Date.now() - (item.last || 0) < item.hours * 3_600_000) continue;
      item.last = Date.now();
      changed = true;
      const ch = guild.channels.cache.get(item.channelId);
      if (ch?.isTextBased()) await purgeChannel(ch, item.keepPinned !== false).catch((e) => console.error('[purge]', e.message));
    }
  }
  if (changed) store.save('purgeConfig');
}

function init(client) {
  client.once(Events.ClientReady, () => setInterval(() => tick(client).catch(() => {}), 5 * 60_000).unref());
}

module.exports = { init, listOf, purgeChannel, tick };
