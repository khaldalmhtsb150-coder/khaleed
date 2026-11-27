const { ActionRowBuilder, Events } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const { ts } = require('../utils/time');
const botlog = require('../utils/botlog');
const premium = require('../utils/premium');
const gctx = require('../utils/guildContext');

// إيموجي المشاركة — ضع إيموجي مخصص بصيغة '<:name:id>' أو اترك 🎉
const REACTION = '<:emoji_1:1575568479048831056>';

// Premium per-server settings (dashboard → القيفاواي)
const DEFAULT_CONFIG = {
  title: '', // template, empty = prize
  description: '', // template, empty = classic layout
  color: '#2b2d31',
  imageUrl: '',
  reaction: '', // custom entry emoji
  winMessage: '',
  requiredRoleId: '',
  minInvites: 0,
  minAccountAgeDays: 0,
  bonusRoles: [], // [{ roleId, entries }]
};
// the win line's emoji (the server's own): a plain message, not an embed
const WIN_EMOJI = '<:gw_win:1575784763979997355>';
const DEFAULT_WIN = `${WIN_EMOJI} مبروك {winnerList}! فزتم بـ **{prize}**`;

const list = () => store.get('giveaways');
const find = (messageId) => list().find((g) => g.messageId === messageId);
const ending = new Set(); // prevents ending the same giveaway twice
let ready = false;

// write to disk immediately so a restart never loses a giveaway
function saveNow() {
  store.save('giveaways');
  store.flush();
}

function fillTemplate(text, g) {
  const endsUnix = Math.floor(g.endTime / 1000);
  return String(text || '')
    .replace(/{prize}/g, g.prize)
    .replace(/{winners}/g, `${g.winnersCount}`)
    .replace(/{winnerList}/g, g.winners?.length ? g.winners.map((w) => `<@${w}>`).join('، ') : '—')
    .replace(/{host}/g, `<@${g.hostId}>`)
    .replace(/{ends}/g, `<t:${endsUnix}:R>`)
    .replace(/{endsAt}/g, `<t:${endsUnix}:F>`)
    .replace(/{gift}/g, E.gift);
}

function requirementFields(g) {
  const out = [];
  const r = g.req || {};
  const parts = [];
  if (r.roleId) parts.push(`رتبة <@&${r.roleId}>`);
  if (r.minInvites) parts.push(`${r.minInvites} دعوات`);
  if (r.minAccountAgeDays) parts.push(`عمر الحساب ${r.minAccountAgeDays} يوم`);
  if (parts.length) out.push({ name: 'الشروط', value: parts.join(' · '), inline: false });
  if (g.bonus?.length) out.push({ name: 'إدخالات إضافية', value: g.bonus.map((b) => `<@&${b.roleId}> ×${b.entries}`).join(' · '), inline: false });
  return out;
}

/**
 * The giveaway message. The three lines (Hosted By / Ends / Winners) with the server's own emojis are the
 * house format; the prize is the title, the colour says whether it's running (brand) or over (muted).
 */
function render(g, guild) {
  const st = g.style;
  let lines;
  if (st?.description) {
    lines = [fillTemplate(st.description, g)];
  } else {
    lines = [
      `${E.gwHost} **Hosted By:** <@${g.hostId}>`,
      `${E.gwEnds} **${g.ended ? 'Ended' : 'Ends'}:** ${ts(g.endTime)}`,
      `${E.gwWinners} **Winners:** ${g.winnersCount}`,
    ];
  }
  if (g.ended) {
    lines.push('', g.winners.length ? `**Winner${g.winners.length > 1 ? 's' : ''}:** ${g.winners.map((w) => `<@${w}>`).join(', ')}` : 'ما في فائز، ما شارك حدا.');
  }
  // the prize sits at the top next to the server's icon (no server name, no separate title)
  const embed = ui
    .embed(g.ended ? 'muted' : 'brand')
    .setAuthor({ name: (st?.title ? fillTemplate(st.title, g) : g.prize).slice(0, 256), iconURL: guild?.iconURL?.({ size: 128 }) || undefined })
    .setDescription(ui.trim(lines.join('\n'), 4000));
  const fields = requirementFields(g);
  if (g.ended) fields.push({ name: 'المشاركين', value: String(g.entrants?.length || 0), inline: true });
  if (fields.length) embed.addFields(fields);
  if (st?.color && !g.ended) embed.setColor(parseInt(st.color.slice(1), 16));
  if (st?.imageUrl) embed.setImage(st.imageUrl);
  if (g.hostName) embed.setFooter({ text: g.hostName, iconURL: g.hostAvatar || undefined });
  return { embeds: [embed], components: [] };
}

