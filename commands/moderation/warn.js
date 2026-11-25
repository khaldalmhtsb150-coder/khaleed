const E = require('../../utils/emojis');
const art = require('../../utils/art');
const hierarchy = require('./_hierarchy');
const warns = require('../../systems/warns');

module.exports = {
  name: 'warn',
  aliases: ['تحذير', 'انذار'],
  description: 'تحذير عضو (والعقوبة التلقائية بتطبق حسب عدد التحذيرات)',
  perms: ['ModerateMembers'],
  options: [
    { name: 'member', type: 'member', description: 'العضو', required: true },
    { name: 'reason', type: 'string', description: 'السبب', label: 'السبب', rest: true },
  ],
  async run(ctx) {
    const member = ctx.get('member');
    const blocked = hierarchy(ctx, member, 'تحذير');
    if (blocked) return ctx.fail(blocked);
    if (member.user.bot) return ctx.fail('ما بنحذر بوتات.');
    const { warn, count, applied } = await warns.add(ctx.guild, member, ctx.user.id, ctx.get('reason'));
    return ctx.reply({
      content: [`${art.i('bell', '⚠️')} ${member} أخذ تحذير **#${warn.id}** · صار معه **${count}**`, `-# ${warn.reason}${applied ? ` · العقوبة التلقائية: ${applied}` : ''}`].join('\n'),
      allowedMentions: { parse: [] },
    });
  },
};
