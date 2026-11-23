const E = require('../../utils/emojis');
const store = require('../../utils/store');
const inv = require('../../systems/invites');

module.exports = {
  name: 'addpoints',
  aliases: ['نقاط'],
  description: 'إضافة أو خصم نقاط لعضو (رقم سالب للخصم)',
  perms: ['ManageGuild'],
  options: [
    { name: 'user', type: 'user', description: 'العضو', required: true },
    { name: 'amount', type: 'integer', description: 'عدد النقاط', label: 'العدد', required: true, min: -1000, max: 1000 },
  ],
  async run(ctx) {
    const user = ctx.get('user');
    const e = inv.entry(ctx.guild.id, user.id);
    e.points = Math.max(0, e.points + ctx.get('amount'));
    store.save('invites');
    return ctx.reply({ content: `${E.coins} رصيد ${user} أصبح **${e.points}** نقطة.`, allowedMentions: { parse: [] } });
  },
};
