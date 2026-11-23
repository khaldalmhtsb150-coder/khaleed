const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const gw = require('../../systems/giveaways');
const { ts } = require('../../utils/time');

module.exports = {
  name: 'glist',
  aliases: ['giveaways', 'قيفات'],
  description: 'عرض القيفاواي النشطة في السيرفر',
  async run(ctx) {
    const active = gw.list().filter((g) => g.guildId === ctx.guild.id && !g.ended);
    if (!active.length) return ctx.fail('لا يوجد قيفاواي نشط حالياً.');
    const lines = active
      .slice(0, 15)
      .map((g) => `${E.gift} **${g.prize}** — [الرسالة](https://discord.com/channels/${g.guildId}/${g.channelId}/${g.messageId})\n${ui.hint(`ينتهي ${ts(g.endTime)} · ${g.winnersCount} فائز · ${g.entrants.length} مشارك`)}`);
    return ctx.reply({ embeds: [ui.embed().setDescription([`### القيفاواي النشطة`, '', ...lines].join('\n'))] });
  },
};
