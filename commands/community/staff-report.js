const staff = require('../../systems/staff');

module.exports = {
  name: 'staff-report',
  aliases: ['تقرير-الادارة', 'اداء-الادارة'],
  description: 'تقرير أداء الإدارة لآخر 30 يوم (المجاني مرة بالشهر، البريميوم بأي وقت)',
  perms: ['ManageGuild'],
  cooldown: 10,
  async run(ctx) {
    const can = staff.canReport(ctx.guild.id);
    if (!can.ok) return ctx.fail(`التقرير المجاني مرة بالشهر — الجاي متاح <t:${Math.floor(can.nextAt / 1000)}:R>. بالبريميوم 👑 بتطلبه وقت ما بدك.`);
    await ctx.defer();
    const rows = await staff.report(ctx.guild);
    staff.markReported(ctx.guild.id);
    return ctx.reply({ embeds: [staff.reportEmbed(ctx.guild, rows)], allowedMentions: { parse: [] } });
  },
};
