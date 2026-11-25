const E = require('../../utils/emojis');

module.exports = {
  name: 'role',
  aliases: ['رتبة'],
  description: 'إعطاء أو سحب رتبة من عضو',
  perms: ['ManageRoles'],
  botPerms: ['ManageRoles'],
  options: [
    { name: 'action', type: 'string', description: 'إعطاء أو سحب', required: true, choices: [{ name: 'إعطاء', value: 'add' }, { name: 'سحب', value: 'remove' }] },
    { name: 'member', type: 'member', description: 'العضو', required: true },
    { name: 'role', type: 'role', description: 'الرتبة', required: true },
  ],
  async run(ctx) {
    const member = ctx.get('member');
    const role = ctx.get('role');
    if (role.managed || role.id === ctx.guild.id) return ctx.fail('هاي الرتبة ما بتنعطى يدوياً.');
    if (!role.editable) return ctx.fail('الرتبة أعلى من رتبة البوت.');
    if (ctx.user.id !== ctx.guild.ownerId && ctx.member.roles.highest.comparePositionTo(role) <= 0) return ctx.fail('الرتبة أعلى من رتبتك أو مساوية لها.');
    const add = ctx.get('action') === 'add';
    await (add ? member.roles.add(role, ctx.user.tag) : member.roles.remove(role, ctx.user.tag));
    return ctx.reply({ content: `${E.success} ${add ? 'أعطيت' : 'سحبت'} ${role} ${add ? 'لـ' : 'من'} ${member}`, allowedMentions: { parse: [] } });
  },
};
