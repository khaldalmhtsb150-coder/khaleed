const ui = require('../../utils/ui');
const E = require('../../utils/emojis');

module.exports = {
  name: 'servers',
  description: 'عرض السيرفرات التي يتواجد فيها البوت',
  ownerOnly: true,
  prefixOnly: true,
  dmAllowed: true,
  async run(ctx) {
    const list = [...ctx.client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
    const lines = list.slice(0, 30).map((g, i) => `\`${i + 1}\` **${g.name}** — ${g.memberCount} عضو\n${ui.hint(g.id)}`);
    return ctx.reply({
      embeds: [ui.embed().setDescription([`### ${E.crown} السيرفرات (${list.length})`, '', ...lines].join('\n').slice(0, 4000))],
    });
  },
};
