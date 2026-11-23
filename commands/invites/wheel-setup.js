const { ChannelType } = require('discord.js');
const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const wheel = require('../../systems/wheel');

module.exports = {
  name: 'wheel-setup',
  aliases: ['اعداد-العجلة'],
  description: 'إعداد عجلة الحظ: قناة اللوحة وتصنيف التذاكر وقناة إعلان الجوائز',
  perms: ['ManageGuild'],
  botPerms: ['ManageChannels', 'ManageRoles'],
  options: [
    { name: 'panel', type: 'channel', description: 'القناة التي تنزل فيها لوحة العجلة', required: true, channelTypes: [ChannelType.GuildText] },
    { name: 'category', type: 'channel', description: 'تصنيف تذاكر العجلة', required: true, channelTypes: [ChannelType.GuildCategory] },
    { name: 'results', type: 'channel', description: 'القناة التي يُعلن فيها الفائز وجائزته', required: true, channelTypes: [ChannelType.GuildText] },
  ],
  async run(ctx) {
    const conf = wheel.config(ctx.guild.id);
    conf.panelChannelId = ctx.get('panel').id;
    conf.categoryId = ctx.get('category').id;
    conf.resultsChannelId = ctx.get('results').id;
    store.save('wheelConfig');

    await ctx.get('panel').send(wheel.buildPanel(ctx.guild));

    return ctx.reply({
      content: [
        `${E.success} تم إعداد عجلة الحظ.`,
        `${E.dot} اللوحة: ${ctx.get('panel')}`,
        `${E.dot} التذاكر: ${ctx.get('category')}`,
        `${E.dot} إعلان الجوائز: ${ctx.get('results')}`,
        ui.hint('أضف الجوائز عبر /addreward'),
      ].join('\n'),
      allowedMentions: { parse: [] },
    });
  },
};
