const E = require('../../utils/emojis');

module.exports = {
  name: 'leave',
  description: 'خروج البوت من سيرفر',
  ownerOnly: true,
  prefixOnly: true,
  dmAllowed: true,
  options: [{ name: 'server_id', type: 'string', description: 'آيدي السيرفر', required: true }],
  async run(ctx) {
    const g = ctx.client.guilds.cache.get(ctx.get('server_id'));
    if (!g) return ctx.fail('السيرفر غير موجود.');
    await g.leave();
    return ctx.ok(`تم الخروج من **${g.name}**.`);
  },
};