/** The result, posted as a reply to the giveaway: one plain line (winners pinged) and a button back to it. */
function resultPayload(g, msg, { reroll = false } = {}) {
  const won = g.winners.length > 0;
  const line = won
    ? `${reroll ? 'إعادة سحب — ' : ''}${fillTemplate(g.style?.winMessage || DEFAULT_WIN, g)}`
    : `• انتهى القيفاواي على **${g.prize}** بدون ${g.req && g.entrants.length ? 'مشاركين مستوفين للشروط' : 'مشاركين'}.`;
  const row = new ActionRowBuilder();
  if (msg?.url) row.addComponents(ui.linkButton(msg.url, 'عرض القيفاواي'));
  const brand = require('./growth').brandRow(msg?.guild?.id || g.guildId);
  if (brand) row.addComponents(...brand.components);
  return { content: line, components: row.components.length ? [row] : [] };
}

async function start(channel, { prize, winnersCount, durationMs, hostId, hostName, hostAvatar, requiredRoleId, minInvites }) {
  const gid = channel.guild.id;
  const conf = { ...DEFAULT_CONFIG, ...(store.peek('giveawayConfig', gid) || {}) };
  // premium settings are copied into the giveaway when it starts
  const style = premium.has(gid, 'giveawayMessage') && (conf.title || conf.description || conf.imageUrl || conf.winMessage || conf.color !== DEFAULT_CONFIG.color || conf.reaction)
    ? { title: conf.title, description: conf.description, color: conf.color, imageUrl: conf.imageUrl, winMessage: conf.winMessage }
    : null;
  const req = premium.has(gid, 'giveawayRequirements')
    ? {
        roleId: requiredRoleId || conf.requiredRoleId || null,
        minInvites: minInvites ?? conf.minInvites ?? 0,
        minAccountAgeDays: conf.minAccountAgeDays || 0,
      }
    : null;
  const bonus = premium.has(gid, 'giveawayBonus') && conf.bonusRoles?.length ? conf.bonusRoles : null;
  const reaction = (premium.has(gid, 'giveawayMessage') && conf.reaction) || REACTION;

  const g = {
    messageId: null,
    channelId: channel.id,
    guildId: channel.guild.id,
    prize,
    winnersCount,
    endTime: Date.now() + durationMs,
    hostId,
    hostName,
    hostAvatar,
    reaction, // remember which emoji this giveaway uses
    style,
    req: req && (req.roleId || req.minInvites || req.minAccountAgeDays) ? req : null,
    bonus,
    entrants: [],
    winners: [],
    ended: false,
  };
  const msg = await channel.send({ ...render(g, channel.guild), allowedMentions: { parse: [] } });
  g.messageId = msg.id;
  list().push(g);
  saveNow();
  await msg.react(reaction).catch(async (e) => {
    console.error('[giveaway] react failed:', e.message);
    if (reaction !== REACTION) {
      g.reaction = REACTION;
      saveNow();
      await msg.react(REACTION).catch(() => {});
    }
  });
  botlog.log('giveaway_start', `بدأ قيفاواي **${prize}** في <#${channel.id}> — ${winnersCount} فائز، ينتهي ${ts(g.endTime)}`, {
    user: { id: hostId, name: hostName },
    guild: channel.guild,
  });
  return msg;
}

