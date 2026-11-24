const { ActionRowBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/ui');
const games = require('../../systems/games');
const { canManageGuild } = require('../../utils/perms');

module.exports = {
  name: 'games',
  aliases: ['الالعاب', 'نقاطي', 'متجر'],
  description: 'ترتيب الألعاب، نقاطك، متجر الميزات، أو إيقاف لعبة',
  cooldown: 3,
  options: [
    {
      name: 'action',
      type: 'string',
      description: 'شو بدك؟',
      choices: [
        { name: '🏆 الترتيب (كل الوقت)', value: 'top' },
        { name: '📅 ترتيب الشهر', value: 'month' },
        { name: '👤 إحصائياتي', value: 'me' },
        { name: '🛒 متجر الميزات', value: 'shop' },
        { name: '⛔ إيقاف اللعبة بهالروم', value: 'stop' },
      ],
    },
  ],
  async run(ctx) {
    const action = ctx.get('action') || 'me';
    const gid = ctx.guild.id;
    if (action === 'stop') {
      if (!canManageGuild(ctx.member)) return ctx.fail('بس الإدارة بتقدر توقف اللعبة.');
      return games.stopIn(ctx.channel.id) ? ctx.reply('⛔ وقفت اللعبة بهالروم.') : ctx.fail('ما في لعبة شغالة بهالروم.');
    }
    if (action === 'top' || action === 'month') {
      const list = games.top(gid, { month: action === 'month' });
      const medals = ['🥇', '🥈', '🥉'];
      return ctx.reply({
        embeds: [
          games.embed().setDescription(
            [`## 🏆 ${action === 'month' ? 'أبطال الشهر' : 'أبطال الألعاب'}`, '', list.length ? list.map(([u, v], i) => `${medals[i] || `\`${i + 1}\``} <@${u}> — **${v}** ${action === 'month' ? 'نقطة' : 'فوز'}`).join('\n') : 'لسا ما حدا لعب. ابدأ بـ /play 🎮', '', ui.hint(action === 'month' ? 'أول واحد بآخر الشهر بياخد رتبة البطل (إذا الإدارة حددتها)' : 'الفوز = 10 نقاط • المشاركة = نقطتين')].join('\n')
          ),
        ],
        allowedMentions: { parse: [] },
      });
    }
    const s = games.statOf(gid, ctx.user.id);
    const p = games.perksOf(gid, ctx.user.id);
    const perksLine = Object.entries(games.PERKS).map(([k, d]) => `${d.emoji} ${d.name}: **${p[k] || 0}**`).join(' • ');
    if (action === 'shop') {
      const row = new ActionRowBuilder().addComponents(...Object.entries(games.PERKS).map(([k, d]) => ui.button(`gshop:${k}`, `${d.emoji} ${d.name} (${d.cost})`, { style: ButtonStyle.Primary })));
      return ctx.reply(
        {
          embeds: [games.embed().setDescription(['## 🛒 متجر الميزات', `نقاطك: **${s.points}**`, '', ...Object.values(games.PERKS).map((d) => `${d.emoji} **${d.name}** — ${d.cost} نقطة\n${ui.hint(d.desc)}`), '', `عندك: ${perksLine}`, ui.hint('النقاط بتنكسب من اللعب بس، وما في أي مراهنات.')].join('\n'))],
          components: [row],
        },
        { ephemeral: true }
      );
    }
    const fav = Object.entries(s.byGame).sort((a, b) => b[1].w - a[1].w)[0];
    return ctx.reply(
      {
        embeds: [
          games.embed().setDescription(
            [`## 👤 إحصائياتك بالألعاب`, `🏆 فوز: **${s.wins}** • 🎮 لعبت: **${s.played}**`, `⭐ نقاطك: **${s.points}** • 📅 هالشهر: **${s.mpoints}**`, fav ? `💛 أكثر لعبة بتفوز فيها: **${games.TYPES.get(fav[0])?.name || fav[0]}** (${fav[1].w})` : '', '', `🎒 ${perksLine}`].filter(Boolean).join('\n')
          ),
        ],
      },
      { ephemeral: true }
    );
  },
  components: [
    {
      prefix: 'gshop:',
      handle: async (i) => {
        const perk = i.customId.split(':')[1];
        try {
          const p = games.buyPerk(i.guildId, i.user.id, perk);
          const d = games.PERKS[perk];
          return i.reply({ content: `✅ اشتريت ${d.emoji} **${d.name}**! صار معك ${p[perk]}. نقاطك: ${games.statOf(i.guildId, i.user.id).points}`, ephemeral: true });
        } catch (e) {
          return i.reply({ content: `• ${e.message}`, ephemeral: true });
        }
      },
    },
  ],
};
