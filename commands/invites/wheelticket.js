const store = require('../../utils/store');

module.exports = {
  name: 'wheelticket',
  aliases: ['عجلة', 'wheel'],
  description: 'معرفة مكان لوحة عجلة الحظ',
  async run(ctx) {
    const panel = store.peek('wheelConfig', ctx.guild.id)?.panelChannelId;
    if (!panel) return ctx.fail('عجلة الحظ غير مُعدة بعد. على الإدارة استخدام /wheel-setup');
    return ctx.reply({ content: `• افتح تذكرة العجلة من اللوحة في <#${panel}>` }, { ephemeral: true });
  },
};
