const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const adhkar = require('../../systems/adhkar');

module.exports = {
  name: 'azkar-setup',
  aliases: ['اعداد-الاذكار'],
  description: 'نشر الأذكار تلقائياً بقناة (ذكر كل فترة + أذكار الصباح والمساء + تذكير الجمعة)',
  perms: ['ManageGuild'],
  options: [
    { name: 'channel', type: 'channel', description: 'قناة الأذكار (فاضي = إيقاف)', channelTypes: [0, 5] },
    { name: 'interval', type: 'integer', description: 'ذكر كل كم دقيقة (15 لـ 1440، و 0 = بدون)', min: 0, max: 1440 },
    { name: 'sabah_masa', type: 'boolean', description: 'أذكار الصباح بعد الفجر والمساء بعد العصر' },
    { name: 'friday', type: 'boolean', description: 'تذكير يوم الجمعة (الكهف والصلاة على النبي)' },
    { name: 'role', type: 'role', description: 'منشن رتبة مع كل نشر (اختياري)' },
  ],
  async run(ctx) {
    const conf = store.guild('adhkarConfig', ctx.guild.id, { ...adhkar.DEFAULT });
    const ch = ctx.get('channel');
    if (!ch && ctx.get('interval') === null && ctx.get('sabah_masa') === null && ctx.get('friday') === null && !ctx.get('role')) {
      conf.enabled = false;
      store.save('adhkarConfig');
      return ctx.reply(`${E.success} تم إيقاف نشر الأذكار التلقائي.`);
    }
    if (ch) {
      conf.channelId = ch.id;
      conf.enabled = true;
    }
    if (!conf.channelId) return ctx.fail('حدد قناة للأذكار.');
    const iv = ctx.get('interval');
    if (iv !== null) conf.interval = iv === 0 ? 0 : Math.max(15, iv);
    if (ctx.get('sabah_masa') !== null) conf.sabahMasa = ctx.get('sabah_masa');
    if (ctx.get('friday') !== null) conf.friday = ctx.get('friday');
    if (ctx.get('role')) conf.roleId = ctx.get('role').id;
    store.save('adhkarConfig');
    return ctx.reply(
      [
        `${E.success} تم تفعيل الأذكار بـ <#${conf.channelId}>`,
        `${E.dot} ذكر تلقائي: ${conf.interval ? `كل **${conf.interval}** دقيقة` : 'متوقف'}`,
        `${E.dot} أذكار الصباح والمساء: ${conf.sabahMasa ? 'بعد الفجر والعصر بـ 20 دقيقة حسب مدينة أوقات الصلاة' : 'متوقفة'}`,
        `${E.dot} تذكير الجمعة: ${conf.friday ? 'شغال' : 'متوقف'}`,
        ui.hint('إذا ما حدا كتب بالقناة من آخر ذكر، البوت ما بينزل ذكر جديد عشان ما تتكدس الرسائل. وكل الإعدادات موجودة بالداشبورد كمان.'),
      ].join('\n')
    );
  },
};
