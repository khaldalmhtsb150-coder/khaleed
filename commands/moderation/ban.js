const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const hierarchy = require('./_hierarchy');
const appeals = require('../../systems/appeals');

module.exports = {
  name: 'ban',
  aliases: ['حظر', 'باند'],
  description: 'حظر عضو من السيرفر',
  perms: ['BanMembers'],
  botPerms: ['BanMembers'],
  options: [
    { name: 'user', type: 'user', description: 'العضو أو الآيدي', required: true },
    { name: 'reason', type: 'string', description: 'السبب', label: 'السبب', rest: true },
  ],
  async run(ctx) {
    const user = ctx.get('user');
    const reason = ctx.get('reason') || 'بدون سبب';
    const member = await ctx.guild.members.fetch(user.id).catch(() => null);
    const blocked = hierarchy(ctx, member, 'حظر');
    if (blocked) return ctx.fail(blocked);
    // with appeals on, the DM carries an "appeal" button; it must go out before the ban (after it the DM usually fails)
    const appealed = appeals.config(ctx.guild.id).enabled ? await appeals.notify(ctx.guild, user, reason).catch(() => false) : false;
    if (!appealed) await member?.send({ embeds: [ui.notice('danger', `**${ctx.guild.name}**`, { title: 'انحظرت من السيرفر', fields: [{ name: 'السبب', value: reason, inline: false }] })] }).catch(() => {});
    await ctx.guild.members.ban(user.id, { reason: `${ctx.user.tag}: ${reason}`, deleteMessageSeconds: 0 });
    return ctx.reply({ embeds: [ui.action({ title: 'حظر', user, moderator: ctx.user, reason })], allowedMentions: { parse: [] } });
  },
};
