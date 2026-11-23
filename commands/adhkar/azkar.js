const adhkar = require('../../systems/adhkar');
const { CATEGORIES } = require('../../utils/adhkarData');

module.exports = {
  name: 'azkar',
  aliases: ['اذكار', 'أذكار', 'الاذكار', 'الأذكار'],
  description: 'الأذكار: الصباح، المساء، النوم، بعد الصلاة وأدعية، مع عدّاد',
  cooldown: 3,
  options: [
    {
      name: 'type',
      type: 'string',
      description: 'نوع الأذكار',
      label: 'النوع',
      choices: Object.entries(CATEGORIES).map(([value, c]) => ({ name: c.name, value })),
    },
  ],
  async run(ctx) {
    const type = ctx.get('type');
    const payload = type ? adhkar.page(ctx.user.id, type, 0) : adhkar.menu(ctx.user.id);
    return ctx.reply(payload, { ephemeral: true });
  },
};
