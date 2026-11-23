const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'greetduration',
  aliases: ['مدة-الترحيب'],
  description: 'مدة بقاء رسالة الترحيب بالثواني (0 = دائمة)',
  perms: ['ManageGuild'],
  options: [{ name: 'seconds', type: 'integer', description: 'عدد الثواني', label: 'ثواني', required: true, min: 0, max: 3600 }],
  async run(ctx) {
    const conf = store.guild('greetings', ctx.guild.id, { enabled: false });
    conf.duration = ctx.get('seconds');
    store.save('greetings');
    return ctx.reply(`${E.timer} ${conf.duration ? `ستحذف رسالة الترحيب بعد **${conf.duration}** ثانية.` : 'رسالة الترحيب ستبقى دائمة.'}`);
  },
};
