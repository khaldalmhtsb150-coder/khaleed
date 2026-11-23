const E = require('../../utils/emojis');

module.exports = {
  name: 'lock',
  aliases: ['قفل'],
  description: 'قفل القناة ومنع الكتابة',
  perms: ['ManageChannels'],
  botPerms: ['ManageChannels', 'ManageRoles'],
  options: [{ name: 'channel', type: 'channel', description: 'القناة (الحالية افتراضياً)', channelTypes: [0, 2, 5, 13, 15] }],
  async run(ctx) {
    const channel = ctx.get('channel') || ctx.channel;
    await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: false, SendMessagesInThreads: false, AddReactions: false }, { reason: `${ctx.user.tag}: lock` });
    return ctx.reply(`${E.lock} تم قفل ${channel}.`);
  },
};
