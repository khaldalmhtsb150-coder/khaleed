const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const radar = require('../../systems/radar');

module.exports = {
  name: 'radar',
  aliases: ['رادار'],
  description: 'رادار الأعضاء الجداد: مين حكى، مين ثبت، ومين صامت — وتنبيه للإدارة',
  perms: ['ManageMessages'],
  options: [
    { name: 'action', type: 'string', description: 'شو بدك؟', choices: [{ name: 'التقرير', value: 'report' }, { name: 'تشغيل التنبيهات', value: 'on' }, { name: 'إيقاف التنبيهات', value: 'off' }] },
    { name: 'days', type: 'string', description: 'فترة التقرير', choices: [{ name: 'آخر 7 أيام', value: '7' }, { name: 'آخر 30 يوم', value: '30' }] },
    { name: 'channel', type: 'channel', description: 'روم تنبيهات الإدارة', channelTypes: [0] },
    { name: 'hours', type: 'integer', description: 'بعد كم ساعة صمت ينبّه', min: 2, max: 168 },
    { name: 'role', type: 'role', description: 'رتبة بتنمنشن مع التنبيه (مثل فريق الترحيب)' },
  ],
  async run(ctx) {
    const action = ctx.get('action') || 'report';
    if (action === 'report') return ctx.reply({ embeds: [radar.reportEmbed(ctx.guild, Number(ctx.get('days') || 30))] });
    if (!ctx.member.permissions.has('ManageGuild')) return ctx.fail('تشغيل التنبيهات للإدارة (Manage Server).');
    const conf = store.guild('radarConfig', ctx.guild.id, { ...radar.DEFAULT });
    if (ctx.get('channel')) conf.channelId = ctx.get('channel').id;
    if (ctx.get('hours')) conf.silentHours = Number(ctx.get('hours'));
    if (ctx.get('role')) conf.roleId = ctx.get('role').id;
    if (action === 'off') {
      conf.enabled = false;
      store.save('radarConfig');
      return ctx.ok(`وقفت تنبيهات الرادار. الإحصائيات بتضل تنحسب.`);
    }
    if (!conf.channelId) conf.channelId = ctx.channel.id;
    conf.enabled = true;
    store.save('radarConfig');
    return ctx.reply(
      [
        `${E.success} الرادار شغال 📡 أي عضو جديد بيضل **${conf.silentHours}** ساعة بدون ولا رسالة، بيوصل تنبيه على <#${conf.channelId}>.`,
        ui.hint('إذا الكفيل شغال، كفيل العضو بينمنشن مع التنبيه.'),
      ].join('\n')
    );
  },
};
