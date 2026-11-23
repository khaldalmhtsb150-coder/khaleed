const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const gw = require('../../systems/giveaways');
const { parseDuration } = require('../../utils/time');
const premium = require('../../utils/premium');

module.exports = {
  name: 'gstart',
  aliases: ['قيف'],
  description: 'بدء قيفاواي جديد',
  perms: ['ManageGuild'],
  options: [
    { name: 'duration', type: 'string', description: 'المدة مثل 1h أو 2d', label: 'المدة', required: true },
    { name: 'winners', type: 'integer', description: 'عدد الفائزين', label: 'الفائزين', required: true, min: 1, max: 20 },
    { name: 'prize', type: 'string', description: 'الجائزة', label: 'الجائزة', required: true, rest: true },
    { name: 'channel', type: 'channel', description: 'القناة (اختياري)', channelTypes: [0, 5] },
    { name: 'role', type: 'role', description: '👑 رتبة مطلوبة للمشاركة (بريميوم)' },
    { name: 'invites', type: 'integer', description: '👑 أقل عدد دعوات للمشاركة (بريميوم)', min: 1, max: 10000 },
  ],
  async run(ctx) {
    const ms = parseDuration(ctx.get('duration'));
    if (!ms || ms < 10_000 || ms > 30 * 86_400_000) return ctx.fail('مدة غير صالحة، استخدم صيغة مثل 30m أو 1h أو 2d.');
    const channel = ctx.get('channel') || ctx.channel;
    const role = ctx.get('role');
    const invites = ctx.get('invites');
    if ((role || invites) && !premium.has(ctx.guild.id, 'giveawayRequirements')) return ctx.fail(premium.lockedText('giveawayRequirements'));
    const msg = await gw.start(channel, {
      prize: ctx.get('prize').slice(0, 200),
      winnersCount: ctx.get('winners'),
      durationMs: ms,
      hostId: ctx.user.id,
      hostName: ctx.member?.displayName || ctx.user.username,
      hostAvatar: ctx.user.displayAvatarURL({ size: 128 }),
      requiredRoleId: role?.id || null,
      minInvites: invites || undefined,
    });
    return ctx.reply({ content: `${E.success} تم بدء القيفاواي في ${channel}.\n${ui.hint(`آيدي الرسالة: ${msg.id}`)}` }, { ephemeral: true });
  },
};
