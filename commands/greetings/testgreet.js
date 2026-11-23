const E = require('../../utils/emojis');
const welcome = require('../../systems/welcome');

module.exports = {
  name: 'testgreet',
  aliases: ['تجربة-الترحيب'],
  description: 'تجربة رسالة الترحيب والصورة الترحيبية',
  perms: ['ManageGuild'],
  cooldown: 10,
  async run(ctx) {
    await ctx.defer(true);
    const a = await welcome.sendWelcome(ctx.member, null, { force: true }).catch(() => false);
    const b = await welcome.sendGreeting(ctx.member, { force: true }).catch(() => false);
    if (!a && !b) return ctx.fail('لم يتم إعداد الترحيب بعد.');
    return ctx.reply(`${E.success} تم إرسال التجربة.`);
  },
};
