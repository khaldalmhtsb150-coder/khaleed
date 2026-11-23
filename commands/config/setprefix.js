const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'setprefix',
  aliases: ['بادئة'],
  description: 'تعيين بادئة نصية للسيرفر أو إلغاؤها (اتركها فارغة للإلغاء)',
  perms: ['Administrator'],
  options: [{ name: 'prefix', type: 'string', description: 'البادئة مثل $ أو ! (اتركها فارغة للإلغاء)', label: 'البادئة', maxLength: 5 }],
  async run(ctx) {
    const value = (ctx.get('prefix') || '').trim();
    const prefixes = store.get('prefixes');
    if (!value || ['off', 'none', 'clear', 'الغاء', 'إلغاء'].includes(value.toLowerCase())) {
      delete prefixes[ctx.guild.id];
      store.save('prefixes');
      return ctx.reply(`${E.success} تم إلغاء البادئة النصية.\n${ui.hint('البوت يعمل الآن بأوامر السلاش / فقط.')}`);
    }
    if (value.length > 5 || /\s/.test(value)) return ctx.fail('البادئة يجب أن تكون 1-5 أحرف بدون مسافات.');
    prefixes[ctx.guild.id] = value;
    store.save('prefixes');
    return ctx.reply(`${E.success} تم تعيين البادئة إلى \`${value}\`\n${ui.hint(`مثال: ${value}help`)}`);
  },
};
