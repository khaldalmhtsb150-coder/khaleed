const E = require('../../utils/emojis');
const jail = require('../../systems/jail');
const { parseDuration, formatDuration } = require('../../utils/time');

module.exports = {
  name: 'jail',
  aliases: ['اسجن', 'سجن'],
  description: 'سجن عضو: سحب رتبه وعزله في قناة السجن',
  perms: ['ModerateMembers'],
  botPerms: ['ManageRoles'],
  options: [
    { name: 'member', type: 'member', description: 'العضو', required: true },
    { name: 'duration', type: 'string', description: 'المدة مثل 1h أو 1d (اختياري)', label: 'المدة' },
    { name: 'reason', type: 'string', description: 'السبب', label: 'السبب', rest: true },
  ],
  async run(ctx) {
    const raw = ctx.get('duration');
    let ms = raw ? parseDuration(raw) : null;
    let reason = ctx.get('reason');
    // prefix: if the second token isn't a duration, treat it as part of the reason
    if (raw && !ms) {
      reason = [raw, reason].filter(Boolean).join(' ');
      ms = null;
    }
    await ctx.defer();
    const res = await jail.jail({
      guild: ctx.guild,
      target: ctx.get('member'),
      moderator: ctx.member,
      durationMs: ms,
      reason: reason || 'بدون سبب',
    });
    if (res.error) return ctx.fail(res.error);
    return ctx.reply({
      content: `${E.lock} تم سجن ${ctx.get('member')}${ms ? ` لمدة ${formatDuration(ms)}` : ''} — ${reason || 'بدون سبب'}`,
      allowedMentions: { parse: [] },
    });
  },
};
