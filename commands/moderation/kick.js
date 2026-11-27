const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const hierarchy = require('./_hierarchy');

module.exports = {
  name: 'kick',
  aliases: ['طرد'],
  description: 'طرد عضو من السيرفر',
  perms: ['KickMembers'],
  botPerms: ['KickMembers'],
  options: [
    { name: 'member', type: 'member', description: 'العضو', required: true },
    { name: 'reason', type: 'string', description: 'السبب', label: 'السبب', rest: true },
  ],
  async run(ctx) {
    const member = ctx.get('member');
    const reason = ctx.get('reason') || 'بدون سبب';
    const blocked = hierarchy(ctx, member, 'طرد');
    if (blocked) return ctx.fail(blocked);
    await member.send({ embeds: [ui.notice('danger', `**${ctx.guild.name}**`, { title: 'انطردت من السيرفر', fields: [{ name: 'السبب', value: reason, inline: false }] })] }).catch(() => {});
    await member.kick(`${ctx.user.tag}: ${reason}`);
    return ctx.reply({ embeds: [ui.action({ title: 'طرد', user: member.user, moderator: ctx.user, reason })], allowedMentions: { parse: [] } });
  },
};
