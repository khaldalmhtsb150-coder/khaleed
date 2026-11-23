const E = require('../../utils/emojis');

module.exports = {
  name: 'setname',
  description: 'تغيير اسم البوت',
  ownerOnly: true,
  prefixOnly: true,
  dmAllowed: true,
  options: [{ name: 'name', type: 'string', description: 'الاسم الجديد', required: true, rest: true }],
  async run(ctx) {
    const ok = await ctx.client.user.setUsername(ctx.get('name').slice(0, 32)).then(() => true).catch((e) => e.message);
    return ok === true ? ctx.reply(`${E.success} تم تغيير الاسم.`) : ctx.fail(`تعذر تغيير الاسم: ${ok}`);
  },
};
