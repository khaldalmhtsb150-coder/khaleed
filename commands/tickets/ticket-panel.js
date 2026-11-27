const { ChannelType } = require('discord.js');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const tickets = require('../../systems/tickets');

module.exports = {
  name: 'ticket-panel',
  aliases: ['panel', 'لوحة-التذاكر'],
  description: 'إرسال لوحة فتح التذاكر',
  perms: ['ManageGuild'],
  options: [
    { name: 'channel', type: 'channel', description: 'القناة (الحالية افتراضياً)', channelTypes: [ChannelType.GuildText] },
    { name: 'banner', type: 'string', description: 'رابط صورة بانر (اختياري)', label: 'البانر' },
  ],
  async run(ctx) {
    const conf = tickets.config(ctx.guild.id);
    if (!conf.categoryId) return ctx.fail('ركّب النظام أول بـ /ticket-setup.');
    const banner = ctx.get('banner');
    if (banner) {
      if (!/^https?:\/\/\S+$/i.test(banner)) return ctx.fail('رابط البانر مش زابط.');
      conf.bannerUrl = banner;
      store.save('ticketConfig');
    }
    const channel = ctx.get('channel') || ctx.channel;
    await channel.send(tickets.buildPanel(ctx.guild));
    return ctx.reply({ content: `${E.success} تم إرسال لوحة التذاكر في ${channel}.` }, { ephemeral: true });
  },
};
