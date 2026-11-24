// Uploads the bot's icon set (assets/art/emoji/*.png) as application emojis once, then keeps the
// key → emoji map in memory for buttons and messages. Works across every server without needing
// a server's emoji slots. Old versions of the set (different prefix) are removed.
const fs = require('fs');
const path = require('path');
const { Events } = require('discord.js');
const art = require('../utils/art');

const DIR = path.join(art.ART, 'emoji');
let ready = false;

async function sync(client) {
  const mgr = client.application?.emojis;
  if (!mgr?.fetch) {
    console.warn('[appEmojis] discord.js too old for application emojis — using text fallbacks');
    return;
  }
  const existing = await mgr.fetch().catch((e) => (console.warn('[appEmojis] fetch failed:', e.message), null));
  if (!existing) return;
  const byName = new Map([...existing.values()].map((e) => [e.name, e]));
  const keys = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : [];
  let created = 0;
  for (const key of keys) {
    const name = art.iconName(key);
    let e = byName.get(name);
    if (!e) {
      e = await mgr.create({ attachment: path.join(DIR, `${key}.png`), name }).catch((err) => (console.warn(`[appEmojis] ${name}:`, err.message), null));
      if (e) created++;
    }
    if (e) art.setIcon(key, e);
  }
  // clean up icons from older designs (same family prefix, other version)
  for (const e of existing.values()) {
    if (/^mk\d+_/.test(e.name) && !e.name.startsWith(`${art.VERSION}_`)) await e.delete().catch(() => {});
  }
  ready = true;
  console.log(`[appEmojis] ${art.icons.size}/${keys.length} icons ready${created ? ` (${created} uploaded)` : ''}`);
}

function init(client) {
  client.once(Events.ClientReady, () => {
    client.application
      .fetch()
      .catch(() => {})
      .then(() => sync(client))
      .catch((e) => console.error('[appEmojis]', e.message));
  });
}

module.exports = { init, sync, isReady: () => ready };
