const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const drop = require('../../systems/drop');
const { parseDuration } = require('../../utils/time');

module.exports = {
  name: 'box',
  aliases: ['بوكس', 'drop', 'دروب'],
  description: 'نزّل بوكس: أول واحد يكبس الزر بيفوز',
  perms: ['ManageGuild'],
  options: [
    { name: 'prize', type: 'string', description: 'الجائزة', label: 'الجائزة', required: true, rest: true },
    { name: 'channel', type: 'channel', description: 'القناة (اختياري)', channelTypes: [0, 5] },
    { name: 'wait', type: 'string', description: 'وقت قبل ما ينفتح الزر مثل 10s أو 1m (اختياري)' },
  ],
  async run(ctx) {
    const channel = ctx.get('channel') || ctx.channel;
    let waitMs = 0;
    const w = ctx.get('wait');
    if (w) {
      waitMs = parseDuration(w);
      if (!waitMs || waitMs > 10 * 60_000) return ctx.fail('وقت الانتظار لازم يكون بين 1s و 10m، مثل 10s أو 1m.');
    }
    const msg = await drop.start(channel, {
      prize: String(ctx.get('prize')).slice(0, 200),
      hostId: ctx.user.id,
      hostName: ctx.member?.displayName || ctx.user.username,
      waitMs,
    });
    return ctx.ok(`نزل البوكس في ${channel}.\n${ui.hint(`آيدي الرسالة: ${msg.id}`)}`, { ephemeral: true });
  },
};
