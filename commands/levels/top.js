const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const lv = require('../../systems/levels');

const TYPES = {
  text: { title: 'توب الكتابة', unit: (e) => `لفل ${lv.levelOf(e.tx).level} · ${e.tx} XP` },
  voice: { title: 'توب الفويس', unit: (e) => `لفل ${lv.levelOf(e.vx).level} · ${e.vmin || 0} دقيقة` },
  week: { title: 'توب الأسبوع', unit: (e) => `${e.score} XP هالأسبوع` },
  echo: { title: 'توب الصدى', unit: (e) => `${e.echo} صدى` },
};
const MEDAL = ['🥇', '🥈', '🥉'];

module.exports = {
  name: 'top',
  aliases: ['توب', 'leaderboard', 'الترتيب'],
  description: 'أكثر الأعضاء تفاعلاً: الكتابة، الفويس، الأسبوع، أو الصدى',
  cooldown: 5,
  options: [
    {
      name: 'type',
      type: 'string',
      description: 'نوع الترتيب',
      choices: [
        { name: 'الكتابة', value: 'text' },
        { name: 'الفويس', value: 'voice' },
        { name: 'هالأسبوع', value: 'week' },
        { name: 'الصدى', value: 'echo' },
      ],
    },
  ],
  async run(ctx) {
    if (!lv.config(ctx.guild.id).enabled) return ctx.fail('نظام المستويات متوقف بهذا السيرفر.');
    const type = TYPES[ctx.get('type')] ? ctx.get('type') : 'text';
    const list = lv.board(ctx.guild.id, type);
    if (!list.length) return ctx.fail('ما في حدا بالترتيب لسا — ابدأوا تفاعلوا!');
    const lines = list
      .slice(0, 10)
      .map((e, i) => `${MEDAL[i] || `\`#${i + 1}\``} <@${e.userId}> — ${TYPES[type].unit(e)}`);
    const me = list.findIndex((e) => e.userId === ctx.user.id);
    const footer = me >= 10 ? `\n${E.dot} ترتيبك: **#${me + 1}** — ${TYPES[type].unit(list[me])}` : '';
    return ctx.reply({
      embeds: [
        ui
          .embed()
          .setAuthor({ name: ctx.guild.name, iconURL: ctx.guild.iconURL() || undefined })
          .setDescription(`### ${TYPES[type].title}\n${lines.join('\n')}${footer}${type === 'week' ? `\n${ui.hint('بيتصفّر كل يوم اثنين.')}` : ''}`),
      ],
      allowedMentions: { parse: [] },
    });
  },
};
