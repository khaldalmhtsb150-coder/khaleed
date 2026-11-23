const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const store = require('../../utils/store');
const odds = require('../../utils/wheelOdds');

module.exports = {
  name: 'setchance',
  aliases: ['نسبة-جائزة', 'نسبة'],
  description: 'تغيير نسبة فوز جائزة بالعجلة (0 = ما بتطلع لحدا)',
  perms: ['ManageGuild'],
  options: [
    { name: 'number', type: 'integer', description: 'رقم الجائزة من listrewards', label: 'الرقم', required: true, min: 1 },
    { name: 'chance', type: 'string', description: 'النسبة مثل 5 أو 0.5 أو 0، أو auto للتلقائي', label: 'النسبة', required: true },
  ],
  async run(ctx) {
    const list = store.get('wheelRewards')[ctx.guild.id];
    const i = ctx.get('number') - 1;
    if (!Array.isArray(list) || list[i] === undefined) return ctx.fail('رقم غير صحيح. شوف الأرقام بـ /listrewards');
    const chance = odds.parseChance(ctx.get('chance'));
    if (chance === undefined) return ctx.fail('النسبة لازم تكون رقم من 0 لـ 100 (مثل 5 أو 0.5 أو 0)، أو auto.');
    const name = odds.nameOf(list[i]);
    list[i] = chance === null ? name : { name, chance };
    store.save('wheelRewards');
    const t = odds.table(list);
    const lines = [
      `${E.success} **${name}** صارت نسبتها ${chance === null ? 'تلقائية' : `**${odds.fmt(chance)}**`} — الفعلية **${odds.fmt(t.items[i].percent)}**`,
    ];
    if (chance === 0) lines.push(ui.hint('بتضل ظاهرة على العجلة، بس ما بتطلع لحدا.'));
    if (t.overfull) lines.push(`⚠️ مجموع النسب ${odds.fmt(t.fixed)}، أكتر من 100%. البوت بيقسمها بالتناسب.`);
    if (t.total <= 0) lines.push('⚠️ كل الجوائز صارت 0%، العجلة ما رح تلف لحد ما تغيّر نسبة وحدة.');
    return odds.privateReply(ctx, lines.join('\n'));
  },
};
