// Vanity URL protection — reverts unauthorized vanity changes and punishes the executor.
const { Events, AuditLogEvent, Routes } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const { isOwner } = require('../utils/perms');
const logs = require('./logs');

function init(client) {
  client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
    const conf = store.peek('linkProtection', newGuild.id);
    if (!conf?.vanityProtect) return;
    if (oldGuild.vanityURLCode === newGuild.vanityURLCode) return;

    const original = conf.savedVanity || oldGuild.vanityURLCode;
    if (!original) return;

    try {
      const audit = await newGuild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.GuildUpdate });
      const executor = audit.entries.first()?.executor;
      if (!executor || executor.id === client.user.id) return;

      const trusted = executor.id === newGuild.ownerId || isOwner(executor.id) || (conf.whitelist || []).includes(executor.id);
      if (trusted) {
        conf.savedVanity = newGuild.vanityURLCode;
        store.save('linkProtection');
        return;
      }

      const punishment = conf.punishment || 'ban';
      const tasks = [client.rest.patch(Routes.guildVanityUrl(newGuild.id), { body: { code: original } })];
      const reason = 'MarkaBot: محاولة تغيير الرابط المخصص بدون إذن';
      if (punishment === 'ban') tasks.push(newGuild.members.ban(executor.id, { reason }));
      else if (punishment === 'kick') tasks.push(newGuild.members.kick(executor.id, reason));
      else if (punishment === 'strip') {
        tasks.push(
          newGuild.members.fetch(executor.id).then((m) => m.roles.set(m.roles.cache.filter((r) => r.managed).map((r) => r.id), reason))
        );
      }
      const [revert, punish] = await Promise.allSettled(tasks);

      const label = { ban: 'حظر نهائي', kick: 'طرد', strip: 'سحب جميع الرتب' }[punishment];
      logs.send(
        newGuild,
        logs.channelFor(newGuild, 'server_updates') ? 'server_updates' : 'moderation_actions',
        ui
          .embed()
          .setDescription(
            [
              `**${E.shield} حماية الرابط المخصص**`,
              `${E.dot} المنفذ: <@${executor.id}> \`${executor.id}\``,
              `${E.dot} الرابط الأصلي: \`${original}\` ${revert.status === 'fulfilled' ? `${E.success} تمت الاستعادة` : `${E.brokenLink} فشلت الاستعادة`}`,
              `${E.dot} العقوبة: ${label} ${punish?.status === 'fulfilled' ? E.success : E.error}`,
            ].join('\n')
          )
          .setTimestamp()
      );
    } catch (err) {
      console.error('[vanity]', err.message);
    }
  });
}

module.exports = { init };
