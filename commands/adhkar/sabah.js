const adhkar = require('../../systems/adhkar');

module.exports = {
  name: 'sabah',
  aliases: ['صباح', 'اذكار-الصباح'],
  description: 'أذكار الصباح مع عدّاد',
  cooldown: 3,
  async run(ctx) {
    return ctx.reply(adhkar.page(ctx.user.id, 'sabah', 0), { ephemeral: true });
  },
};
