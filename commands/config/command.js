const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'command',
  aliases: ['امر'],
  description: 'تفعيل أو تعطيل أمر في هذا السيرفر',
  perms: ['Administrator'],
  options: [
    { name: 'name', type: 'string', description: 'اسم الأمر', label: 'الأمر', required: true },
    { name: 'state', type: 'boolean', description: 'تفعيل أو تعطيل', label: 'on/off', required: true },
  ],
  async run(ctx) {
    const { lookup } = require('../../utils/commands');
    const cmd = lookup.get(ctx.get('name').toLowerCase().replace(/^\//, ''));
    if (!cmd || cmd.category === 'owner') return ctx.fail('أمر غير موجود.');
    if (['command', 'help', 'setprefix'].includes(cmd.name)) return ctx.fail('هالأمر ما بينطفى.');
    const all = store.get('disabledCommands');
    const list = new Set(all[ctx.guild.id] || []);
    if (ctx.get('state')) list.delete(cmd.name);
    else list.add(cmd.name);
    all[ctx.guild.id] = [...list];
    store.save('disabledCommands');
    return ctx.reply(`${E.success} تم ${ctx.get('state') ? 'تفعيل' : 'تعطيل'} الأمر \`${cmd.name}\`.`);
  },
};
