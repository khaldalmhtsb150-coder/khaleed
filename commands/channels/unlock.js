const E = require('../../utils/emojis');

module.exports = {
  name: 'unlock',
  aliases: ['فتح'],
  description: 'فتح القناة للكتابة',
  perms: ['ManageChannels'],
  botPerms: ['ManageChannels', 'ManageRoles'],
  options: [{ name: 'channel', type: 'channel', description: 'القناة (الحالية افتراضياً)', channelTypes: [0, 2, 5, 13, 15] }],
  async run(ctx) {
    const channel = ctx.get('channel') || ctx.channel;
    await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: null, SendMessagesInThreads: null, AddReactions: null }, { reason: `${ctx.user.tag}: unlock` });
    return ctx.reply(`${E.unlock} تم فتح ${channel}.`);
  },
};
