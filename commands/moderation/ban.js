const E = require('../../utils/emojis');
const hierarchy = require('./_hierarchy');

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
    await member?.send(`${E.ban} تم حظرك من **${ctx.guild.name}**\n${E.dot} السبب: ${reason}`).catch(() => {});
    await ctx.guild.members.ban(user.id, { reason: `${ctx.user.tag}: ${reason}`, deleteMessageSeconds: 0 });
    return ctx.reply({ content: `${E.ban} تم حظر ${user} — ${reason}`, allowedMentions: { parse: [] } });
  },
};
