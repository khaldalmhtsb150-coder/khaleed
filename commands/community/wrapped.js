const wrapped = require('../../systems/wrapped');
const premium = require('../../utils/premium');

const last = new Map();
module.exports = {
  name: 'wrapped',
  aliases: ['ملخص', 'ملخص-السيرفر'],
  description: 'ملخص السيرفر لهالشهر لحد هلأ (أنشط عضو، ملك الفويس، الصدى، الأعضاء الجداد...)',
  cooldown: 10,
  async run(ctx) {
    // image rendering is heavy: once every 10 minutes per server (premium: every minute)
    const gap = premium.has(ctx.guild.id, 'wrappedPlus') ? 60_000 : 10 * 60_000;
    const prev = last.get(ctx.guild.id) || 0;
    if (Date.now() - prev < gap) return ctx.fail(`الملخص انعمل قبل شوي — جرّب <t:${Math.floor((prev + gap) / 1000)}:R>.`);
    last.set(ctx.guild.id, Date.now());
    await ctx.defer();
    const conf = wrapped.config(ctx.guild.id);
    const accent = premium.has(ctx.guild.id, 'wrappedPlus') ? conf.accent : '#7950E8';
    const file = await wrapped.render(ctx.guild, wrapped.collect(ctx.guild, wrapped.monthKey()), accent);
    if (!file) return ctx.fail('ما قدرت أرسم الصورة (مكتبة canvas مش مثبتة).');
    return ctx.reply({ content: '📊 **ملخص هالشهر لحد هلأ**', files: [file] });
  },
};
