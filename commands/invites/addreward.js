const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const store = require('../../utils/store');
const premium = require('../../utils/premium');
const odds = require('../../utils/wheelOdds');

module.exports = {
  name: 'addreward',
  aliases: ['اضافة-جائزة'],
  description: 'إضافة جائزة لعجلة الحظ مع نسبة فوزها (اختياري)',
  perms: ['ManageGuild'],
  options: [
    { name: 'reward', type: 'string', description: 'نص الجائزة (بالبريفكس بتقدر تكتب النسبة آخرها: نيترو 5%)', label: 'الجائزة', required: true, rest: true },
    { name: 'chance', type: 'string', description: 'نسبة الفوز مثل 5 أو 0.5 أو 0 (فاضي = تلقائي)' },
  ],
  async run(ctx) {
    const all = store.get('wheelRewards');
    if (!Array.isArray(all[ctx.guild.id])) all[ctx.guild.id] = [];
    const max = premium.limit(ctx.guild.id, 'wheelRewards');
    if (all[ctx.guild.id].length >= max) return ctx.fail(premium.limitText('wheelRewards', max));

    let explicit = null;
    if (ctx.get('chance') !== null) {
      explicit = odds.parseChance(ctx.get('chance'));
      if (explicit === undefined) return ctx.fail('النسبة لازم تكون رقم من 0 لـ 100، مثل 5 أو 0.5 أو 0.');
    }
    const r = odds.parse(ctx.get('reward'), explicit);
    if (!r.name) return ctx.fail('اكتب اسم الجائزة.');
    all[ctx.guild.id].push(r.chance === null ? r.name : r);
    store.save('wheelRewards');

    const t = odds.table(all[ctx.guild.id]);
    const mine = t.items[t.items.length - 1];
    const lines = [
      `${E.success} تمت إضافة **${r.name}** — نسبتها الفعلية **${odds.fmt(mine.percent)}**${r.chance === null ? ' (تلقائي)' : ''}`,
      ui.hint(`عدد الجوائز: ${t.items.length} • شوف كل النسب بـ /listrewards`),
    ];
    if (t.overfull) lines.push(`${E.warning || '⚠️'} مجموع النسب اللي حطيتها ${odds.fmt(t.fixed)}، أكتر من 100%. البوت بيقسمها بالتناسب.`);
    return odds.privateReply(ctx, lines.join('\n'));
  },
};
