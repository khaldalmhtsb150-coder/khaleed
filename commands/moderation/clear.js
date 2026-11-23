const E = require('../../utils/emojis');

module.exports = {
  name: 'clear',
  aliases: ['مسح'],
  description: 'حذف عدد من الرسائل (1-100)',
  perms: ['ManageMessages'],
  botPerms: ['ManageMessages'],
  options: [
    { name: 'amount', type: 'integer', description: 'العدد', label: 'العدد', required: true, min: 1, max: 100 },
    { name: 'user', type: 'user', description: 'حذف رسائل عضو محدد فقط' },
  ],
  async run(ctx) {
    await ctx.defer(true);
    if (ctx.message) await ctx.message.delete().catch(() => {});
    let messages = await ctx.channel.messages.fetch({ limit: 100 });
    const user = ctx.get('user');
    if (user) messages = messages.filter((m) => m.author.id === user.id);
    const target = [...messages.values()].slice(0, ctx.get('amount'));
    const deleted = await ctx.channel.bulkDelete(target, true);
    const text = `${E.delete} تم حذف **${deleted.size}** رسالة.`;
    if (ctx.isSlash) return ctx.reply(text);
    const m = await ctx.channel.send(text);
    setTimeout(() => m.delete().catch(() => {}), 4000);
  },
};
