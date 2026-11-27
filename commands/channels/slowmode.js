const E = require('../../utils/emojis');
const { parseDuration, formatDuration } = require('../../utils/time');

module.exports = {
  name: 'slowmode',
  aliases: ['سلومود', 'بطيء'],
  description: 'تحديد السلومود بالقناة (0 = إيقاف)',
  perms: ['ManageChannels'],
  botPerms: ['ManageChannels'],
  options: [
    { name: 'time', type: 'string', description: 'مثل 5s أو 1m أو 0', label: 'المدة', required: true },
    { name: 'channel', type: 'channel', description: 'القناة (افتراضي: هاي)', channelTypes: [0, 5, 15] },
  ],
  async run(ctx) {
    const ch = ctx.get('channel') || ctx.channel;
    const raw = String(ctx.get('time')).trim();
    const ms = raw === '0' || raw === 'off' ? 0 : parseDuration(raw) ?? (/^\d+$/.test(raw) ? Number(raw) * 1000 : null);
    if (ms === null || ms > 6 * 3_600_000) return ctx.fail('المدة مش زابطة (أقصى شي 6 ساعات).');
    await ch.setRateLimitPerUser(Math.round(ms / 1000), `${ctx.user.tag}: سلومود`);
    return ctx.reply(ms ? `${E.timer} السلومود بـ ${ch} صار **${formatDuration(ms)}**` : `${E.success} شلت السلومود من ${ch}`);
  },
};
