const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const odds = require('../../utils/wheelOdds');

module.exports = {
  name: 'listrewards',
  aliases: ['الجوائز'],
  description: 'عرض جوائز عجلة الحظ (النسب بتبين للمشرفين بس)',
  async run(ctx) {
    const list = store.get('wheelRewards')[ctx.guild.id];
    if (!Array.isArray(list) || !list.length) return ctx.fail('لا توجد جوائز بعد.');
    const staff = ctx.member?.permissions?.has('ManageGuild');
    const names = (rows) => ui.embed().setDescription(ui.trim([`### ${E.wheel} جوائز العجلة (${list.length})`, '', ...rows].join('\n'), 4000));

    if (!staff) return ctx.reply({ embeds: [names(list.map((r, i) => `\`${i + 1}\` ${odds.nameOf(r)}`))] });

    const t = odds.table(list);
    const rows = t.items.map(
      (it, i) =>
        `\`${i + 1}\` ${it.name} — **${odds.fmt(it.percent)}**${it.set === null ? ' · تلقائي' : ''}${it.weight <= 0 ? ' · ما بتطلع' : ''}`
    );
    const notes = [ui.hint('غيّر نسبة بـ /setchance • 0 = بتضل على العجلة بس ما بتطلع لحدا')];
    if (t.overfull) notes.push(`⚠️ مجموع النسب اللي حطيتها ${odds.fmt(t.fixed)}، أكتر من 100%، فالبوت بيقسمها بالتناسب.`);
    else if (t.scaled) notes.push(`⚠️ مجموع النسب ${odds.fmt(t.fixed)} مش 100%، فالبوت بيقسمها بالتناسب (النسب الفعلية فوق).`);
    if (t.total <= 0) notes.push('⚠️ كل الجوائز 0%، العجلة ما رح تلف.');
    const embed = names([...rows, '', ...notes]);

    if (ctx.isSlash) return ctx.reply({ embeds: [embed] }, { ephemeral: true });
    // prefix messages are public: the chances go to the admin's DMs, the channel only sees the names
    const dm = await ctx.user.send({ content: `${E.wheel} نسب جوائز العجلة بسيرفر **${ctx.guild.name}**:`, embeds: [embed] }).catch(() => null);
    await ctx.reply({ embeds: [names(list.map((r, i) => `\`${i + 1}\` ${odds.nameOf(r)}`))] });
    return ctx.reply(dm ? `${E.dot} بعتتلك النسب بالخاص عشان ما يشوفها الأعضاء.` : `${E.dot} خاصك مسكّر. استخدم \`/listrewards\` عشان تشوف النسب بشكل مخفي.`);
  },
};
