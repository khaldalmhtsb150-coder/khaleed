const ui = require('../../utils/ui');
const E = require('../../utils/emojis');

module.exports = {
  name: 'ping',
  aliases: ['بنق'],
  description: 'عرض سرعة استجابة البوت',
  async run(ctx) {
    const start = Date.now();
    const msg = await ctx.reply(`${E.loading} جاري القياس...`);
    const api = Date.now() - start;
    const content = `${E.timer} الاستجابة: **${api}ms** ${E.dot} البوابة: **${Math.round(ctx.client.ws.ping)}ms**`;
    if (ctx.isSlash) return ctx.interaction.editReply(content);
    return msg.edit(content);
  },
};
