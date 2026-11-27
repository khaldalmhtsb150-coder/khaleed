const E = require('../../utils/emojis');

module.exports = {
  name: 'setavatar',
  description: 'تغيير صورة البوت (رابط أو مرفق)',
  ownerOnly: true,
  prefixOnly: true,
  dmAllowed: true,
  options: [{ name: 'url', type: 'string', description: 'رابط الصورة' }],
  async run(ctx) {
    const url = ctx.get('url') || ctx.message?.attachments.first()?.url;
    if (!url) return ctx.fail('أرفق صورة أو ضع رابطاً.');
    const ok = await ctx.client.user.setAvatar(url).then(() => true).catch((e) => e.message);
    return ok === true ? ctx.ok(`تم تغيير الصورة.`) : ctx.fail(`تعذر التغيير: ${ok}`);
  },
};
