const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'welcome',
  aliases: ['togglewelcome'],
  description: 'تفعيل أو تعطيل نظام الترحيب المتقدم',
  perms: ['ManageGuild'],
  options: [{ name: 'state', type: 'boolean', description: 'تفعيل أو تعطيل', label: 'on/off', required: true }],
  async run(ctx) {
    const conf = store.guild('welcome', ctx.guild.id, { enabled: false });
    conf.enabled = ctx.get('state');
    store.save('welcome');
    if (conf.enabled && !conf.channelId) return ctx.reply('• تم التفعيل، لكن حدد القناة أولاً عبر setwelcome.');
    return ctx.reply(conf.enabled ? `${E.success} تم تفعيل الترحيب المتقدم.` : '• تم تعطيل الترحيب المتقدم.');
  },
};
