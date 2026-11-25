const art = require('../../utils/art');
const guard = require('../../systems/guard');

module.exports = {
  name: 'panic',
  aliases: ['طوارئ'],
  description: 'وضع الطوارئ: قفل كل الرومات + أعلى تحقق + إيقاف الدعوات',
  perms: ['Administrator'],
  botPerms: ['ManageChannels', 'ManageRoles', 'ManageGuild'],
  cooldown: 15,
  options: [{ name: 'action', type: 'string', description: 'تشغيل أو إيقاف', required: true, choices: [{ name: 'تشغيل', value: 'on' }, { name: 'إيقاف', value: 'off' }] }],
  async run(ctx) {
    const on = ctx.get('action') === 'on';
    await ctx.defer();
    const n = await guard.panic(ctx.guild, on, ctx.user.id);
    return ctx.reply(on ? `${art.i('bell', '🚨')} **وضع الطوارئ اشتغل** · ${n} قناة انقفلت · التحقق أعلى مستوى · الدعوات موقفة` : `${art.i('unlock', '🔓')} **وضع الطوارئ انتهى** · كل إشي رجع زي ما كان`);
  },
};
