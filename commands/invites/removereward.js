const E = require('../../utils/emojis');
const store = require('../../utils/store');
const odds = require('../../utils/wheelOdds');

module.exports = {
  name: 'removereward',
  aliases: ['حذف-جائزة'],
  description: 'حذف جائزة من العجلة برقمها',
  perms: ['ManageGuild'],
  options: [{ name: 'number', type: 'integer', description: 'رقم الجائزة من listrewards', label: 'الرقم', required: true, min: 1 }],
  async run(ctx) {
    const list = store.get('wheelRewards')[ctx.guild.id];
    const i = ctx.get('number') - 1;
    if (!Array.isArray(list) || !list[i]) return ctx.fail('رقم غير صحيح.');
    const [removed] = list.splice(i, 1);
    store.save('wheelRewards');
    return ctx.ok(`تم حذف: **${odds.nameOf(removed)}**`);
  },
};
