const ui = require('../../utils/ui');
const growth = require('../../systems/growth');

module.exports = {
  name: 'refer',
  aliases: ['إحالة', 'احالة'],
  description: 'كود الإحالة: انشر البوت وخذ أسبوع بريميوم لك وللسيرفر الجديد',
  perms: ['ManageGuild'],
  cooldown: 5,
  options: [
    {
      name: 'action',
      type: 'string',
      description: 'شو بدك؟',
      choices: [
        { name: 'كود سيرفري', value: 'code' },
        { name: 'استخدم كود', value: 'use' },
      ],
    },
    { name: 'code', type: 'string', description: 'كود الإحالة (للاستخدام)' },
  ],
  async run(ctx) {
    if (!growth.refOn()) return ctx.fail('برنامج الإحالة موقّف حالياً.');
    const action = ctx.get('action') || (ctx.get('code') ? 'use' : 'code');
    if (action === 'use') {
      const code = ctx.get('code');
      if (!code) return ctx.fail('اكتب الكود بخانة code.');
      const r = await growth.redeemRef(ctx.guild, ctx.user, code);
      return r.ok ? ctx.reply(r.text) : ctx.fail(r.text);
    }
    const { code, count } = growth.refStats(ctx.guild.id);
    const url = growth.inviteUrl();
    return ctx.reply({
      embeds: [
        ui
          .embed()
          .setTitle('🎁 انشر ماركا وخذ بريميوم')
          .setDescription(
            [
              `كود سيرفرك: **\`${code}\`**`,
              '',
              '**كيف؟**',
              `1. صاحبك بيضيف البوت لسيرفره${url ? ` ([رابط الإضافة](${url}))` : ''}`,
              `2. بيكتب هناك: \`/refer action:استخدم كود code:${code}\``,
              '3. السيرفرين بياخذوا **7 أيام بريميوم** فوراً 🎉',
              '',
              `-# الشروط: السيرفر الجديد فيه ${Number(process.env.REF_MIN_MEMBERS) || 50} عضو أو أكثر، ومالكه شخص ثاني، والكود بينستخدم بأول 14 يوم من إضافة البوت.`,
              count ? `-# جبت **${count}** سيرفر لحد هسا 🤍` : null,
            ]
              .filter(Boolean)
              .join('\n')
          ),
      ],
    });
  },
};
