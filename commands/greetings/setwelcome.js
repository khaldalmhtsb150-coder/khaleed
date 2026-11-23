const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'setwelcome',
  aliases: ['ترحيب'],
  description: 'إعداد نظام الترحيب المتقدم (قناة ورسالة)',
  perms: ['ManageGuild'],
  options: [
    { name: 'channel', type: 'channel', description: 'قناة الترحيب', required: true, channelTypes: [0] },
    { name: 'message', type: 'string', description: 'الرسالة — {user} {server} {membercount} {inviter} {invites}', label: 'الرسالة', rest: true },
  ],
  async run(ctx) {
    const conf = store.guild('welcome', ctx.guild.id, { enabled: true, avatarX: 512, avatarY: 250, avatarRadius: 100 });
    conf.channelId = ctx.get('channel').id;
    if (ctx.get('message')) conf.message = ctx.get('message').slice(0, 1800);
    conf.enabled = true;
    store.save('welcome');
    return ctx.reply(`${E.success} تم تفعيل الترحيب في ${ctx.get('channel')}.\n${ui.hint('أضف صورة خلفية عبر welcomeimage أو من لوحة التحكم.')}`);
  },
};
