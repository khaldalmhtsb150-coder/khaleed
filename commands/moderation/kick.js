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
    await member.send(`${E.ban} تم طردك من **${ctx.guild.name}**\n${E.dot} السبب: ${reason}`).catch(() => {});
    await member.kick(`${ctx.user.tag}: ${reason}`);
    return ctx.reply({ content: `${E.ban} تم طرد ${member.user} — ${reason}`, allowedMentions: { parse: [] } });
  },
};
