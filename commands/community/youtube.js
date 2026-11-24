const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const yt = require('../../systems/youtube');

module.exports = {
  name: 'youtube',
  aliases: ['يوتيوب'],
  description: 'تنبيه بالسيرفر لما قناة يوتيوب تنزّل فيديو أو تبث لايف',
  perms: ['ManageGuild'],
  cooldown: 5,
  options: [
    { name: 'action', type: 'string', description: 'شو بدك؟', required: true, choices: [{ name: 'إضافة قناة', value: 'add' }, { name: 'حذف قناة', value: 'remove' }, { name: 'القنوات المضافة', value: 'list' }] },
    { name: 'link', type: 'string', description: 'رابط قناة اليوتيوب، مثل https://youtube.com/@name' },
    { name: 'channel', type: 'channel', description: 'الروم اللي بينزل فيه التنبيه', channelTypes: [0, 5] },
    { name: 'role', type: 'role', description: 'رتبة بتنمنشن مع التنبيه' },
    { name: 'message', type: 'string', description: 'الرسالة: {role} {channel} {title} {url}' },
  ],
  async run(ctx) {
    const action = ctx.get('action');
    if (action === 'list') {
      const list = yt.feeds(ctx.guild.id);
      if (!list.length) return ctx.reply(`${E.dot} ما في قنوات مضافة. أضف وحدة بـ \`/youtube action:إضافة قناة link:...\``);
      return ctx.reply({
        embeds: [ui.embed().setDescription(['### 🔔 تنبيهات يوتيوب', ...list.map((f) => `▶️ **${f.name}** ← <#${f.discordChannelId}>${f.roleId ? ` • <@&${f.roleId}>` : ''}${f.errors >= 3 ? ' ⚠️ ما قدرت أوصل للقناة آخر مرة' : ''}`), '', ui.hint(`${list.length}/${yt.limit(ctx.guild.id)} قنوات. البوت بيفحص كل 5 دقائق.`)].join('\n'))],
        allowedMentions: { parse: [] },
      });
    }
    const link = ctx.get('link');
    if (!link) return ctx.fail('حط رابط القناة.');
    if (action === 'remove') {
      const f = yt.remove(ctx.guild.id, link);
      return f ? ctx.reply(`${E.success} شلت تنبيهات **${f.name}**.`) : ctx.fail('ما لقيت هالقناة بالقائمة.');
    }
    await ctx.defer();
    try {
      const role = ctx.get('role');
      const { feed, latest } = await yt.add(ctx.guild, { input: link, discordChannelId: (ctx.get('channel') || ctx.channel).id, roleId: role ? role.id : '', message: ctx.get('message') || '' });
      return ctx.reply(
        [
          `${E.success} أي فيديو جديد من **${feed.name}** بينزل على <#${feed.discordChannelId}>.`,
          latest ? `${E.dot} آخر فيديو عندهم: **${latest.title}**` : null,
          ui.hint('التنبيه بيوصل خلال 5 دقائق تقريباً من نزول الفيديو.'),
        ]
          .filter(Boolean)
          .join('\n')
      );
    } catch (e) {
      return ctx.reply(`• ${e.message}`);
    }
  },
};
