const { Events } = require('discord.js');
const store = require('../utils/store');
const E = require('../utils/emojis');
const { formatDays } = require('../utils/time');
const welcome = require('./welcome');

const cache = new Map(); // guildId → Map(code → uses)
const DAY = 86_400_000;
const queues = new Map(); // guildId → promise chain of joins

/** Wheel points are only earned while the wheel is on (/wheel-toggle). */
function givePoint(guildId, e, rec) {
  delete rec.pointAt;
  if (store.peek('wheelConfig', guildId)?.enabled === false) return false;
  e.points++;
  rec.point = true;
  return true;
}

/** Hands out held points to inviters whose members stayed long enough. */
function releaseHeld() {
  const now = Date.now();
  let changed = false;
  for (const [guildId, users] of Object.entries(store.get('invites'))) {
    for (const e of Object.values(users || {})) {
      for (const rec of e?.invited || []) {
        if (rec.pointAt && rec.pointAt <= now && !rec.leftAt && !rec.left) {
          givePoint(guildId, e, rec);
          changed = true;
        }
      }
    }
  }
  if (changed) store.save('invites');
}

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

/**
 * Which invite did the new member use?
 * Only credits someone when exactly ONE invite's use count went up; if several changed at once
 * (two people joined together via different links) nobody is credited rather than the wrong person.
 */
async function detect(guild) {
  const before = cache.get(guild.id);
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return { used: null, reason: 'fetch' };
  const fresh = new Map(invites.map((i) => [i.code, i.uses || 0]));
  if (!before) {
    cache.set(guild.id, fresh);
    return { used: null, reason: 'nocache' };
  }
  const changed = invites.filter((i) => {
    const uses = i.uses || 0;
    // a link we never saw: only trust it if this is its very first use
    return before.has(i.code) ? uses > before.get(i.code) : uses === 1;
  });
  if (changed.size === 1) {
    const used = changed.first();
    // count this join only; if two people came through the same link, the next join still finds it
    const base = before.has(used.code) ? before.get(used.code) + 1 : 1;
    fresh.set(used.code, Math.min(base, used.uses || 0));
    cache.set(guild.id, fresh);
    return { used, reason: null };
  }
  cache.set(guild.id, fresh);
  return { used: null, reason: changed.size > 1 ? 'ambiguous' : 'none' };
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
    setInterval(releaseHeld, 5 * 60_000);
    releaseHeld();
  });
  client.on(Events.GuildCreate, (g) => snapshot(g));
  client.on(Events.InviteCreate, (i) => cache.get(i.guild.id)?.set(i.code, i.uses || 0));
  client.on(Events.InviteDelete, (i) => cache.get(i.guild.id)?.delete(i.code));

  // joins are handled one at a time per server, so two people joining together can't be mixed up
  client.on(Events.GuildMemberAdd, (member) => {
    const prev = queues.get(member.guild.id) || Promise.resolve();
    const next = prev.then(() => onJoin(member)).catch((e) => console.error('[invites]', e.message));
    queues.set(member.guild.id, next);
  });

  async function onJoin(member) {
    const { guild } = member;
    const { used, reason } = await detect(guild);
    // bots (Disboard, other listing bots) and the vanity link never earn points
    const inviter = used?.inviter && !used.inviter.bot ? used.inviter : null;
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
        const rec = { id: member.id, joinedAt: Date.now(), leftAt: null, fake };
        e.invited.push(rec);
        if (fake) e.fake++;
        else {
          e.regular++;
          // the point only comes after the new member stays for the hold time (0 = right away)
          const hold = Math.max(0, Number(conf.pointHoldHours) || 0) * 3_600_000;
          if (hold) rec.pointAt = Date.now() + hold;
          else givePoint(guild.id, e, rec);
        }
      }
      store.save('invites');
    }

    const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / DAY);
    logChannel(guild)
      ?.send({
        content: [
          `${E.joinLeave} دخل العضو ${member} السيرفر`,
          `${E.dot} الداعي: ${
            inviter
              ? `<@${inviter.id}> (${stats(guild.id, inviter.id).total} دعوة)`
              : reason === 'ambiguous'
                ? 'غير مؤكد (دخل أكثر من عضو بنفس اللحظة، فما انحسبت لحدا)'
                : used?.inviter?.bot
                  ? `بوت (${used.inviter.username}) — ما بتنحسب`
                  : 'غير معروف'
          }`,
          `${E.dot} عمر الحساب: ${formatDays(ageDays)}${fake ? ` ${E.warning} حساب جديد` : ''}`,
        ].join('\n'),
        allowedMentions: { parse: [] },
      })
      .catch(() => {});

    await welcome.onJoin(member, inviter).catch((e) => console.error('[welcome]', e.message));
  }

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
      // left before the point was earned → never gets it; left after → the point is taken back
      delete found.rec.pointAt;
      if (found.rec.point) {
        found.rec.point = false;
        e.points = Math.max(0, e.points - 1);
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

module.exports = { init, entry, stats, findInviter, detect, releaseHeld, _cache: cache };
