const { Events } = require('discord.js');
const store = require('../utils/store');
const E = require('../utils/emojis');
const { formatDays } = require('../utils/time');
const welcome = require('./welcome');

const cache = new Map(); // guildId → Map(code → uses)
const DAY = 86_400_000;

function entry(guildId, userId) {
  const g = store.guild('invites', guildId);
  const e = g[userId] || (g[userId] = {});
  e.invited = Array.isArray(e.invited) ? e.invited : [];
  for (const k of ['regular', 'left', 'fake', 'bonus', 'points']) if (typeof e[k] !== 'number') e[k] = 0;
  return e;
}

function stats(guildId, userId) {
  const e = entry(guildId, userId);
  return { ...e, total: e.regular + e.bonus };
}

async function snapshot(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map(invites.map((i) => [i.code, i.uses || 0]));
    if (guild.vanityURLCode) {
      const v = await guild.fetchVanityData().catch(() => null);
      if (v) map.set(`vanity:${v.code}`, v.uses);
    }
    cache.set(guild.id, map);
    return invites;
  } catch {
    return null;
  }
}

async function detect(guild) {
  const before = cache.get(guild.id);
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return null;
  let used = null;
  if (before) {
    used = invites.find((i) => (i.uses || 0) > (before.get(i.code) || 0)) || null;
  }
  cache.set(guild.id, new Map(invites.map((i) => [i.code, i.uses || 0])));
  return used;
}

function logChannel(guild) {
  const id = store.peek('inviteConfig', guild.id)?.logChannelId;
  const ch = id ? guild.channels.cache.get(id) : null;
  return ch?.isTextBased() ? ch : null;
}

function findInviter(guildId, memberId) {
  const g = store.get('invites')[guildId] || {};
  for (const [inviterId, data] of Object.entries(g)) {
    const rec = (data.invited || []).find((r) => r.id === memberId && !r.leftAt && !r.left);
    if (rec) return { inviterId, rec };
  }
  return null;
}

function init(client) {
  client.once(Events.ClientReady, async () => {
    await Promise.all(client.guilds.cache.map((g) => snapshot(g)));
    console.log('[invites] cache ready');
  });
  client.on(Events.GuildCreate, (g) => snapshot(g));
  client.on(Events.InviteCreate, (i) => cache.get(i.guild.id)?.set(i.code, i.uses || 0));
  client.on(Events.InviteDelete, (i) => cache.get(i.guild.id)?.delete(i.code));

  client.on(Events.GuildMemberAdd, async (member) => {
    const { guild } = member;
    const used = await detect(guild);
    const inviter = used?.inviter || null;
    const conf = store.peek('inviteConfig', guild.id) || {};
    const minAge = (conf.minAccountAgeDays ?? 30) * DAY;
    const fake = Date.now() - member.user.createdTimestamp < minAge;

    if (inviter && inviter.id !== member.id) {
      const e = entry(guild.id, inviter.id);
      const prev = e.invited.find((r) => r.id === member.id);
      if (prev) {
        prev.leftAt = null;
        prev.left = false;
        prev.joinedAt = Date.now();
        e.left = Math.max(0, e.left - 1);
        e.regular++;
      } else {
        e.invited.push({ id: member.id, joinedAt: Date.now(), leftAt: null, fake });
        if (fake) e.fake++;
        else {
          e.regular++;
          // wheel points are only earned while the wheel is on (/wheel-toggle)
          if (store.peek('wheelConfig', member.guild.id)?.enabled !== false) e.points++;
        }
      }
      store.save('invites');
    }

    const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / DAY);
    logChannel(guild)
      ?.send({
        content: [
          `${E.joinLeave} دخل العضو ${member} السيرفر`,
          `${E.dot} الداعي: ${inviter ? `<@${inviter.id}> (${stats(guild.id, inviter.id).total} دعوة)` : 'غير معروف'}`,
          `${E.dot} عمر الحساب: ${formatDays(ageDays)}${fake ? ` ${E.warning} حساب جديد` : ''}`,
        ].join('\n'),
        allowedMentions: { parse: [] },
      })
      .catch(() => {});

    await welcome.onJoin(member, inviter).catch((e) => console.error('[welcome]', e.message));
  });

  client.on(Events.GuildMemberRemove, (member) => {
    const { guild } = member;
    const found = findInviter(guild.id, member.id);
    if (found) {
      const e = entry(guild.id, found.inviterId);
      found.rec.leftAt = Date.now();
      found.rec.left = true;
      if (!found.rec.fake) {
        e.regular = Math.max(0, e.regular - 1);
        e.left++;
      }
      store.save('invites');
    }
    const joined = member.joinedTimestamp || found?.rec.joinedAt;
    const stayed = joined ? Math.floor((Date.now() - joined) / DAY) : null;
    logChannel(guild)
      ?.send({
        content: [
          `${E.joinLeave} غادر العضو ${member.user} السيرفر`,
          `${E.dot} الداعي: ${found ? `<@${found.inviterId}>` : 'غير معروف'}`,
          `${E.dot} مدة بقائه: ${stayed === null ? 'غير متوفرة' : formatDays(stayed)}`,
        ].join('\n'),
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  });
}

module.exports = { init, entry, stats, findInviter };
