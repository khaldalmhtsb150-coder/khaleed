const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const store = require('../../utils/store');
const lv = require('../../systems/levels');
const botlog = require('../../utils/botlog');

module.exports = {
  name: 'xp',
  aliases: ['اكس-بي'],
  description: 'إدارة XP: إعطاء، سحب، تحديد لفل، أو تصفير (عضو أو الكل)',
  perms: ['ManageGuild'],
  cooldown: 3,
  options: [
    {
      name: 'action',
      type: 'string',
      description: 'العملية',
      required: true,
      choices: [
        { name: 'إعطاء XP', value: 'add' },
        { name: 'سحب XP', value: 'remove' },
        { name: 'تحديد لفل', value: 'setlevel' },
        { name: 'تصفير', value: 'reset' },
      ],
    },
    { name: 'user', type: 'user', description: 'العضو (للتصفير: اتركه فاضي لتصفير الكل)' },
    { name: 'amount', type: 'integer', description: 'كمية الـ XP أو رقم اللفل', min: 0, max: 1000000 },
    { name: 'type', type: 'string', description: 'كتابة أو فويس (الافتراضي كتابة)', choices: [{ name: 'الكتابة', value: 'text' }, { name: 'الفويس', value: 'voice' }] },
  ],
  async run(ctx) {
    const action = ctx.get('action');
    const user = ctx.get('user');
    const amount = ctx.get('amount');
    const type = ctx.get('type') === 'voice' ? 'voice' : 'text';
    const key = type === 'voice' ? 'vx' : 'tx';
    const label = type === 'voice' ? 'الفويس' : 'الكتابة';

    if (action === 'reset' && !user) return resetAll(ctx);
    if (!user) return ctx.fail('حدد العضو.');
    if (user.bot) return ctx.fail('البوتات ما إلها XP.');
    const member = await ctx.guild.members.fetch(user.id).catch(() => null);
    if (!member) return ctx.fail('العضو مش موجود بالسيرفر.');
    const e = lv.entry(ctx.guild.id, user.id);

    if (action === 'reset') {
      Object.assign(e, { tx: 0, vx: 0, echo: 0, vmin: 0, wtx: 0, wvx: 0 });
      store.save('levels');
      return ctx.ok(`تم تصفير مستوى ${user}.`);
    }
    if (amount === null) return ctx.fail('اكتب الكمية.');

    if (action === 'add') await lv.addXp(member, amount, type, null);
    else if (action === 'remove') await lv.addXp(member, -Math.min(amount, e[key]), type, null);
    else if (action === 'setlevel') {
      if (amount > 500) return ctx.fail('أعلى لفل ممكن تحدده 500.');
      let xp = 0;
      for (let l = 0; l < amount; l++) xp += lv.need(l);
      e[key] = xp;
      store.save('levels');
      await lv.applyRewards(member, lv.config(ctx.guild.id), type, amount);
    }
    const now = lv.levelOf(e[key]);
    botlog.log('owner', `xp ${action} ${amount} (${type}) لـ ${user.username}`, { user: { id: ctx.user.id, name: ctx.user.username }, guild: ctx.guild });
    return ctx.ok(`${user} صار لفل **${now.level}** بـ${label} (${e[key]} XP).`);
  },
};

async function resetAll(ctx) {
  const all = store.peek('levels', ctx.guild.id) || {};
  const count = Object.keys(all).length;
  if (!count) return ctx.fail('ما في حدا عنده XP.');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('xpr_yes').setLabel('نعم، صفّر الكل').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('xpr_no').setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
  );
  const msg = await ctx.reply({
    embeds: [ui.embed().setDescription(`### ${E.warning} تصفير مستويات الكل\nرح ينمسح XP الكتابة والفويس والصدى لـ **${count}** عضو.\n${ui.hint('رتب المكافآت اللي أخذوها ما بتنشال.')}`)],
    components: [row],
  });
  const click = await msg
    .awaitMessageComponent({ filter: (i) => i.user.id === ctx.user.id && ['xpr_yes', 'xpr_no'].includes(i.customId), time: 30_000 })
    .catch(() => null);
  if (!click || click.customId === 'xpr_no') {
    const t = click ? `${E.dot} تم الإلغاء.` : `${E.dot} انتهى الوقت، ما تم التصفير.`;
    return click ? click.update({ embeds: [ui.embed().setDescription(t)], components: [] }) : msg.edit({ embeds: [ui.embed().setDescription(t)], components: [] }).catch(() => {});
  }
  store.get('levels')[ctx.guild.id] = {};
  store.save('levels');
  botlog.log('owner', `صفّر مستويات كل الأعضاء (${count})`, { user: { id: ctx.user.id, name: ctx.user.username }, guild: ctx.guild });
  return click.update({ embeds: [ui.embed().setDescription(`${E.success} تم تصفير مستويات **${count}** عضو.`)], components: [] });
}
