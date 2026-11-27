const E = require('../../utils/emojis');

module.exports = {
  name: 'hide',
  aliases: ['اخفاء'],
  description: 'إخفاء القناة عن الجميع ومنع منشن الجميع',
  perms: ['ManageChannels'],
  botPerms: ['ManageChannels', 'ManageRoles'],
  options: [{ name: 'channel', type: 'channel', description: 'القناة (الحالية افتراضياً)', channelTypes: [0, 2, 5, 13, 15] }],
  async run(ctx) {
    const channel = ctx.get('channel') || ctx.channel;
    await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { ViewChannel: false, MentionEveryone: false }, { reason: `${ctx.user.tag}: hide` });
    return ctx.ok(`تم إخفاء ${channel} عن الجميع.`);
  },
};
