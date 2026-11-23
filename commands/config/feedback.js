const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'feedback',
  aliases: ['اراء', 'فيدباك'],
  description: 'إضافة أو إزالة قناة آراء (تحويل الرسائل لإمبد مع تفاعلات)',
  perms: ['ManageGuild'],
  options: [{ name: 'channel', type: 'channel', description: 'القناة', required: true, channelTypes: [0] }],
  async run(ctx) {
    const conf = store.guild('feedback', ctx.guild.id, { enabled: true, channels: [], emojis: [] });
    const ch = ctx.get('channel');
    const i = conf.channels.indexOf(ch.id);
    if (i === -1) conf.channels.push(ch.id);
    else conf.channels.splice(i, 1);
    conf.enabled = conf.channels.length > 0;
    store.save('feedback');
    return ctx.reply(
      i === -1
        ? `${E.success} تم تفعيل الآراء في ${ch}.\n${ui.hint('خصص الإيموجيات من لوحة التحكم.')}`
        : `• تم إيقاف الآراء في ${ch}.`
    );
  },
};
