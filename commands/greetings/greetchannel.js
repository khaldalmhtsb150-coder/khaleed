const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const store = require('../../utils/store');
const welcome = require('../../systems/welcome');

module.exports = {
  name: 'greetchannel',
  aliases: ['قنوات-الترحيب'],
  description: 'قنوات الترحيب النصي: إضافة، حذف، أو عرض (حتى 10 قنوات)',
  perms: ['ManageGuild'],
  options: [
    {
      name: 'action',
      type: 'string',
      description: 'العملية',
      required: true,
      choices: [
        { name: 'إضافة', value: 'add' },
        { name: 'حذف', value: 'remove' },
        { name: 'عرض', value: 'list' },
      ],
    },
    { name: 'channel', type: 'channel', description: 'القناة', channelTypes: [0, 5] },
  ],
  async run(ctx) {
    const conf = store.guild('greetings', ctx.guild.id, { enabled: false, message: 'أهلاً {user} في **{server}**', duration: 0 });
    let ids = welcome.greetChannels(conf);
    const action = ctx.get('action');
    const ch = ctx.get('channel');

    if (action !== 'list') {
      if (!ch) return ctx.fail('حدد القناة.');
      if (action === 'add') {
        if (ids.includes(ch.id)) return ctx.fail(`${ch} مضافة أصلاً.`);
        if (ids.length >= 10) return ctx.fail('وصلت للحد (10 قنوات).');
        ids.push(ch.id);
      } else {
        if (!ids.includes(ch.id)) return ctx.fail(`${ch} مش من قنوات الترحيب.`);
        ids = ids.filter((id) => id !== ch.id);
      }
      conf.channelIds = ids;
      conf.channelId = ids[0] || '';
      store.save('greetings');
    }

    const list = ids.length ? ids.map((id) => `<#${id}>`).join(' ') : 'ولا قناة';
    const head = action === 'add' ? `${E.success} تمت إضافة ${ch}.` : action === 'remove' ? `${E.success} تم حذف ${ch}.` : `### قنوات الترحيب النصي`;
    const warn = !conf.enabled ? `\n${ui.hint('الترحيب النصي متوقف — شغّله بأمر greet.')}` : !conf.message ? `\n${ui.hint('ما في رسالة — حددها بأمر setgreet.')}` : '';
    return ctx.reply(`${head}\n${E.dot} القنوات (${ids.length}/10): ${list}${warn}`);
  },
};
