const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'setinvitelog',
  aliases: ['لوق-الدعوات'],
  description: 'تحديد قناة سجل الدعوات (دخول وخروج)',
  perms: ['ManageGuild'],
  options: [{ name: 'channel', type: 'channel', description: 'القناة', required: true, channelTypes: [0] }],
  async run(ctx) {
    const ch = ctx.get('channel');
    store.guild('inviteConfig', ctx.guild.id).logChannelId = ch.id;
    store.save('inviteConfig');
    return ctx.ok(`تم تحديد ${ch} كسجل للدعوات.`);
  },
};
