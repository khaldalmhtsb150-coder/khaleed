const adhkar = require('../../systems/adhkar');

module.exports = {
  name: 'sleep-azkar',
  aliases: ['نوم', 'اذكار-النوم'],
  description: 'أذكار النوم مع عدّاد',
  cooldown: 3,
  async run(ctx) {
    return ctx.reply(adhkar.page(ctx.user.id, 'sleep', 0), { ephemeral: true });
  },
};
