const E = require('../../utils/emojis');

module.exports = {
  name: 'unban',
  aliases: ['فك-حظر'],
  description: 'فك حظر عضو بالآيدي',
  perms: ['BanMembers'],
  botPerms: ['BanMembers'],
  options: [{ name: 'user_id', type: 'string', description: 'آيدي العضو', label: 'الآيدي', required: true }],
  async run(ctx) {
    const id = (ctx.get('user_id').match(/\d{17,21}/) || [])[0];
    if (!id) return ctx.fail('الآيدي مش زابط.');
    const ok = await ctx.guild.members.unban(id, `${ctx.user.tag}`).then(() => true).catch(() => false);
    if (!ok) return ctx.fail('هذا العضو غير محظور.');
    return ctx.ok(`تم فك الحظر عن <@${id}>.`);
  },
};
