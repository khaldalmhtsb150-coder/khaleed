const { ChannelType } = require('discord.js');
const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const tickets = require('../../systems/tickets');
const premium = require('../../utils/premium');

module.exports = {
  name: 'ticket-setup',
  aliases: ['اعداد-التذاكر'],
  description: 'إعداد نظام التذاكر: التصنيف والسجل ورتبة الدعم والأقسام',
  perms: ['ManageGuild'],
  botPerms: ['ManageChannels', 'ManageRoles'],
  options: [
    { name: 'category', type: 'channel', description: 'تصنيف التذاكر', required: true, channelTypes: [ChannelType.GuildCategory] },
    { name: 'logs', type: 'channel', description: 'قناة السجلات والنسخ', required: true, channelTypes: [ChannelType.GuildText] },
    { name: 'role', type: 'role', description: 'رتبة فريق الدعم', required: true },
    { name: 'max', type: 'integer', description: 'الحد الأقصى للتذاكر المفتوحة لكل عضو', min: 1, max: 5 },
    { name: 'departments', type: 'string', description: 'الأقسام مفصولة بفاصلة: الدعم الفني | وصف, المتجر', label: 'الأقسام', rest: true },
  ],
  async run(ctx) {
    const conf = tickets.config(ctx.guild.id);
    const lim = premium.limits(ctx.guild.id);
    if (ctx.get('max') > lim.ticketMaxOpen) return ctx.fail(premium.limitText('ticketMaxOpen', lim.ticketMaxOpen));
    const depts = ctx.get('departments') ? tickets.parseDepartments(ctx.get('departments')) : [];
    if (depts.length > lim.ticketDepartments) return ctx.fail(premium.limitText('ticketDepartments', lim.ticketDepartments));
    conf.categoryId = ctx.get('category').id;
    conf.logChannelId = ctx.get('logs').id;
    conf.supportRoleId = ctx.get('role').id;
    if (ctx.get('max')) conf.maxOpen = ctx.get('max');
    if (depts.length) conf.departments = depts;
    store.save('ticketConfig');
    return ctx.reply({
      embeds: [
        ui
          .embed()
          .setDescription(
            [
              `### ${E.ticket} تم إعداد نظام التذاكر`,
              `${E.dot} التصنيف: ${ctx.get('category')}`,
              `${E.dot} السجلات: ${ctx.get('logs')}`,
              `${E.dot} فريق الدعم: ${ctx.get('role')}`,
              `${E.dot} الحد لكل عضو: **${conf.maxOpen}**`,
              `${E.dot} الأقسام: ${conf.departments.map((d) => `\`${d.label}\``).join(' ')}`,
              '',
              ui.hint('أرسل لوحة التذاكر عبر /ticket-panel — ويمكنك تخصيص كل شيء من لوحة التحكم.'),
            ].join('\n')
          ),
      ],
      allowedMentions: { parse: [] },
    });
  },
};
