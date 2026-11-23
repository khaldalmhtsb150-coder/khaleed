const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const store = require('../../utils/store');
const lv = require('../../systems/levels');

const MODES = { current: 'بنفس القناة', channel: 'بقناة محددة', dm: 'بالخاص', off: 'مقفلة' };

module.exports = {
  name: 'levels',
  aliases: ['المستويات', 'نظام-اللفل'],
  description: 'إعدادات المستويات السريعة: تشغيل/إيقاف ومكان رسالة الترقية (الباقي من الداشبورد)',
  perms: ['ManageGuild'],
  options: [
    { name: 'enabled', type: 'boolean', description: 'تشغيل أو إيقاف نظام المستويات' },
    { name: 'announce', type: 'string', description: 'وين تنرسل رسالة الترقية', choices: Object.entries(MODES).map(([value, name]) => ({ name, value })) },
    { name: 'channel', type: 'channel', description: 'قناة رسائل الترقية (لما تختار "بقناة محددة")', channelTypes: [0] },
  ],
  async run(ctx) {
    const conf = store.guild('levelConfig', ctx.guild.id, {});
    if (ctx.get('enabled') !== null) conf.enabled = ctx.get('enabled');
    if (ctx.get('announce')) conf.announce = ctx.get('announce');
    if (ctx.get('channel')) {
      conf.announceChannelId = ctx.get('channel').id;
      if (!ctx.get('announce')) conf.announce = 'channel';
    }
    store.save('levelConfig');
    const c = lv.config(ctx.guild.id);
    if (c.announce === 'channel' && !ctx.guild.channels.cache.has(c.announceChannelId)) return ctx.fail('اختار قناة لرسائل الترقية بخيار channel.');
    return ctx.reply(
      [
        `### ${E.star} نظام المستويات`,
        `${E.dot} الحالة: **${c.enabled ? 'شغال' : 'متوقف'}**`,
        `${E.dot} رسالة الترقية: **${MODES[c.announce]}**${c.announce === 'channel' ? ` <#${c.announceChannelId}>` : ''}`,
        `${E.dot} XP الكتابة: ${c.textMin}–${c.textMax} كل ${c.cooldown} ثانية · الفويس: ${c.voicePerMin} بالدقيقة`,
        `${E.dot} الصدى: **${c.echo.enabled ? 'شغال' : 'متوقف'}** (رد +${c.echo.reply} · تفاعل +${c.echo.reaction} · حد يومي ${c.echo.dailyCap})`,
        `${E.dot} رتب المكافآت: ${c.rewards.length}`,
        ui.hint('باقي الإعدادات (القنوات والرتب المستثناة، الرسالة، الصدى) من الداشبورد ← المستويات.'),
      ].join('\n')
    );
  },
};