/** Random winners without repeats. weights: Map(userId → entries), default 1. */
function pick(entrants, count, weights = null) {
  const pool = [...new Set(entrants)].map((id) => ({ id, w: weights?.get(id) || 1 }));
  const out = [];
  while (pool.length && out.length < count) {
    let r = Math.random() * pool.reduce((a, p) => a + p.w, 0);
    let i = 0;
    while (i < pool.length - 1 && (r -= pool[i].w) > 0) i++;
    out.push(pool.splice(i, 1)[0].id);
  }
  return out;
}

/** Premium: drop entrants that don't meet the requirements and compute bonus entries. */
async function eligibility(guild, g) {
  if (!g.req && !g.bonus) return { entrants: g.entrants, weights: null };
  const ids = [...new Set(g.entrants)];
  const members = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = await guild.members.fetch({ user: ids.slice(i, i + 100) }).catch(() => null);
    batch?.forEach((m) => members.set(m.id, m));
  }
  const invites = store.peek('invites', guild.id) || {};
  const DAY = 86_400_000;
  const ok = [];
  const weights = new Map();
  for (const id of ids) {
    const m = members.get(id);
    if (!m) continue; // left the server
    const r = g.req || {};
    if (r.roleId && !m.roles.cache.has(r.roleId)) continue;
    if (r.minInvites && (invites[id]?.regular || 0) + (invites[id]?.bonus || 0) < r.minInvites) continue;
    if (r.minAccountAgeDays && Date.now() - m.user.createdTimestamp < r.minAccountAgeDays * DAY) continue;
    ok.push(id);
    const extra = (g.bonus || []).filter((b) => m.roles.cache.has(b.roleId)).reduce((a, b) => Math.max(a, b.entries), 1);
    if (extra > 1) weights.set(id, extra);
  }
  return { entrants: ok, weights };
}

const keyOf = (emoji) => String(emoji || '').match(/(\d{17,21})>?$/)?.[1] || emoji;

function findReaction(msg, g) {
  const cache = msg.reactions.cache;
  // 1) the emoji saved with this giveaway, 2) the current emoji, 3) the one the bot added, 4) the most used
  return (
    (g.reaction && cache.get(keyOf(g.reaction))) ||
    cache.get(keyOf(REACTION)) ||
    cache.find((r) => r.me) ||
    [...cache.values()].sort((a, b) => b.count - a.count)[0] ||
    null
  );
}

async function collectEntrants(msg, g) {
  if (!msg) return null;
  const reaction = findReaction(msg, g);
  if (!reaction) return null; // old button giveaway: keep stored entrants
  const ids = [];
  let after;
  while (true) {
    const batch = await reaction.users.fetch({ limit: 100, after });
    if (!batch.size) break;
    for (const u of batch.values()) if (!u.bot) ids.push(u.id);
    after = batch.last().id;
    if (batch.size < 100) break;
  }
  return ids;
}

function end(client, g, opts) {
  return gctx.run(g.guildId, () => endInner(client, g, opts));
}

