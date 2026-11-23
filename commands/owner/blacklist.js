const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'blacklist',
  description: 'حظر/فك حظر مستخدم أو سيرفر من البوت: blacklist user|server <id> أو blacklist list',
  adminOnly: true,
  prefixOnly: true,
  dmAllowed: true,
  options: [
    { name: 'type', type: 'string', description: 'user / server / list', required: true, choices: [{ name: 'user', value: 'user' }, { name: 'server', value: 'server' }, { name: 'list', value: 'list' }] },
    { name: 'id', type: 'string', description: 'الآيدي' },
  ],
  async run(ctx) {
    const bl = store.get('blacklist');
    const type = ctx.get('type');
    if (type === 'list') {
      return ctx.reply({
        embeds: [
          ui.embed().setDescription(
            [`### ${E.ban} القائمة السوداء`, '', '**المستخدمون**', bl.users.map((id) => `${E.dot} <@${id}> \`${id}\``).join('\n') || '• لا يوجد', '', '**السيرفرات**', bl.servers.map((id) => `${E.dot} \`${id}\``).join('\n') || '• لا يوجد'].join('\n')
          ),
        ],
        allowedMentions: { parse: [] },
      });
    }
    const id = (ctx.get('id') || '').match(/\d{17,21}/)?.[0];
    if (!id) return ctx.fail('أدخل آيدي صحيح.');
    const list = type === 'user' ? bl.users : bl.servers;
    const i = list.indexOf(id);
    if (i === -1) list.push(id);
    else list.splice(i, 1);
    store.save('blacklist');
    if (type === 'server' && i === -1) ctx.client.guilds.cache.get(id)?.leave().catch(() => {});
    return ctx.reply(`${E.success} ${i === -1 ? 'تمت الإضافة إلى' : 'تمت الإزالة من'} القائمة السوداء: \`${id}\``);
  },
};
