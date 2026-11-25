const E = require('../../utils/emojis');
const hierarchy = require('./_hierarchy');

module.exports = {
  name: 'softban',
  aliases: ['سوفت-باند'],
  description: 'حظر وفك فوري: بيطلع العضو وبتنمسح رسايله آخر يوم',
  perms: ['BanMembers'],
  botPerms: ['BanMembers'],
  options: [
    { name: 'member', type: 'member', description: 'العضو', required: true },
    { name: 'reason', type: 'string', description: 'السبب', label: 'السبب', rest: true },
  ],
  async run(ctx) {
    const member = ctx.get('member');
    const blocked = hierarchy(ctx, member, 'حظر');
    if (blocked) return ctx.fail(blocked);
    const reason = ctx.get('reason') || 'بدون سبب';
    await ctx.guild.members.ban(member.id, { reason: `${ctx.user.tag}: سوفت باند — ${reason}`, deleteMessageSeconds: 86400 });
    await ctx.guild.bans.remove(member.id, 'سوفت باند').catch(() => {});
    return ctx.reply({ content: `${E.ban} ${member.user} طلع وانمسحت رسايله آخر 24 ساعة (بيقدر يرجع)\n-# ${reason}`, allowedMentions: { parse: [] } });
  },
};
