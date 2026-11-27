const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const hierarchy = require('./_hierarchy');
const guard = require('../../systems/guard');
const logs = require('../../systems/logs');
const { parseDuration, formatDuration } = require('../../utils/time');

module.exports = {
  name: 'tempban',
  aliases: ['حظر-مؤقت', 'باند-مؤقت'],
  description: 'حظر مؤقت: بينفك لحاله بعد المدة',
  perms: ['BanMembers'],
  botPerms: ['BanMembers'],
  options: [
    { name: 'user', type: 'user', description: 'العضو أو الآيدي', required: true },
    { name: 'duration', type: 'string', description: 'المدة مثل 1h أو 3d أو 2w', label: 'المدة', required: true },
    { name: 'reason', type: 'string', description: 'السبب', label: 'السبب', rest: true },
  ],
  async run(ctx) {
    const user = ctx.get('user');
    const ms = parseDuration(ctx.get('duration'));
    if (!ms || ms > 365 * 86_400_000) return ctx.fail('المدة مش زابطة (مثل 1h أو 3d، أقصى شي سنة).');
    const member = await ctx.guild.members.fetch(user.id).catch(() => null);
    const blocked = hierarchy(ctx, member, 'حظر');
    if (blocked) return ctx.fail(blocked);
    const reason = ctx.get('reason') || 'بدون سبب';
    await member?.send({ embeds: [ui.notice('danger', `**${ctx.guild.name}**`, { title: 'انحظرت مؤقتاً من السيرفر', fields: [{ name: 'السبب', value: reason, inline: false }, { name: 'المدة', value: formatDuration(ms), inline: false }] })] }).catch(() => {});
    await guard.tempBan(ctx.guild, user.id, ms, `${ctx.user.tag}: ${reason} (مؤقت ${formatDuration(ms)})`);
    return ctx.reply({ embeds: [ui.action({ title: 'حظر مؤقت', user, moderator: ctx.user, reason, duration: `${formatDuration(ms)} · بينفك <t:${Math.round((Date.now() + ms) / 1000)}:R>` })], allowedMentions: { parse: [] } });
  },
};
