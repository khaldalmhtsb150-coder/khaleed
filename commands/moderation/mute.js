const E = require('../../utils/emojis');
const hierarchy = require('./_hierarchy');
const { parseDuration, formatDuration } = require('../../utils/time');

module.exports = {
  name: 'mute',
  aliases: ['اسكات', 'تايم'],
  description: 'إسكات عضو مؤقتاً (Timeout)',
  perms: ['ModerateMembers'],
  botPerms: ['ModerateMembers'],
  options: [
    { name: 'member', type: 'member', description: 'العضو', required: true },
    { name: 'duration', type: 'string', description: 'المدة مثل 10m أو 1h (حد أقصى 28d)', label: 'المدة', required: true },
    { name: 'reason', type: 'string', description: 'السبب', label: 'السبب', rest: true },
  ],
  async run(ctx) {
    const member = ctx.get('member');
    const ms = parseDuration(ctx.get('duration'));
    if (!ms || ms > 28 * 86_400_000) return ctx.fail('المدة مش زابطة، أقصى شي 28 يوم.');
    const blocked = hierarchy(ctx, member, 'إسكات');
    if (blocked) return ctx.fail(blocked);
    const reason = ctx.get('reason') || 'بدون سبب';
    await member.timeout(ms, `${ctx.user.tag}: ${reason}`);
    return ctx.reply({ content: `${E.timer} تم إسكات ${member.user} لمدة ${formatDuration(ms)} — ${reason}`, allowedMentions: { parse: [] } });
  },
};
