const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'vanity',
  aliases: ['حماية-الرابط'],
  description: 'حماية الرابط المخصص للسيرفر من التغيير',
  perms: ['Administrator'],
  botPerms: ['ManageGuild', 'ViewAuditLog', 'BanMembers'],
  options: [
    { name: 'state', type: 'boolean', description: 'تفعيل أو تعطيل', label: 'on/off', required: true },
    {
      name: 'punishment',
      type: 'string',
      description: 'العقوبة',
      label: 'العقوبة',
      choices: [
        { name: 'حظر', value: 'ban' },
        { name: 'طرد', value: 'kick' },
        { name: 'سحب الرتب', value: 'strip' },
      ],
    },
  ],
  async run(ctx) {
    if (ctx.get('state') && !ctx.guild.vanityURLCode) return ctx.fail('هذا السيرفر لا يملك رابطاً مخصصاً.');
    const conf = store.guild('linkProtection', ctx.guild.id, { vanityProtect: false, punishment: 'ban', whitelist: [] });
    conf.vanityProtect = ctx.get('state');
    if (ctx.get('punishment')) conf.punishment = ctx.get('punishment');
    if (conf.vanityProtect) conf.savedVanity = ctx.guild.vanityURLCode;
    store.save('linkProtection');
    return ctx.reply(
      conf.vanityProtect
        ? `${E.shield} تم تفعيل حماية الرابط \`${conf.savedVanity}\`.\n${ui.hint('يجب أن تكون رتبة البوت فوق رتب الإدارة لتطبيق العقوبة.')}`
        : '• تم تعطيل حماية الرابط.'
    );
  },
};
