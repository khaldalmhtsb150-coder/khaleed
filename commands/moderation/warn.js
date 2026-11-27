const ui = require('../../utils/ui');
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
      embeds: [
        ui.action({
          title: `تحذير #${warn.id}`,
          kind: 'warning',
          user: member.user,
          moderator: ctx.user,
          reason: warn.reason,
          extra: [{ name: 'مجموع تحذيراته', value: String(count), inline: true }, ...(applied ? [{ name: 'العقوبة التلقائية', value: String(applied), inline: true }] : [])],
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};
