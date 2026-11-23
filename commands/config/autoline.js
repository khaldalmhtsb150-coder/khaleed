const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'autoline',
  aliases: ['خط'],
  description: 'إضافة/إزالة قناة للخط التلقائي وتعيين رابط صورته',
  perms: ['ManageGuild'],
  options: [
    { name: 'channel', type: 'channel', description: 'القناة', required: true, channelTypes: [0] },
    { name: 'image', type: 'string', description: 'رابط صورة الخط (اختياري)', label: 'الرابط' },
  ],
  async run(ctx) {
    const conf = store.guild('autoLine', ctx.guild.id, { enabled: true, channels: [], imageUrl: '' });
    const ch = ctx.get('channel');
    const url = ctx.get('image');
    if (url) {
      if (!/^https?:\/\/\S+$/i.test(url)) return ctx.fail('رابط غير صالح.');
      conf.imageUrl = url;
    }
    const i = conf.channels.indexOf(ch.id);
    if (i === -1) conf.channels.push(ch.id);
    else if (!url) conf.channels.splice(i, 1);
    conf.enabled = conf.channels.length > 0;
    store.save('autoLine');
    if (!conf.imageUrl) return ctx.reply('• تم حفظ القناة، أضف رابط صورة الخط ليعمل النظام.');
    return ctx.reply(conf.channels.includes(ch.id) ? `${E.success} الخط التلقائي مفعل في ${ch}.` : `• تم إيقاف الخط في ${ch}.`);
  },
};
