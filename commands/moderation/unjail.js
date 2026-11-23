const E = require('../../utils/emojis');
const jail = require('../../systems/jail');

module.exports = {
  name: 'unjail',
  aliases: ['تحرير', 'فك-سجن'],
  description: 'تحرير عضو من السجن وإرجاع رتبه',
  perms: ['ModerateMembers'],
  botPerms: ['ManageRoles'],
  options: [
    { name: 'user', type: 'user', description: 'العضو', required: true },
    { name: 'reason', type: 'string', description: 'السبب', label: 'السبب', rest: true },
  ],
  async run(ctx) {
    await ctx.defer();
    const user = ctx.get('user');
    const res = await jail.release(ctx.guild, user.id, { by: ctx.user.id, reason: ctx.get('reason') || 'تحرير يدوي' });
    if (res.error) return ctx.fail(res.error);
    return ctx.reply({ content: `${E.unlock} تم تحرير ${user} وإرجاع رتبه.`, allowedMentions: { parse: [] } });
  },
};
