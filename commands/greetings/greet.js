const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'greet',
  aliases: ['ترحيب-نصي'],
  description: 'تفعيل أو تعطيل رسالة الترحيب النصية',
  perms: ['ManageGuild'],
  options: [{ name: 'state', type: 'boolean', description: 'تفعيل أو تعطيل', label: 'on/off', required: true }],
  async run(ctx) {
    const conf = store.guild('greetings', ctx.guild.id, { enabled: false, channelId: null, message: 'أهلاً {user} في **{server}**', duration: 0 });
    conf.enabled = ctx.get('state');
    store.save('greetings');
    return ctx.reply(conf.enabled ? `${E.success} تم تفعيل الترحيب.` : '• تم تعطيل الترحيب.');
  },
};
