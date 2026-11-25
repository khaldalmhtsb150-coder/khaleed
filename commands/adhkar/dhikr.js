const adhkar = require('../../systems/adhkar');

module.exports = {
  name: 'dhikr',
  aliases: ['ذكر', 'دعاء', 'اية'],
  description: 'ذكر أو آية أو دعاء عشوائي',
  cooldown: 5,
  async run(ctx) {
    return ctx.reply(await adhkar.randomCard(ctx.guild.id));
  },
};
