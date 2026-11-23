const adhkar = require('../../systems/adhkar');

module.exports = {
  name: 'masa',
  aliases: ['مساء', 'اذكار-المساء'],
  description: 'أذكار المساء مع عدّاد',
  cooldown: 3,
  async run(ctx) {
    return ctx.reply(adhkar.page(ctx.user.id, 'masa', 0), { ephemeral: true });
  },
};
