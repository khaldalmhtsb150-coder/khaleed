const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const { isOwner } = require('../../utils/perms');

function registry() {
  return require('../../utils/commands');
}

function overview(client, guild) {
  const { CATEGORIES, commands } = registry();
  const prefix = guild ? store.get('prefixes')[guild.id] : null;
  const counts = Object.keys(CATEGORIES)
    .filter((c) => c !== 'owner')
    .map((c) => `${E.dot} **${CATEGORIES[c]}** — ${commands.filter((x) => x.category === c).size} أمر`)
    .join('\n');
  return ui
    .embed()
    .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
    .setDescription(
      [
        `### ${E.settings} قائمة الأوامر`,
        'اختر القسم من القائمة بالأسفل لعرض أوامره.',
        '',
        counts,
        '',
        ui.hint(prefix ? `بادئة السيرفر: ${prefix} — أوامر السلاش متاحة دائماً.` : 'البوت يعمل بأوامر السلاش /. يمكن تفعيل بادئة نصية عبر /setprefix.'),
        process.env.DASHBOARD_URL ? ui.hint(`لوحة التحكم: ${process.env.DASHBOARD_URL}`) : '',
      ].join('\n')
    );
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
          .map(([value, label]) => ({ label, value, default: value === selected }))
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
    return `${names}${args ? ` \`${args}\`` : ''}\n${ui.hint(c.description)}`;
  });
  return ui.embed().setDescription([`### ${CATEGORIES[category]}`, '', lines.join('\n') || '• لا توجد أوامر.'].join('\n'));
}

module.exports = {
  name: 'help',
  aliases: ['مساعدة', 'اوامر'],
  description: 'عرض قائمة أوامر البوت',
  cooldown: 3,
  async run(ctx) {
    await ctx.reply({ embeds: [overview(ctx.client, ctx.guild)], components: [menu(ctx.user.id)] });
  },
  components: [
    {
      prefix: 'help_menu_',
      handle: async (interaction) => {
        const owner = interaction.customId.slice('help_menu_'.length);
        if (owner !== interaction.user.id) return interaction.reply({ content: '• استخدم أمر المساعدة الخاص بك.', ephemeral: true });
        const cat = interaction.values[0];
        return interaction.update({ embeds: [categoryEmbed(cat, interaction.guild)], components: [menu(owner, cat)] });
      },
    },
  ],
};
