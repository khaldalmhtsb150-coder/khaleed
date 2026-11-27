const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const appeals = require('../../systems/appeals');

module.exports = {
  name: 'appeal-setup',
  aliases: ['طلبات-فك-الحظر', 'استئناف'],
  description: 'طلبات فك الحظر: المحظور بيوصله زر، بيعبي طلب، والإدارة بتقبل أو ترفض',
  perms: ['ManageGuild'],
  options: [
    { name: 'action', type: 'string', description: 'شو بدك؟', required: true, choices: [{ name: 'تشغيل', value: 'on' }, { name: 'إيقاف', value: 'off' }] },
    { name: 'channel', type: 'channel', description: 'روم الإدارة اللي بتوصل عليه الطلبات', channelTypes: [0] },
    { name: 'cooldown', type: 'integer', description: 'كم يوم يستنى بعد الرفض قبل ما يقدّم من جديد', min: 1, max: 90 },
  ],
  async run(ctx) {
    const conf = store.guild('appealsConfig', ctx.guild.id, { ...appeals.DEFAULT });
    if (ctx.get('channel')) conf.channelId = ctx.get('channel').id;
    if (ctx.get('cooldown')) conf.cooldownDays = Number(ctx.get('cooldown'));
    if (ctx.get('action') === 'off') {
      conf.enabled = false;
      store.save('appealsConfig');
      return ctx.ok(`وقفت طلبات فك الحظر.`);
    }
    if (!conf.channelId) conf.channelId = ctx.channel.id;
    conf.enabled = true;
    store.save('appealsConfig');
    return ctx.reply(
      [
        `${E.success} طلبات فك الحظر شغالة، والطلبات بتوصل على <#${conf.channelId}>.`,
        `${E.dot} بعد الرفض بيستنى **${conf.cooldownDays}** أيام قبل ما يقدّم من جديد.`,
        ui.hint('أي حظر بأمر البوت بيوصل معه زر الطلب بالخاص. الحظر اليدوي بنحاول نبعتله كمان، بس ديسكورد ما بيسمح بالخاص إلا إذا كان معنا بسيرفر ثاني.'),
      ].join('\n')
    );
  },
};
