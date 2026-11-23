const E = require('../../utils/emojis');
const store = require('../../utils/store');
const { applyPresence } = require('../../utils/presence');

module.exports = {
  name: 'setstatus',
  description: 'تغيير حالة البوت',
  ownerOnly: true,
  prefixOnly: true,
  dmAllowed: true,
  options: [{ name: 'text', type: 'string', description: 'نص الحالة', required: true, rest: true }],
  async run(ctx) {
    store.get('botSettings').status = ctx.get('text').slice(0, 120);
    store.save('botSettings');
    applyPresence(ctx.client);
    return ctx.reply(`${E.success} تم تحديث الحالة.`);
  },
};
