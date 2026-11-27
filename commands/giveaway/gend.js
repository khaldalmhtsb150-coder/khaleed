const E = require('../../utils/emojis');
const gw = require('../../systems/giveaways');

module.exports = {
  name: 'gend',
  aliases: ['انهاء'],
  description: 'إنهاء قيفاواي مبكراً',
  perms: ['ManageGuild'],
  options: [{ name: 'message_id', type: 'string', description: 'آيدي رسالة القيفاواي', label: 'آيدي الرسالة', required: true }],
  async run(ctx) {
    const g = gw.find(ctx.get('message_id'));
    if (!g || g.guildId !== ctx.guild.id) return ctx.fail('ما لقيت القيفاواي.');
    if (g.ended) return ctx.fail('هذا القيفاواي منتهي بالفعل، استخدم greroll لإعادة السحب.');
    await gw.end(ctx.client, g);
    return ctx.reply({ content: `${E.success} تم إنهاء القيفاواي.` }, { ephemeral: true });
  },
};
