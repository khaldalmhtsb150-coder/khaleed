const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const art = require('../../utils/art');

const CAT_ICON = { general: 'info', giveaway: 'gift', invites: 'dice', levels: 'star', community: 'players', adhkar: 'book', games: 'start', greetings: 'greet', channels: 'lock', moderation: 'shield', logs: 'tasks', tickets: 'ticket', config: 'repair', owner: 'crown' };
const store = require('../../utils/store');
const { isOwner } = require('../../utils/perms');

function registry() {
  return require('../../utils/commands');
}

function overview(client, guild) {
  const { CATEGORIES, commands } = registry();
  const prefix = guild ? store.get('prefixes')[guild.id] : null;
  const cats = Object.keys(CATEGORIES).filter((c) => c !== 'owner');
  const counts = cats.map((c) => `${art.i(CAT_ICON[c], E.dot)} ${CATEGORIES[c]} · **${commands.filter((x) => x.category === c).size}**`);
  // two columns read better than one long list
  const half = Math.ceil(counts.length / 2);
  const e = ui
    .embed()
    .setColor(art.accentInt('help'))
    .addFields({ name: '​', value: counts.slice(0, half).join('\n'), inline: true }, { name: '​', value: counts.slice(half).join('\n'), inline: true })
    .setDescription([`اختار القسم من القائمة تحت.`, `-# ${prefix ? `البادئة: ${prefix} · وأوامر / شغالة دائماً` : 'كل الأوامر بالسلاش /'}${process.env.DASHBOARD_URL ? ` · لوحة التحكم: ${process.env.DASHBOARD_URL}` : ''}`].join('\n'));
  if (art.hasBanner('help')) e.setImage('attachment://help.jpg');
  return e;
}

function menu(userId, selected) {
  const { CATEGORIES } = registry();
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`help_menu_${userId}`)
      .setPlaceholder('اختر قسماً')
      .addOptions(
        Object.entries(CATEGORIES)
          .filter(([key]) => key !== 'owner' || isOwner(userId))
          .map(([value, label]) => {
            const o = { label, value, default: value === selected };
            const em = art.icon(CAT_ICON[value]);
            if (em) o.emoji = em;
            return o;
          })
      )
  );
}

function categoryEmbed(category, guild) {
  const { CATEGORIES, commands } = registry();
  const prefix = guild ? store.get('prefixes')[guild.id] : null;
  const list = commands.filter((c) => c.category === category);
  const lines = list.map((c) => {
    const args = (c.options || []).map((o) => (o.required ? `<${o.label || o.name}>` : `[${o.label || o.name}]`)).join(' ');
    const names = [!c.prefixOnly ? `\`/${c.name}\`` : null, prefix && !c.slashOnly ? `\`${prefix}${[c.name, ...(c.aliases || [])].join(` | ${prefix}`)}\`` : null]
      .filter(Boolean)
      .join(' · ');
    return `${names}${args ? ` \`${args}\`` : ''}\n-# ${c.description}`;
  });
  return ui
    .embed()
    .setColor(art.accentInt('help'))
    .setDescription(ui.trim([`### ${art.i(CAT_ICON[category], '')} ${CATEGORIES[category]}`, '', lines.join('\n') || '• لا توجد أوامر.'].join('\n'), 4000));
}

module.exports = {
  name: 'help',
  aliases: ['مساعدة', 'اوامر'],
  description: 'عرض قائمة أوامر البوت',
  cooldown: 3,
  async run(ctx) {
    const b = art.banner('help');
    await ctx.reply({ embeds: [overview(ctx.client, ctx.guild)], files: b ? [b] : [], components: [menu(ctx.user.id)] });
  },
  components: [
    {
      prefix: 'help_menu_',
      handle: async (interaction) => {
        const owner = interaction.customId.slice('help_menu_'.length);
        if (owner !== interaction.user.id) return interaction.reply({ content: '• استخدم أمر المساعدة الخاص بك.', ephemeral: true });
        const cat = interaction.values[0];
        return interaction.update({ embeds: [categoryEmbed(cat, interaction.guild)], components: [menu(owner, cat)], attachments: [] });
      },
    },
  ],
};
