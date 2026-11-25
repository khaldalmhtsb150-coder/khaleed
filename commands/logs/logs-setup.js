const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const logs = require('../../systems/logs');

module.exports = {
  name: 'logs-setup',
  aliases: ['انشاء-اللوقات', 'اعداد-السجلات'],
  description: 'البوت بينشئ رومات السجلات بنفسه (مخفية عن الأعضاء) ويربطها',
  perms: ['ManageGuild'],
  cooldown: 30,
  options: [
    {
      name: 'mode',
      type: 'string',
      description: 'روم لكل نوع، أو روم وحدة لكل السجلات',
      choices: [
        { name: 'روم لكل نوع (20 روم مرتبة)', value: 'separate' },
        { name: 'روم لكل قسم (6 رومات)', value: 'grouped' },
        { name: 'روم وحدة لكل السجلات', value: 'single' },
      ],
    },
    { name: 'overwrite', type: 'boolean', description: 'استبدل كمان الرومات اللي محددها قبل' },
  ],
  async run(ctx) {
    await ctx.defer?.();
    try {
      const r = await logs.autoSetup(ctx.guild, { mode: ctx.get('mode') || 'separate', overwrite: Boolean(ctx.get('overwrite')) });
      if (!r.set) return ctx.reply(`${E.success} كل أنواع السجلات مربوطة برومات من قبل. إذا بدك تستبدلها، استخدم \`overwrite:True\`.`);
      return ctx.reply(
        [
          `${E.success} تم إعداد السجلات بكاتيجوري **${r.category.name}**`,
          `${E.dot} رومات جديدة: **${r.made.length}**${r.made.length ? ` (${r.made.map((c) => `${c}`).join(' ')})` : ''}`,
          `${E.dot} أنواع انربطت: **${r.set}**${r.skipped ? ` • ضلت زي ما هي: **${r.skipped}**` : ''}`,
          r.warn ? `${E.warning} ${r.warn}` : null,
          ui.hint('الرومات مخفية عن الأعضاء. اللي معه Manage Server أو رتبة المدراء من الإعدادات بيشوفها.'),
        ]
          .filter(Boolean)
          .join('\n')
      );
    } catch (e) {
      return ctx.fail(e.message);
    }
  },
};
