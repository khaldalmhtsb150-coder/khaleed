// الكفيل (Sponsor): every new member is paired with an active member. If the newcomer settles in
// (sends enough messages within the window), both get XP and the sponsor's count goes up. Free.
const { Events } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');

const DEFAULT = {
  enabled: false,
  channelId: '', // where pairings are announced (default: system channel)
  sponsorRoleId: '', // only members with this role can be sponsors (empty = the most active members)
  goalMessages: 20,
  days: 7,
  rewardXp: 150,
  maxPerSponsor: 3,
};
const config = (gid) => ({ ...DEFAULT, ...(store.peek('kafeelConfig', gid) || {}) });
const pairsOf = (gid) => store.guild('kafeelPairs', gid); // newbieId → { sponsorId, at, msgs, status }
const statsOf = (gid) => store.guild('kafeelStats', gid); // sponsorId → { done, failed }

function openCount(gid, sponsorId) {
  return Object.values(pairsOf(gid)).filter((p) => p.sponsorId === sponsorId && p.status === 'open').length;
}

/** Picks a sponsor among this week's most active members (or members with the sponsor role). */
async function pickSponsor(member, conf) {
  const guild = member.guild;
  const levels = require('./levels');
  let candidates = [];
  if (conf.sponsorRoleId && guild.roles.cache.has(conf.sponsorRoleId)) {
    await guild.members.fetch().catch(() => {});
    candidates = [...(guild.roles.cache.get(conf.sponsorRoleId)?.members.values() || [])].map((m) => ({ id: m.id, score: levels.entry(guild.id, m.id).wtx || 0 }));
  } else {
    candidates = levels.board(guild.id, 'week').slice(0, 20).map((e) => ({ id: e.userId, score: e.score }));
  }
  candidates = candidates.filter((c) => c.id !== member.id && openCount(guild.id, c.id) < conf.maxPerSponsor);
  for (const c of candidates.sort((a, b) => openCount(guild.id, a.id) - openCount(guild.id, b.id) || b.score - a.score).slice(0, 5)) {
    const m = guild.members.cache.get(c.id) || (await guild.members.fetch(c.id).catch(() => null));
    if (m && !m.user.bot) return m;
  }
  return null;
}

function announceChannel(guild, conf) {
  const ch = conf.channelId ? guild.channels.cache.get(conf.channelId) : guild.systemChannel;
  return ch?.isTextBased?.() ? ch : null;
}

async function onJoin(member) {
  if (member.user.bot) return;
  const conf = config(member.guild.id);
  if (!conf.enabled) return;
  const sponsor = await pickSponsor(member, conf);
  if (!sponsor) return;
  pairsOf(member.guild.id)[member.id] = { sponsorId: sponsor.id, at: Date.now(), msgs: 0, status: 'open' };
  store.save('kafeelPairs');
  await announceChannel(member.guild, conf)
    ?.send({
      content: `${member} ${sponsor}`,
      embeds: [
        ui
          .embed()
          .setDescription(
            [
              `### 🤝 كفيل جديد`,
              `أهلاً ${member}! كفيلك بالسيرفر هو ${sponsor} — اسأله عن أي إشي وهو بيعرّفك على المكان.`,
              '',
              `${E.dot} إذا تفاعلت (${conf.goalMessages} رسالة خلال ${conf.days} أيام)، إنت وكفيلك بتاخدوا **${conf.rewardXp} XP**.`,
            ].join('\n')
          ),
      ],
      allowedMentions: { users: [member.id, sponsor.id] },
    })
    .catch(() => {});
}

async function onMessage(message) {
  if (!message.guild || message.author.bot) return;
  const pair = pairsOf(message.guild.id)[message.author.id];
  if (!pair || pair.status !== 'open') return;
  const conf = config(message.guild.id);
  if (Date.now() - pair.at > conf.days * 86_400_000) return; // the sweep closes it
  if (String(message.content || '').replace(/\s/g, '').length < 3) return;
  pair.msgs++;
  if (pair.msgs < conf.goalMessages) return store.save('kafeelPairs');
  pair.status = 'done';
  pair.doneAt = Date.now();
  store.save('kafeelPairs');
  const st = statsOf(message.guild.id);
  st[pair.sponsorId] = { done: 0, failed: 0, ...(st[pair.sponsorId] || {}) };
  st[pair.sponsorId].done++;
  store.save('kafeelStats');
  const levels = require('./levels');
  const sponsor = await message.guild.members.fetch(pair.sponsorId).catch(() => null);
  await levels.addXp(message.member, conf.rewardXp, 'text', message.channel).catch(() => {});
  if (sponsor) await levels.addXp(sponsor, conf.rewardXp, 'text', message.channel).catch(() => {});
  await announceChannel(message.guild, conf)
    ?.send({
      content: `🤝 ${sponsor || `<@${pair.sponsorId}>`} كفّل ${message.author} بنجاح! الاثنين أخذوا **${conf.rewardXp} XP**. (كفالات ناجحة: ${st[pair.sponsorId].done})`,
      allowedMentions: { users: [message.author.id, pair.sponsorId] },
    })
    .catch(() => {});
}

function onLeave(member) {
  const pairs = pairsOf(member.guild.id);
  const p = pairs[member.id];
  if (p?.status === 'open') {
    p.status = 'left';
    const st = statsOf(member.guild.id);
    st[p.sponsorId] = { done: 0, failed: 0, ...(st[p.sponsorId] || {}) };
    st[p.sponsorId].failed++;
    store.save('kafeelStats');
    store.save('kafeelPairs');
  }
}

function sweep() {
  const all = store.get('kafeelPairs');
  const cutoff = Date.now() - 60 * 86_400_000;
  for (const [gid, pairs] of Object.entries(all)) {
    const conf = config(gid);
    for (const [uid, p] of Object.entries(pairs)) {
      if (p.status === 'open' && Date.now() - p.at > conf.days * 86_400_000) p.status = 'expired';
      if (p.status !== 'open' && p.at < cutoff) delete pairs[uid];
    }
  }
  store.save('kafeelPairs');
}

function init(client) {
  client.on(Events.GuildMemberAdd, (m) => onJoin(m).catch((e) => console.error('[kafeel]', e.message)));
  client.on(Events.GuildMemberRemove, (m) => onLeave(m));
  client.on(Events.MessageCreate, (m) => onMessage(m).catch(() => {}));
  setInterval(sweep, 3_600_000).unref();
}

/** For /kafeel: who sponsors me, who do I sponsor, and my record. */
function summary(gid, userId) {
  const pairs = pairsOf(gid);
  return {
    mySponsor: pairs[userId] || null,
    sponsoring: Object.entries(pairs).filter(([, p]) => p.sponsorId === userId && p.status === 'open').map(([id, p]) => ({ id, msgs: p.msgs })),
    stats: statsOf(gid)[userId] || { done: 0, failed: 0 },
    top: Object.entries(statsOf(gid)).sort((a, b) => b[1].done - a[1].done).slice(0, 5),
  };
}

module.exports = { init, config, DEFAULT, summary, pickSponsor, onJoin, onMessage, onLeave };
