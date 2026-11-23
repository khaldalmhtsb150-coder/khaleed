const E = require('../../utils/emojis');

module.exports = {
  name: 'unmute',
  aliases: ['فك-اسكات'],
  description: 'إزالة الإسكات عن عضو',
  perms: ['ModerateMembers'],
  botPerms: ['ModerateMembers'],
  options: [{ name: 'member', type: 'member', description: 'العضو', required: true }],
  async run(ctx) {
    const member = ctx.get('member');
    if (!member.isCommunicationDisabled()) return ctx.fail('العضو غير مُسكت.');
    await member.timeout(null, ctx.user.tag);
    return ctx.reply({ content: `${E.unlock} تم فك الإسكات عن ${member.user}.`, allowedMentions: { parse: [] } });
  },
};
