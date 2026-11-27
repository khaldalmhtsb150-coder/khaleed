const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const welcome = require('../../systems/welcome');

module.exports = {
  name: 'setgreet',
  aliases: ['تعيين-الترحيب'],
  description: 'رسالة الترحيب النصية وإضافة قناة لها (بتقدر تضيف حتى 10 قنوات)',
  perms: ['ManageGuild'],
  options: [
    { name: 'channel', type: 'channel', description: 'القناة', required: true, channelTypes: [0] },
    { name: 'message', type: 'string', description: 'الرسالة — {user} {username} {server} {membercount}', label: 'الرسالة', required: true, rest: true },
  ],
  async run(ctx) {
    const conf = store.guild('greetings', ctx.guild.id, { enabled: true, duration: 0 });
    const ids = welcome.greetChannels(conf);
    const ch = ctx.get('channel');
    if (!ids.includes(ch.id)) {
      if (ids.length >= 10) return ctx.fail('وصلت للحد (10 قنوات). شيل قناة بأمر greetchannel.');
      ids.push(ch.id);
    }
    conf.channelIds = ids;
    conf.channelId = ids[0];
    conf.message = ctx.get('message').slice(0, 1800);
    conf.enabled = true;
    store.save('greetings');
    return ctx.ok(`تم حفظ رسالة الترحيب. القنوات: ${ids.map((id) => `<#${id}>`).join(' ')}\n${ui.hint('ضيف أو شيل قنوات بأمر greetchannel · جرّبها عبر testgreet')}`);
  },
};
