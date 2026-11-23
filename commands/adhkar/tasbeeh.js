const ui = require('../../utils/ui');
const adhkar = require('../../systems/adhkar');

module.exports = {
  name: 'tasbeeh',
  aliases: ['مسبحة', 'سبحة', 'تسبيح'],
  description: 'مسبحة إلكترونية، أو ترتيب أكثر المسبّحين بالسيرفر',
  cooldown: 3,
  options: [{ name: 'top', type: 'boolean', description: 'عرض ترتيب أكثر المسبّحين' }],
  async run(ctx) {
    if (ctx.get('top')) {
      const top = adhkar.topTasbeeh(ctx.guild.id);
      if (!top.length) return ctx.fail('لسا ما حدا سبّح بالسيرفر. ابدأ إنت بـ /tasbeeh 📿');
      const medals = ['🥇', '🥈', '🥉'];
      return ctx.reply({
        embeds: [
          ui
            .embed()
            .setColor(0x2e8b6e)
            .setDescription(
              ['### 📿 أكثر المسبّحين', '', ...top.map(([uid, n], i) => `${medals[i] || `\`${i + 1}\``} <@${uid}> — **${n.toLocaleString('en')}**`), '', ui.hint('اللهم تقبّل من الجميع')].join('\n')
            ),
        ],
        allowedMentions: { parse: [] },
      });
    }
    return ctx.reply(adhkar.tasbeeh(ctx.user.id, ctx.guild.id, 0, 0), { ephemeral: true });
  },
};
