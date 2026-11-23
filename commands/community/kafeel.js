const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const kafeel = require('../../systems/kafeel');

module.exports = {
  name: 'kafeel',
  aliases: ['كفيل', 'الكفيل'],
  description: 'نظام الكفيل: مين كفيلك، مين بتكفل، وأفضل الكفلاء',
  cooldown: 5,
  options: [{ name: 'user', type: 'user', description: 'العضو (اتركه فاضي لنفسك)' }],
  async run(ctx) {
    const conf = kafeel.config(ctx.guild.id);
    if (!conf.enabled) return ctx.fail('نظام الكفيل متوقف بهذا السيرفر. فعّله من الداشبورد ← المجتمع.');
    const user = ctx.get('user') || ctx.user;
    const s = kafeel.summary(ctx.guild.id, user.id);
    const lines = [`### 🤝 الكفيل — ${user.username}`];
    if (s.mySponsor) lines.push(`${E.dot} كفيله: <@${s.mySponsor.sponsorId}> ${s.mySponsor.status === 'open' ? `(${s.mySponsor.msgs}/${conf.goalMessages} رسالة)` : s.mySponsor.status === 'done' ? '✅' : ''}`);
    lines.push(`${E.dot} بيكفل هلأ: ${s.sponsoring.length ? s.sponsoring.map((x) => `<@${x.id}> (${x.msgs}/${conf.goalMessages})`).join('، ') : 'ولا حدا'}`);
    lines.push(`${E.dot} كفالات ناجحة: **${s.stats.done}**`);
    if (s.top.length) lines.push('', '**أفضل الكفلاء**', ...s.top.map(([id, st], i) => `${i + 1}. <@${id}> — ${st.done}`));
    return ctx.reply({ embeds: [ui.embed().setDescription(lines.join('\n'))], allowedMentions: { parse: [] } });
  },
};
