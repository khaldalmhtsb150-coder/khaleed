// Embed builder: send designed messages from the dashboard (free).
// Premium ("embedSchedule"): schedule for later, repeat every N hours, and send under a custom name/avatar (webhook).
const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('../utils/store');
const premium = require('../utils/premium');

const HEX = /^#?[0-9a-f]{6}$/i;
const URL = /^https:\/\/\S+$/;

/** Validates and normalises an embed definition coming from the dashboard. */
function clean(d = {}) {
  const s = (v, n) => String(v ?? '').slice(0, n);
  const e = {
    content: s(d.content, 2000),
    title: s(d.title, 256),
    url: URL.test(d.url || '') ? d.url : '',
    description: s(d.description, 4000),
    color: HEX.test(d.color || '') ? `#${d.color.replace('#', '')}` : '',
    image: URL.test(d.image || '') ? d.image : '',
    thumbnail: URL.test(d.thumbnail || '') ? d.thumbnail : '',
    footer: s(d.footer, 2048),
    author: s(d.author, 256),
    timestamp: Boolean(d.timestamp),
    buttons: (Array.isArray(d.buttons) ? d.buttons : [])
      .map((b) => ({ label: s(b.label, 80).trim(), url: URL.test(b.url || '') ? b.url : '' }))
      .filter((b) => b.label && b.url)
      .slice(0, 5),
  };
  if (!e.content && !e.title && !e.description && !e.image) throw new Error('الرسالة فاضية — اكتب عنوان أو وصف أو حط صورة');
  return e;
}

function payload(e) {
  const out = { allowedMentions: { parse: ['users', 'roles'] } };
  if (e.content) out.content = e.content;
  if (e.title || e.description || e.image || e.thumbnail || e.footer || e.author) {
    const em = new EmbedBuilder();
    if (e.title) em.setTitle(e.title);
    if (e.url) em.setURL(e.url);
    if (e.description) em.setDescription(e.description);
    em.setColor(e.color ? parseInt(e.color.slice(1), 16) : 0x7950e8);
    if (e.image) em.setImage(e.image);
    if (e.thumbnail) em.setThumbnail(e.thumbnail);
    if (e.footer) em.setFooter({ text: e.footer });
    if (e.author) em.setAuthor({ name: e.author });
    if (e.timestamp) em.setTimestamp();
    out.embeds = [em];
  }
  if (e.buttons?.length) out.components = [new ActionRowBuilder().addComponents(e.buttons.map((b) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(b.label).setURL(b.url)))];
  return out;
}

/** Sends now. sender = { name, avatar } (premium) posts through a webhook. */
async function send(guild, channelId, embed, sender = null) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) throw new Error('اختار قناة صحيحة');
  const p = payload(embed);
  if (sender?.name && premium.has(guild.id, 'embedSchedule') && channel.fetchWebhooks) {
    const hooks = await channel.fetchWebhooks().catch(() => null);
    let hook = hooks?.find((h) => h.owner?.id === guild.client.user.id && h.name === 'MarkaBot Embeds');
    if (!hook) hook = await channel.createWebhook({ name: 'MarkaBot Embeds', reason: 'صانع الإمبد' }).catch(() => null);
    if (!hook) throw new Error('البوت يحتاج صلاحية Manage Webhooks بهالقناة');
    return hook.send({ ...p, username: String(sender.name).slice(0, 80), avatarURL: URL.test(sender.avatar || '') ? sender.avatar : undefined });
  }
  return channel.send(p);
}

// ---------- schedule (premium) ----------
// scheduledEmbeds: { [guildId]: [{ id, channelId, embed, sender, at, repeatHours }] }
const listOf = (guildId) => {
  const all = store.get('scheduledEmbeds');
  if (!Array.isArray(all[guildId])) all[guildId] = [];
  return all[guildId];
};

function schedule(guildId, { channelId, embed, sender, at, repeatHours }) {
  const list = listOf(guildId);
  if (list.length >= 20) throw new Error('الحد 20 رسالة مجدولة');
  const when = new Date(at).getTime();
  if (!Number.isFinite(when) || when < Date.now() + 30_000) throw new Error('اختار وقت بالمستقبل');
  const item = { id: Date.now().toString(36), channelId, embed, sender: sender?.name ? sender : null, at: when, repeatHours: Math.min(24 * 30, Math.max(0, parseInt(repeatHours, 10) || 0)) };
  list.push(item);
  store.save('scheduledEmbeds');
  return item;
}

function unschedule(guildId, id) {
  const all = store.get('scheduledEmbeds');
  all[guildId] = listOf(guildId).filter((x) => x.id !== id);
  store.save('scheduledEmbeds');
}

async function tick(client) {
  const all = store.get('scheduledEmbeds');
  let changed = false;
  for (const [gid, list] of Object.entries(all)) {
    if (!Array.isArray(list) || !list.length) continue;
    const guild = client.guilds.cache.get(gid);
    if (!guild || !premium.has(gid, 'embedSchedule')) continue; // paused (kept) while not premium
    for (const item of [...list]) {
      if (item.at > Date.now()) continue;
      await send(guild, item.channelId, item.embed, item.sender).catch((e) => console.error('[embeds] scheduled', e.message));
      changed = true;
      if (item.repeatHours) {
        while (item.at <= Date.now()) item.at += item.repeatHours * 3_600_000;
      } else all[gid] = all[gid].filter((x) => x !== item);
    }
  }
  if (changed) store.save('scheduledEmbeds');
}

function init(client) {
  client.once(Events.ClientReady, () => setInterval(() => tick(client).catch(() => {}), 30_000).unref());
}

module.exports = { init, clean, payload, send, schedule, unschedule, listOf, tick };
