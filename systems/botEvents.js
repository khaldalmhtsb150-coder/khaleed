// Logs when the bot is added to / removed from a server.
const { Events, AuditLogEvent } = require('discord.js');
const botlog = require('../utils/botlog');

function init(client) {
  botlog.init(client);

  client.on(Events.GuildCreate, async (guild) => {
    let adder = null;
    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
      adder = logs.entries.find((e) => e.target?.id === client.user.id)?.executor || null;
    } catch {}
    const owner = await client.users.fetch(guild.ownerId).catch(() => null);
    botlog.log(
      'guild_join',
      `دخل البوت سيرفر **${guild.name}** (${guild.memberCount} عضو) — المالك: ${owner ? owner.username : guild.ownerId}`,
      { user: adder ? { id: adder.id, name: adder.username } : null, guild }
    );
  });

  client.on(Events.GuildDelete, (guild) => {
    if (!guild.available) return; // Discord outage, not a real removal
    botlog.log('guild_leave', `خرج البوت من سيرفر **${guild.name || guild.id}** (${guild.memberCount || 0} عضو). تم طرده أو أُخرج من لوحة المالك.`, {
      guild,
    });
  });
}

module.exports = { init };
