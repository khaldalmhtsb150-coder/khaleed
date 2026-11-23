const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');

module.exports = {
  name: 'manager-role',
  aliases: ['رتبة-الادارة'],
  description: 'تحديد رتبة إدارة البوت (تمنح صلاحية أوامر الإدارة واستلام التذاكر)',
  perms: ['Administrator'],
  options: [{ name: 'role', type: 'role', description: 'الرتبة (اتركها فارغة للإلغاء)' }],
  async run(ctx) {
    const conf = store.guild('guildSettings', ctx.guild.id);
    const role = ctx.get('role');
    conf.managerRoleId = role ? role.id : null;
    store.save('guildSettings');
    return ctx.reply({
      content: role ? `${E.success} رتبة الإدارة أصبحت ${role}.\n${ui.hint('تعمل مع الأوامر النصية والأزرار؛ لأوامر السلاش اسمح بها من إعدادات السيرفر ← التكاملات.')}` : `${E.success} تم إلغاء رتبة الإدارة.`,
      allowedMentions: { parse: [] },
    });
  },
};
