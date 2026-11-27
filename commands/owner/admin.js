const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'admin',
  aliases: ['addadmin', 'removeadmin', 'adminlist'],
  description: 'إدارة مشرفي البوت: admin add/remove/list <id>',
  ownerOnly: true,
  prefixOnly: true,
  dmAllowed: true,
  options: [
    { name: 'action', type: 'string', description: 'add / remove / list', choices: [{ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }] },
    { name: 'user', type: 'user', description: 'العضو' },
  ],
  async run(ctx) {
    const admins = store.get('admins');
    const alias = ctx.message?.content.match(/(addadmin|removeadmin|adminlist)/i)?.[1]?.toLowerCase();
    const action = ctx.get('action') || { addadmin: 'add', removeadmin: 'remove', adminlist: 'list' }[alias] || 'list';
    const user = ctx.get('user');
    if (action === 'list' || !user) {
      return ctx.reply({ embeds: [ui.embed().setDescription([`### ${E.crown} مشرفو البوت`, '', ...(admins.length ? admins.map((id) => `${E.dot} <@${id}> \`${id}\``) : ['• لا يوجد'])].join('\n'))] });
    }
    if (action === 'add' && !admins.includes(user.id)) admins.push(user.id);
    if (action === 'remove') {
      const i = admins.indexOf(user.id);
      if (i !== -1) admins.splice(i, 1);
    }
    store.save('admins');
    return ctx.ok(`تم ${action === 'add' ? 'إضافة' : 'إزالة'} ${user}.`);
  },
};
