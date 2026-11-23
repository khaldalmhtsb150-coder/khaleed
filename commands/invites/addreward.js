const E = require('../../utils/emojis');
const store = require('../../utils/store');
const premium = require('../../utils/premium');

module.exports = {
  name: 'addreward',
  aliases: ['اضافة-جائزة'],
  description: 'إضافة جائزة لعجلة الحظ',
  perms: ['ManageGuild'],
  options: [{ name: 'reward', type: 'string', description: 'نص الجائزة', label: 'الجائزة', required: true, rest: true }],
  async run(ctx) {
    const all = store.get('wheelRewards');
    if (!Array.isArray(all[ctx.guild.id])) all[ctx.guild.id] = [];
    const max = premium.limit(ctx.guild.id, 'wheelRewards');
    if (all[ctx.guild.id].length >= max) return ctx.fail(premium.limitText('wheelRewards', max));
    all[ctx.guild.id].push(ctx.get('reward').slice(0, 200));
    store.save('wheelRewards');
    return ctx.reply(`${E.success} تمت إضافة الجائزة. العدد الحالي: **${all[ctx.guild.id].length}**`);
  },
};