async function endInner(client, g, { reroll = false } = {}) {
  if (ending.has(g.messageId)) return g;
  ending.add(g.messageId);
  try {
    let gone = false;
    const channel = await client.channels.fetch(g.channelId).catch((e) => {
      // Unknown Channel / Missing Access / Unknown Guild: it isn't coming back
      if ([10003, 50001, 10004].includes(e.code)) gone = true;
      return null;
    });
    if (!channel) {
      g.fails = (g.fails || 0) + 1;
      if (gone || !client.guilds.cache.has(g.guildId) || g.fails >= 30) {
        // drop it instead of retrying forever
        const all = list();
        const k = all.indexOf(g);
        if (k !== -1) all.splice(k, 1);
        store.save('giveaways');
        console.warn(`[giveaway] ${g.prize} dropped: channel ${g.channelId} is gone`);
        return g;
      }
      store.save('giveaways');
      if (g.fails === 1) console.error(`[giveaway] channel ${g.channelId} not reachable, will retry`);
      return g;
    }
    g.fails = 0;
    const msg = await channel.messages.fetch(g.messageId).catch(() => null);
    if (!msg) console.error(`[giveaway] message ${g.messageId} not found (deleted?)`);

    let fromReactions = null;
    try {
      fromReactions = await collectEntrants(msg, g);
    } catch (e) {
      console.error('[giveaway] could not read reactions:', e.message);
      return g; // don't end it with zero entrants — retry on the next tick
    }
    if (fromReactions) g.entrants = fromReactions;

    g.ended = true;
    const { entrants: eligible, weights } = await eligibility(channel.guild, g);
    g.eligible = eligible.length;
    g.winners = pick(eligible, g.winnersCount, weights);
    saveNow();
    console.log(`[giveaway] ${reroll ? 'reroll' : 'ended'} "${g.prize}" — ${g.entrants.length} entrants, ${g.winners.length} winners`);
    botlog.log(
      'giveaway_end',
      `${reroll ? 'إعادة سحب' : 'انتهى'} قيفاواي **${g.prize}** — ${g.entrants.length} مشارك، الفائزون: ${g.winners.length ? g.winners.map((w) => `<@${w}>`).join('، ') : 'لا أحد'}`,
      { user: { id: g.hostId, name: g.hostName }, guild: channel.guild }
    );

    if (msg) await msg.edit({ ...render(g, channel.guild), allowedMentions: { parse: [] } }).catch(() => {});
    await channel
      .send({ ...resultPayload(g, msg, { reroll }), reply: msg ? { messageReference: msg.id, failIfNotExists: false } : undefined, allowedMentions: { users: g.winners } })
      .catch(() => {});
    return g;
  } finally {
    ending.delete(g.messageId);
  }
}

async function tick(client) {
  if (!ready) return;
  const now = Date.now();
  for (const g of list().filter((x) => !x.ended && x.endTime <= now)) {
    await end(client, g).catch((e) => console.error('[giveaway]', e.message));
  }
  // keep the file small: drop giveaways ended more than 14 days ago
  const cutoff = now - 14 * 86_400_000;
  const kept = list().filter((g) => !g.ended || g.endTime > cutoff);
  if (kept.length !== list().length) {
    store.set('giveaways', kept);
    saveNow();
  }
}

function init(client) {
  // wait until the bot is fully connected, then finish anything that ended while it was off
  client.once(Events.ClientReady, () => {
    ready = true;
    const pending = list().filter((g) => !g.ended);
    console.log(`[giveaway] ${pending.length} active giveaway(s) restored`);
    setTimeout(() => tick(client), 3000);
    setInterval(() => tick(client), 10_000);
  });
}

async function onButton(interaction) {
  const g = find(interaction.message.id);
  if (!g || g.ended) return interaction.reply({ content: '• هذا القيفاواي انتهى.', ephemeral: true });
  const idx = g.entrants.indexOf(interaction.user.id);
  if (idx === -1) g.entrants.push(interaction.user.id);
  else g.entrants.splice(idx, 1);
  saveNow();
  await interaction.update({ ...render(g, interaction.guild), allowedMentions: { parse: [] } });
  return interaction.followUp({
    embeds: [ui.notice(idx === -1 ? 'success' : 'info', idx === -1 ? 'دخلت القيفاواي، بالتوفيق.' : 'طلعت من القيفاواي.')],
    ephemeral: true,
  });
}

module.exports = { DEFAULT_CONFIG, DEFAULT_WIN, render, resultPayload, start, end, find, list, init, pick, fillTemplate, components: [{ prefix: 'gw_join', type: 'button', handle: onButton }] };
