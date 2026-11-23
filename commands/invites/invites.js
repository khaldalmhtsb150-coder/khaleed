const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const inv = require('../../systems/invites');
const { formatDays } = require('../../utils/time');

module.exports = {
  name: 'invites',
  aliases: ['دعوات', 'انفايت'],
  description: 'عرض دعوات عضو ونقاطه',
  options: [{ name: 'user', type: 'user', description: 'العضو' }],
  async run(ctx) {
    const user = ctx.get('user') || ctx.user;
    const s = inv.stats(ctx.guild.id, user.id);
    const recent = s.invited
      .slice(-8)
      .reverse()
      .map((r) => {
        const stayed = Math.floor(((r.leftAt || Date.now()) - (r.joinedAt || r.timestamp || Date.now())) / 86_400_000);
        return `${E.dot} <@${r.id}> — ${r.leftAt || r.left ? `غادر بعد ${formatDays(stayed)}` : `موجود منذ ${formatDays(stayed)}`}${r.fake ? ' · حساب جديد' : ''}`;
      });
    const embed = ui
      .embed()
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
      .setDescription(
        [
          `### ${E.announce} الدعوات`,
          `${E.dot} الإجمالي: **${s.total}**`,
          `${E.dot} الحالية: **${s.regular}** ${E.dot} غادروا: **${s.left}** ${E.dot} وهمية: **${s.fake}** ${E.dot} إضافية: **${s.bonus}**`,
          `${E.coins} النقاط: **${s.points}**`,
          recent.length ? `\n**آخر المدعوين**\n${recent.join('\n')}` : '',
        ].join('\n')
      );
    return ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
