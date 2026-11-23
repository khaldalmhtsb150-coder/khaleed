const { ChannelType } = require('discord.js');
const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const { ts } = require('../../utils/time');

module.exports = {
  name: 'server',
  aliases: ['سيرفر', 'serverinfo'],
  description: 'عرض معلومات السيرفر',
  async run(ctx) {
    const g = ctx.guild;
    const text = g.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voice = g.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
    const embed = ui
      .embed()
      .setAuthor({ name: g.name, iconURL: g.iconURL() || undefined })
      .setThumbnail(g.iconURL({ size: 256 }))
      .setDescription(
        [
          `${E.crown} المالك: <@${g.ownerId}>`,
          `${E.dot} الآيدي: \`${g.id}\``,
          `${E.dot} الإنشاء: ${ts(g.createdTimestamp)}`,
          `${E.dot} الأعضاء: **${g.memberCount}**`,
          `${E.dot} القنوات: **${text}** كتابية ${E.dot} **${voice}** صوتية`,
          `${E.dot} الرتب: **${g.roles.cache.size - 1}**`,
          `${E.dot} البوست: مستوى **${g.premiumTier}** (${g.premiumSubscriptionCount || 0})`,
          g.vanityURLCode ? `${E.dot} الرابط المخصص: \`discord.gg/${g.vanityURLCode}\`` : null,
        ]
          .filter(Boolean)
          .join('\n')
      );
    if (g.banner) embed.setImage(g.bannerURL({ size: 1024 }));
    return ctx.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
