const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'ticket-stats',
  aliases: ['tstats', 'احصائيات-الدعم'],
  description: 'عرض إحصائيات موظف الدعم: التذاكر المستلمة ومتوسط التقييم',
  options: [{ name: 'staff', type: 'user', description: 'موظف الدعم' }],
  async run(ctx) {
    const user = ctx.get('staff') || ctx.user;
    const s = store.peek('staffRatings', ctx.guild.id)?.[user.id] || { claimed: 0, closed: 0, ratings: [] };
    const count = s.ratings.length;
    const avg = count ? s.ratings.reduce((a, r) => a + r.stars, 0) / count : 0;
    const full = Math.round(avg);
    const dist = [5, 4, 3, 2, 1]
      .map((n) => {
        const c = s.ratings.filter((r) => r.stars === n).length;
        const bar = count ? '█'.repeat(Math.round((c / count) * 12)).padEnd(12, '░') : '░'.repeat(12);
        return `\`${n}★ ${bar}\` ${c}`;
      })
      .join('\n');
    const open = Object.values(store.peek('tickets', ctx.guild.id) || {}).filter((t) => t.status === 'open' && t.claimedBy === user.id).length;

    const embed = ui
      .embed()
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
      .setDescription(
        [
          `### ${E.ticket} إحصائيات الدعم`,
          `${E.dot} تذاكر مستلمة: **${s.claimed}**`,
          `${E.dot} تذاكر مغلقة: **${s.closed || 0}**`,
          `${E.dot} قيد المتابعة الآن: **${open}**`,
          `${E.star} متوسط التقييم: **${avg.toFixed(2)}** / 5 ${count ? `${'★'.repeat(full)}${'☆'.repeat(5 - full)}` : ''}`,
          ui.hint(`من ${count} تقييم`),
          '',
          dist,
        ].join('\n')
      );
    return ctx.reply({ embeds: [embed] });
  },
};
