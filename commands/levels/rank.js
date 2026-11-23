const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const lv = require('../../systems/levels');

module.exports = {
  name: 'rank',
  aliases: ['رانك', 'لفل', 'مستوى', 'level'],
  description: 'بطاقة مستواك: اللفل، الترتيب، XP الكتابة والفويس، والصدى',
  cooldown: 5,
  options: [{ name: 'user', type: 'user', description: 'العضو (اتركه فاضي لنفسك)' }],
  async run(ctx) {
    const conf = lv.config(ctx.guild.id);
    if (!conf.enabled) return ctx.fail('نظام المستويات متوقف بهذا السيرفر.');
    const user = ctx.get('user') || ctx.user;
    if (user.bot) return ctx.fail('البوتات ما إلها لفل.');
    const member = await ctx.guild.members.fetch(user.id).catch(() => null);
    if (!member) return ctx.fail('العضو مش موجود بالسيرفر.');
    await ctx.defer();
    const file = await lv.renderCard(member).catch((e) => (console.error('[rank]', e.message), null));
    if (file) return ctx.reply({ files: [file] });

    // text fallback when no canvas library is installed
    const e = lv.entry(ctx.guild.id, member.id);
    const t = lv.levelOf(e.tx);
    const v = lv.levelOf(e.vx);
    const bar = (p) => '▰'.repeat(Math.round(p * 12)).padEnd(12, '▱');
    return ctx.reply({
      embeds: [
        ui
          .embed()
          .setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL() })
          .setDescription(
            [
              `${E.star} **لفل الكتابة ${t.level}** — الترتيب #${lv.rankOf(ctx.guild.id, member.id) || '—'}`,
              `${bar(t.current / t.next)} \`${t.current}/${t.next}\``,
              `${E.voice} **لفل الفويس ${v.level}** — ${e.vmin || 0} دقيقة`,
              `${E.heart} **الصدى:** ${e.echo || 0}`,
            ].join('\n')
          ),
      ],
    });
  },
};
