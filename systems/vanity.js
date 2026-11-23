// Vanity URL protection: reverts unauthorized vanity changes and punishes the executor.
// Fast path: the audit-log gateway event (arrives with the executor, no extra API call),
// so the revert and the punishment are fired together the moment Discord tells us.
// Fallback: GuildUpdate + audit-log fetch, in case the audit event is late or missing.
const { Events, AuditLogEvent } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const { isOwner } = require('../utils/perms');
const logs = require('./logs');

const handled = new Map(); // guildId → { code, at } so the two paths never act twice on the same change
const recentlyHandled = (guildId, code) => {
  const h = handled.get(guildId);
  return h && h.code === code && Date.now() - h.at < 30_000;
};

const confOf = (guildId) => {
  const c = store.peek('linkProtection', guildId);
  return c?.vanityProtect ? c : null;
};

async function act(client, guild, executorId, original, newCode, startedAt) {
  const conf = confOf(guild.id);
  if (!conf || !original || !executorId || executorId === client.user.id) return;
  if (newCode === original || recentlyHandled(guild.id, newCode)) return;
  handled.set(guild.id, { code: newCode, at: Date.now() });

  const trusted = executorId === guild.ownerId || isOwner(executorId) || (conf.whitelist || []).includes(executorId);
  if (trusted) {
    conf.savedVanity = newCode || conf.savedVanity;
    store.save('linkProtection');
    return;
  }

  const punishment = conf.punishment || 'ban';
  const reason = 'MarkaBot: محاولة تغيير الرابط المخصص بدون إذن';
  // everything at once: getting the link back and stopping the attacker are equally urgent
  const revert = client.rest.patch(`/guilds/${guild.id}/vanity-url`, { body: { code: original }, reason });
  let punish;
  if (punishment === 'ban') punish = guild.bans.create(executorId, { reason, deleteMessageSeconds: 0 });
  else if (punishment === 'kick') punish = guild.members.kick(executorId, reason);
  else {
    const m = guild.members.cache.get(executorId);
    punish = (m ? Promise.resolve(m) : guild.members.fetch(executorId)).then((mem) =>
      mem.roles.set(mem.roles.cache.filter((r) => r.managed).map((r) => r.id), reason)
    );
  }
  const [rv, pn] = await Promise.allSettled([revert, punish]);
  const ms = Date.now() - startedAt;
  if (rv.status === 'rejected') console.error('[vanity] revert failed:', rv.reason?.message);
  if (pn.status === 'rejected') console.error('[vanity] punish failed:', pn.reason?.message);

  // the old link is free for anyone to take right now: tell the owner straight away
  if (rv.status === 'rejected') {
    const owner = await client.users.fetch(guild.ownerId).catch(() => null);
    owner
      ?.send(
        [
          `🚨 **عاجل: حدا غيّر الرابط المخصص لسيرفر ${guild.name}**`,
          `الرابط القديم: \`discord.gg/${original}\``,
          `ما قدرت أرجّعه تلقائياً. **رجّعه بإيدك هسا** من إعدادات السيرفر ← الرابط المخصص، قبل ما حدا يخطفه.`,
          `المنفذ: <@${executorId}> — ${pn.status === 'fulfilled' ? 'تمت معاقبته ✓' : 'ما قدرت أعاقبه ✗ (تأكد إن رتبة البوت فوق رتبته)'}`,
        ].join('\n')
      )
      .catch(() => {});
  } else {
    conf.savedVanity = original;
    store.save('linkProtection');
  }

  const label = { ban: 'حظر نهائي', kick: 'طرد', strip: 'سحب جميع الرتب' }[punishment];
  logs.send(
    guild,
    logs.channelFor(guild, 'server_updates') ? 'server_updates' : 'moderation_actions',
    ui
      .embed()
      .setDescription(
        [
          `**${E.shield} حماية الرابط المخصص**`,
          `${E.dot} المنفذ: <@${executorId}> \`${executorId}\``,
          `${E.dot} الرابط الأصلي: \`${original}\` ← \`${newCode || 'بدون'}\` ${rv.status === 'fulfilled' ? `${E.success} تمت الاستعادة` : `${E.brokenLink} فشلت الاستعادة (انبعت تنبيه للمالك)`}`,
          `${E.dot} العقوبة: ${label} ${pn.status === 'fulfilled' ? E.success : E.error}`,
          ui.hint(`سرعة الرد: ${ms}ms`),
        ].join('\n')
      )
      .setTimestamp()
  );
}

function init(client) {
  // fast path
  client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
    if (entry.action !== AuditLogEvent.GuildUpdate) return;
    const change = entry.changes?.find((c) => c.key === 'vanity_url_code');
    if (!change) return;
    const conf = confOf(guild.id);
    if (!conf) return;
    act(client, guild, entry.executorId, conf.savedVanity || change.old, change.new, Date.now()).catch((e) =>
      console.error('[vanity]', e.message)
    );
  });

  // fallback
  client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
    const conf = confOf(newGuild.id);
    if (!conf || oldGuild.vanityURLCode === newGuild.vanityURLCode) return;
    const startedAt = Date.now();
    await new Promise((r) => setTimeout(r, 1200)); // give the fast path its chance first
    if (recentlyHandled(newGuild.id, newGuild.vanityURLCode)) return;
    try {
      const audit = await newGuild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.GuildUpdate });
      const entry = audit.entries.find(
        (e) => Date.now() - e.createdTimestamp < 60_000 && e.changes?.some((c) => c.key === 'vanity_url_code')
      );
      if (!entry) return;
      await act(client, newGuild, entry.executorId || entry.executor?.id, conf.savedVanity || oldGuild.vanityURLCode, newGuild.vanityURLCode, startedAt);
    } catch (err) {
      console.error('[vanity]', err.message);
    }
  });
}

module.exports = { init, act };
