const E = require('../../utils/emojis');
const hierarchy = require('./_hierarchy');

module.exports = {
  name: 'nick',
  aliases: ['لقب'],
  description: 'تغيير لقب عضو (فاضي = يرجع اسمه الأصلي)',
  perms: ['ManageNicknames'],
  botPerms: ['ManageNicknames'],
  options: [
    { name: 'member', type: 'member', description: 'العضو', required: true },
    { name: 'nickname', type: 'string', description: 'اللقب الجديد', rest: true },
  ],
  async run(ctx) {
    const member = ctx.get('member');
    if (member.id !== ctx.user.id) {
      const blocked = hierarchy(ctx, member, 'تعديل');
      if (blocked) return ctx.fail(blocked);
    }
    const nick = (ctx.get('nickname') || '').slice(0, 32) || null;
    await member.setNickname(nick, `${ctx.user.tag}`);
    return ctx.reply({ content: nick ? `${E.success} صار لقب ${member} **${nick}**` : `${E.success} رجع اسم ${member} الأصلي`, allowedMentions: { parse: [] } });
  },
};
