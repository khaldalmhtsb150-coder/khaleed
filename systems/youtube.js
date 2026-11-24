// YouTube alerts through the channel's public RSS feed (no API key needed).
// New uploads and live streams are posted to a Discord channel with an optional role mention.
const { Events } = require('discord.js');
const store = require('../utils/store');
const premium = require('../utils/premium');

const POLL_MS = 5 * 60_000;
const limit = (gid) => (premium.has(gid, 'youtubePlus') ? 10 : 2);
const feeds = (gid) => store.guild('youtube', gid, { feeds: [] }).feeds;
const DEFAULT_MSG = '{role} 🔔 **{channel}** نزّل فيديو جديد: **{title}**\n{url}';

const UA = { 'user-agent': 'Mozilla/5.0 (MarkaBot; +https://discord.com)', 'accept-language': 'en' };
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Accepts a UC… id, a /channel/UC… link, an @handle or a youtube.com/@handle link. Returns { id, name }. */
async function resolve(input) {
  const raw = String(input || '').trim();
  let m = raw.match(/(UC[\w-]{22})/);
  if (m) {
    const f = await fetchFeed(m[1]);
    return { id: m[1], name: f.author || m[1] };
  }
  m = raw.match(/@([\w.\-]{2,100})/) || raw.match(/youtube\.com\/(?:c|user)\/([\w.\-]+)/);
  if (!m) throw new Error('حط رابط القناة، مثل https://youtube.com/@name أو آيدي القناة اللي بيبلش بـ UC');
  const url = raw.includes('youtube.com/') ? raw.split('?')[0] : `https://www.youtube.com/@${m[1]}`;
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error('ما لقيت القناة. تأكد من الرابط.');
  const html = await res.text();
  const id = (html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/"channelId":"(UC[\w-]{22})"/) || html.match(/channel\/(UC[\w-]{22})/) || [])[1];
  if (!id) throw new Error('ما قدرت أعرف آيدي القناة من الرابط. جرّب تحط الآيدي اللي بيبلش بـ UC.');
  const f = await fetchFeed(id);
  return { id, name: f.author || m[1] };
}

async function fetchFeed(id) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: UA });
  if (!res.ok) throw new Error(`YouTube ${res.status}`);
  return parse(await res.text());
}

function parse(xml) {
  const author = decode((xml.match(/<author>\s*<name>([^<]*)<\/name>/) || [])[1]);
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1],
    title: decode((e.match(/<title>([^<]*)<\/title>/) || [])[1]),
    published: Date.parse((e.match(/<published>([^<]+)<\/published>/) || [])[1]) || 0,
  })).filter((v) => v.id);
  return { author, entries };
}

function render(feed, video, guild) {
  return (feed.message || DEFAULT_MSG)
    .replace(/\{role\}/g, feed.roleId ? (feed.roleId === guild.id ? '@everyone' : `<@&${feed.roleId}>`) : '')
    .replace(/\{channel\}/g, feed.name)
    .replace(/\{title\}/g, video.title)
    .replace(/\{url\}/g, `https://www.youtube.com/watch?v=${video.id}`)
    .trim();
}

async function add(guild, { input, discordChannelId, roleId = '', message = '' }) {
  const list = feeds(guild.id);
  if (list.length >= limit(guild.id)) throw new Error(`وصلت الحد (${limit(guild.id)} قنوات).${limit(guild.id) < 10 ? ' بالبريميوم لحد 10 👑' : ''}`);
  const { id, name } = await resolve(input);
  if (list.some((f) => f.ytId === id)) throw new Error('هالقناة مضافة أصلاً.');
  const f = await fetchFeed(id);
  const feed = { ytId: id, name, discordChannelId, roleId, message: String(message || '').slice(0, 500), seen: f.entries.slice(0, 15).map((v) => v.id), addedAt: Date.now(), lastOk: Date.now(), errors: 0 };
  list.push(feed);
  store.save('youtube');
  return { feed, latest: f.entries[0] || null };
}

function remove(gid, key) {
  const list = feeds(gid);
  const i = list.findIndex((f) => f.ytId === key || f.name.toLowerCase() === String(key).toLowerCase().replace(/^@/, '') || String(key).includes(f.ytId));
  if (i < 0) return null;
  const [f] = list.splice(i, 1);
  store.save('youtube');
  return f;
}

async function check(guild, feed) {
  const { entries } = await fetchFeed(feed.ytId);
  feed.lastOk = Date.now();
  feed.errors = 0;
  const seen = new Set(feed.seen || []);
  // only videos newer than the feed was added, oldest first, max 3 per check (no floods after downtime)
  const fresh = entries.filter((v) => !seen.has(v.id) && v.published > (feed.addedAt || 0) - 3600_000).reverse().slice(-3);
  const ch = guild.channels.cache.get(feed.discordChannelId);
  for (const v of fresh) {
    if (ch) await ch.send({ content: render(feed, v, guild), allowedMentions: { parse: feed.roleId === guild.id ? ['everyone'] : [], roles: feed.roleId && feed.roleId !== guild.id ? [feed.roleId] : [] } }).catch(() => {});
  }
  feed.seen = [...entries.map((v) => v.id), ...(feed.seen || [])].filter((x, i, a) => a.indexOf(x) === i).slice(0, 30);
  return fresh.length;
}

async function tick(client) {
  for (const [gid, data] of Object.entries(store.get('youtube'))) {
    const guild = client.guilds.cache.get(gid);
    if (!guild || !data?.feeds?.length) continue;
    for (const feed of data.feeds) {
      try {
        await check(guild, feed);
      } catch {
        feed.errors = (feed.errors || 0) + 1;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    store.save('youtube');
  }
}

function init(client) {
  client.once(Events.ClientReady, () => setInterval(() => tick(client).catch((e) => console.error('[youtube]', e.message)), POLL_MS).unref());
}

module.exports = { init, feeds, limit, resolve, fetchFeed, parse, render, add, remove, check, tick, DEFAULT_MSG };
