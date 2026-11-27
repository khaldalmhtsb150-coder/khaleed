const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const premium = require('../../utils/premium');
const botlog = require('../../utils/botlog');

module.exports = {
  name: 'premium',
  aliases: ['بريميوم'],
  description: 'حالة بريميوم السيرفر، أو تفعيل كود بريميوم',
  perms: ['ManageGuild'],
  cooldown: 5,
  options: [{ name: 'code', type: 'string', description: 'كود التفعيل (اختياري)', label: 'الكود', maxLength: 40 }],
  async run(ctx) {
    const code = (ctx.get('code') || '').trim();

    if (code) {
      const r = premium.redeem(code, ctx.guild.id, ctx.user.id);
      if (!r.ok) return ctx.fail(r.error);
      botlog.log('owner', `فعّل كود بريميوم (${r.days ? `${r.days} يوم` : 'دائم'})`, { user: { id: ctx.user.id, name: ctx.user.username }, guild: ctx.guild });
      return ctx.reply(
        `### 👑 تم تفعيل البريميوم\n${E.dot} المدة: **${r.days ? `${r.days} يوم` : 'دائم'}**\n${E.dot} ينتهي: ${r.until ? `<t:${Math.floor(r.until / 1000)}:F>` : 'لا ينتهي'}\n${ui.hint('كل الميزات المميزة فعالة الآن من لوحة التحكم.')}`,
        { ephemeral: true }
      );
    }

    const s = premium.status(ctx.guild.id);
    const lines = s.active
      ? [
          '### 👑 السيرفر بريميوم',
          `${E.dot} ينتهي: ${s.until ? `<t:${Math.floor(s.until / 1000)}:R>` : 'دائم'}`,
          '',
          '**الميزات المفعلة:**',
          ...Object.values(premium.FEATURES).map((f) => `${E.success} ${f}`),
        ]
      : [
          `### ${E.crown} السيرفر على الخطة المجانية`,
          s.expired ? `${E.warning} انتهى اشتراك البريميوم السابق.` : null,
          '',
          '**تفتح مع البريميوم:**',
          ...Object.values(premium.FEATURES).map((f) => `${E.dot} ${f}`),
          `${E.dot} ${premium.PLANS.premium.ticketDepartments} قسم تذاكر بدل ${premium.PLANS.free.ticketDepartments}`,
          `${E.dot} جوائز عجلة بلا حدود بدل ${premium.PLANS.free.wheelRewards}`,
          '',
          ui.hint(`عندك كود؟ استخدم ${ctx.isSlash ? '/premium code:' : `${ctx.prefix}premium `}الكود`),
        ].filter((l) => l !== null);
    return ctx.reply({ embeds: [ui.embed().setDescription(lines.join('\n'))] });
  },
};
