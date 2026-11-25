const E = require('../../utils/emojis');
const art = require('../../utils/art');
const guard = require('../../systems/guard');

module.exports = {
  name: 'lockdown',
  aliases: ['قفل-السيرفر', 'لوك-داون'],
  description: 'قفل كل رومات السيرفر أو فتحها (بترجع زي ما كانت بالضبط)',
  perms: ['ManageGuild'],
  botPerms: ['ManageChannels', 'ManageRoles'],
  cooldown: 10,
  options: [
    { name: 'action', type: 'string', description: 'شو بدك؟', required: true, choices: [{ name: 'قفل السيرفر', value: 'on' }, { name: 'فتح السيرفر', value: 'off' }] },
    { name: 'reason', type: 'string', description: 'السبب', rest: true },
  ],
  async run(ctx) {
    const on = ctx.get('action') === 'on';
    await ctx.defer();
    const n = await guard.lockdown(ctx.guild, on, `${ctx.user.tag}: ${ctx.get('reason') || 'Lockdown'}`);
    return ctx.reply(on ? `${art.i('lock', '🔒')} انقفل السيرفر: **${n}** قناة\n-# لما تفتحه بترجع كل قناة زي ما كانت` : `${art.i('unlock', '🔓')} انفتح السيرفر: **${n}** قناة رجعت زي ما كانت`);
  },
};
