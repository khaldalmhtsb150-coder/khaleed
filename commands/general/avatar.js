const { ActionRowBuilder } = require('discord.js');
const ui = require('../../utils/ui');

module.exports = {
  name: 'avatar',
  aliases: ['افتار', 'صورة'],
  description: 'عرض صورة حساب عضو',
  options: [{ name: 'user', type: 'user', description: 'العضو' }],
  async run(ctx) {
    const user = ctx.get('user') || ctx.user;
    const url = user.displayAvatarURL({ size: 1024 });
    return ctx.reply({
      embeds: [ui.embed().setAuthor({ name: user.username }).setImage(url)],
      components: [new ActionRowBuilder().addComponents(ui.linkButton(url, 'فتح بالمتصفح'))],
    });
  },
};
