const E = require('../../utils/emojis');

module.exports = {
  name: 'show',
  aliases: ['اظهار'],
  description: 'إظهار القناة للجميع',
  perms: ['ManageChannels'],
  botPerms: ['ManageChannels', 'ManageRoles'],
  options: [{ name: 'channel', type: 'channel', description: 'القناة (الحالية افتراضياً)', channelTypes: [0, 2, 5, 13, 15] }],
  async run(ctx) {
    const channel = ctx.get('channel') || ctx.channel;
    await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { ViewChannel: null, MentionEveryone: null }, { reason: `${ctx.user.tag}: show` });
    return ctx.reply(`${E.show} تم إظهار ${channel} للجميع.`);
  },
};
