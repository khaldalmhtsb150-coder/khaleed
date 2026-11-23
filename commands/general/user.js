const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const { ts } = require('../../utils/time');

module.exports = {
  name: 'user',
  aliases: ['يوزر', 'userinfo'],
  description: 'عرض معلومات عضو',
  options: [{ name: 'member', type: 'member', description: 'العضو' }],
  async run(ctx) {
    const member = ctx.get('member') || ctx.member;
    const user = await member.user.fetch().catch(() => member.user);
    const roles = member.roles.cache.filter((r) => r.id !== ctx.guild.id).sort((a, b) => b.position - a.position);
    const embed = ui
      .embed()
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setDescription(
        [
          `${E.dot} الحساب: ${user} \`${user.id}\``,
          `${E.dot} إنشاء الحساب: ${ts(user.createdTimestamp)}`,
          `${E.dot} الانضمام للسيرفر: ${member.joinedTimestamp ? ts(member.joinedTimestamp) : '—'}`,
          `${E.dot} أعلى رتبة: ${member.roles.highest}`,
          `${E.dot} الرتب (${roles.size}): ${ui.trim(roles.map((r) => `${r}`).join(' ') || 'لا يوجد', 900)}`,
        ].join('\n')
      );
    if (user.banner) embed.setImage(user.bannerURL({ size: 1024 }));
    return ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
