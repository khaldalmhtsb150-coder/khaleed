const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'listrewards',
  aliases: ['الجوائز'],
  description: 'عرض جوائز عجلة الحظ',
  async run(ctx) {
    const list = store.get('wheelRewards')[ctx.guild.id];
    if (!Array.isArray(list) || !list.length) return ctx.fail('لا توجد جوائز بعد.');
    return ctx.reply({
      embeds: [ui.embed().setDescription(ui.trim([`### ${E.wheel} جوائز العجلة (${list.length})`, '', ...list.map((r, i) => `\`${i + 1}\` ${r}`)].join('\n'), 4000))],
    });
  },
};
