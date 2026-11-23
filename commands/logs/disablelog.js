const E = require('../../utils/emojis');
const store = require('../../utils/store');
const { LOG_TYPES } = require('../../systems/logs');

module.exports = {
  name: 'disablelog',
  aliases: ['تعطيل-سجل'],
  description: 'تعطيل نوع من السجلات',
  perms: ['ManageGuild'],
  options: [
    {
      name: 'type',
      type: 'string',
      description: 'نوع السجل',
      label: 'النوع',
      required: true,
      choices: [{ name: 'الكل', value: 'all' }, ...Object.entries(LOG_TYPES).map(([value, t]) => ({ name: t.label, value }))],
    },
  ],
  async run(ctx) {
    const type = ctx.get('type');
    const conf = store.guild('logsConfig', ctx.guild.id);
    if (type === 'all') for (const k of Object.keys(LOG_TYPES)) delete conf[k];
    else delete conf[type];
    store.save('logsConfig');
    return ctx.reply(`${E.success} تم تعطيل ${type === 'all' ? 'جميع السجلات' : `سجل ${LOG_TYPES[type].label}`}.`);
  },
};
