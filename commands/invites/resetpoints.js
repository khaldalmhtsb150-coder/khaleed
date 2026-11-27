const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const store = require('../../utils/store');
const inv = require('../../systems/invites');
const botlog = require('../../utils/botlog');

module.exports = {
  name: 'resetpoints',
  aliases: ['تصفير-النقاط', 'تصفير'],
  description: 'تصفير نقاط العجلة لعضو معين، أو للكل إذا ما حددت عضو',
  perms: ['ManageGuild'],
  cooldown: 5,
  options: [{ name: 'user', type: 'user', description: 'العضو (اتركه فاضي لتصفير نقاط الكل)' }],
  async run(ctx) {
    const user = ctx.get('user');

    // one member
    if (user) {
      const e = inv.entry(ctx.guild.id, user.id);
      const before = e.points;
      e.points = 0;
      store.save('invites');
      return ctx.ok(`تم تصفير نقاط ${user} (كانت **${before}**).`);
    }

    // everyone — ask for confirmation first
    const all = store.peek('invites', ctx.guild.id) || {};
    const holders = Object.values(all).filter((e) => e && e.points > 0);
    if (!holders.length) return ctx.fail('ما في حدا عنده نقاط حالياً.');
    const total = holders.reduce((a, e) => a + e.points, 0);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rp_yes').setLabel('نعم، صفّر الكل').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('rp_no').setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
    );
    const msg = await ctx.reply({
      embeds: [ui.embed().setDescription(`### ${E.warning} تصفير نقاط الكل\nرح تنمسح **${total}** نقطة من **${holders.length}** عضو.\n${ui.hint('الدعوات نفسها ما بتنمسح، بس النقاط.')}`)],
      components: [row],
    });

    const click = await msg
      .awaitMessageComponent({ filter: (i) => i.user.id === ctx.user.id && ['rp_yes', 'rp_no'].includes(i.customId), time: 30_000 })
      .catch(() => null);

    if (!click || click.customId === 'rp_no') {
      const text = click ? `${E.dot} تم الإلغاء.` : `${E.dot} انتهى الوقت، ما تم التصفير.`;
      if (click) return click.update({ embeds: [ui.embed().setDescription(text)], components: [] });
      return msg.edit({ embeds: [ui.embed().setDescription(text)], components: [] }).catch(() => {});
    }

    for (const e of Object.values(store.get('invites')[ctx.guild.id] || {})) if (e && typeof e.points === 'number') e.points = 0;
    store.save('invites');
    botlog.log('owner', `صفّر نقاط العجلة لكل الأعضاء (${total} نقطة)`, { user: { id: ctx.user.id, name: ctx.user.username }, guild: ctx.guild });
    return click.update({ embeds: [ui.embed().setDescription(`${E.success} تم تصفير نقاط **${holders.length}** عضو.`)], components: [] });
  },
};
