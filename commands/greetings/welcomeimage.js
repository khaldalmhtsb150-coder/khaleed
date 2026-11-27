const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'welcomeimage',
  aliases: ['صورة-الترحيب'],
  description: 'تعيين خلفية الترحيب وموقع صورة العضو (1024x500)',
  perms: ['ManageGuild'],
  options: [
    { name: 'url', type: 'string', description: 'رابط الصورة (اكتب off للإزالة)', label: 'الرابط', required: true },
    { name: 'x', type: 'integer', description: 'موقع X لمركز الأفتار', min: 0, max: 1024 },
    { name: 'y', type: 'integer', description: 'موقع Y لمركز الأفتار', min: 0, max: 500 },
    { name: 'radius', type: 'integer', description: 'نصف قطر الأفتار', min: 20, max: 250 },
  ],
  async run(ctx) {
    const conf = store.guild('welcome', ctx.guild.id, { enabled: false, avatarX: 512, avatarY: 250, avatarRadius: 100 });
    const url = ctx.get('url');
    if (url.toLowerCase() === 'off') {
      conf.imageUrl = '';
      store.save('welcome');
      return ctx.reply(`${E.success} تمت إزالة صورة الترحيب.`);
    }
    if (!/^https?:\/\/\S+$/i.test(url)) return ctx.fail('الرابط مش زابط.');
    conf.imageUrl = url;
    if (ctx.get('x') !== null) conf.avatarX = ctx.get('x');
    if (ctx.get('y') !== null) conf.avatarY = ctx.get('y');
    if (ctx.get('radius') !== null) conf.avatarRadius = ctx.get('radius');
    store.save('welcome');
    return ctx.reply(`${E.success} تم حفظ صورة الترحيب.\n${ui.hint(`الأفتار: X ${conf.avatarX} · Y ${conf.avatarY} · R ${conf.avatarRadius}`)}`);
  },
};
