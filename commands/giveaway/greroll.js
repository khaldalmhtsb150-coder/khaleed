const E = require('../../utils/emojis');
const gw = require('../../systems/giveaways');

module.exports = {
  name: 'greroll',
  aliases: ['اعادة', 'winners'],
  description: 'إعادة سحب الفائزين لقيفاواي منتهي',
  perms: ['ManageGuild'],
  options: [{ name: 'message_id', type: 'string', description: 'آيدي رسالة القيفاواي', label: 'آيدي الرسالة', required: true }],
  async run(ctx) {
    const g = gw.find(ctx.get('message_id'));
    if (!g || g.guildId !== ctx.guild.id) return ctx.fail('ما لقيت القيفاواي.');
    if (!g.ended) return ctx.fail('القيفاواي ما زال جارياً.');
    await gw.end(ctx.client, g, { reroll: true });
    return ctx.ok(`تمت إعادة السحب.`, { ephemeral: true });
  },
};
