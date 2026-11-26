const { ActionRowBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/ui');
const art = require('../../utils/art');
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
        { name: 'الترتيب', value: 'top' },
        { name: 'ترتيب الشهر', value: 'month' },
        { name: 'كأس ماركا (بطولة السيرفرات)', value: 'cup' },
        { name: 'إحصائياتي', value: 'me' },
        { name: 'متجر الميزات', value: 'shop' },
        { name: 'إيقاف اللعبة بهالروم', value: 'stop' },
      ],
    },
  ],
  async run(ctx) {
    const action = ctx.get('action') || 'me';
    const gid = ctx.guild.id;
    if (action === 'cup') return ctx.reply(require('../../systems/growth').cupPayload(gid));
    if (action === 'stop') {
      if (!canManageGuild(ctx.member)) return ctx.fail('بس الإدارة بتقدر توقف اللعبة.');
      return games.stopIn(ctx.channel.id) ? ctx.reply('⛔ وقفت اللعبة بهالروم.') : ctx.fail('ما في لعبة شغالة بهالروم.');
    }
    const pe = (k) => art.i(k, games.PERKS[k].emoji);
    if (action === 'top' || action === 'month') {
      const list = games.top(gid, { month: action === 'month' });
      const medals = ['🥇', '🥈', '🥉'];
      const e = ui
        .embed()
        .setColor(art.accentInt('top'))
        .setDescription(
          [
            `### ${action === 'month' ? 'أبطال الشهر' : 'أبطال الألعاب'}`,
            list.length ? list.map(([u, v], i) => `${medals[i] || `\`${String(i + 1).padStart(2, '0')}\``}  <@${u}>  ·  **${v}** ${action === 'month' ? 'نقطة' : 'فوز'}`).join('\n') : 'لسا ما حدا لعب. ابدأ بـ `/play`',
            `-# ${action === 'month' ? 'الأول بآخر الشهر بياخد رتبة البطل' : 'الفوز 10 نقاط • المشاركة نقطتين'}`,
          ].join('\n')
        )
        .setImage('attachment://top.jpg');
      const b = art.banner('top');
      return ctx.reply({ embeds: [e], files: b ? [b] : [], allowedMentions: { parse: [] } });
    }
    const s = games.statOf(gid, ctx.user.id);
    const p = games.perksOf(gid, ctx.user.id);
    const perksLine = Object.entries(games.PERKS).map(([k, d]) => `${pe(k)} ${d.name} **${p[k] || 0}**`).join('   ');
    if (action === 'shop') {
      const row = new ActionRowBuilder().addComponents(...Object.entries(games.PERKS).map(([k, d]) => ui.button(`gshop:${k}`, `${d.name} · ${d.cost}`, { emoji: k, style: ButtonStyle.Secondary })));
      const e = ui
        .embed()
        .setColor(art.accentInt('shop'))
        .setDescription([`### متجر الميزات`, `نقاطك: **${s.points}**`, '', ...Object.entries(games.PERKS).map(([k, d]) => `${pe(k)} **${d.name}** · ${d.cost} نقطة\n-# ${d.desc}`), '', `معك: ${perksLine}`].join('\n'))
        .setImage('attachment://shop.jpg');
      const b = art.banner('shop');
      return ctx.reply({ embeds: [e], files: b ? [b] : [], components: [row] }, { ephemeral: true });
    }
    const fav = Object.entries(s.byGame).sort((a, b) => b[1].w - a[1].w)[0];
    return ctx.reply(
      {
        embeds: [
          ui
            .embed()
            .setColor(art.accentInt('top'))
            .setAuthor({ name: ctx.member?.displayName || ctx.user.username, iconURL: ctx.user.displayAvatarURL?.() })
            .addFields(
              { name: 'فوز', value: `**${s.wins}**`, inline: true },
              { name: 'لعبت', value: `**${s.played}**`, inline: true },
              { name: 'النقاط', value: `**${s.points}**`, inline: true },
              { name: 'هالشهر', value: `**${s.mpoints}**`, inline: true },
              { name: 'لعبتك', value: fav ? games.TYPES.get(fav[0])?.name || fav[0] : '—', inline: true },
              { name: 'الميزات', value: perksLine, inline: false }
            ),
        ],
      },
      { ephemeral: true }
    );
  },  components: [
    {
      prefix: 'gshop:',
      handle: async (i) => {
        const perk = i.customId.split(':')[1];
        try {
          const p = games.buyPerk(i.guildId, i.user.id, perk);
          const d = games.PERKS[perk];
          return i.reply({ content: `${art.i('check', '✅')} اشتريت **${d.name}** · صار معك ${p[perk]}\n-# نقاطك: ${games.statOf(i.guildId, i.user.id).points}`, ephemeral: true });
        } catch (e) {
          return i.reply({ content: `• ${e.message}`, ephemeral: true });
        }
      },
    },
  ],
};
