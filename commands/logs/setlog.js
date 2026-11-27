const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const { LOG_TYPES } = require('../../systems/logs');
const { canManageGuild } = require('../../utils/perms');

module.exports = {
  name: 'setlog',
  aliases: ['لوق', 'سجل'],
  description: 'تحديد قناة سجلات واختيار الأحداث المسجلة',
  perms: ['ManageGuild'],
  options: [{ name: 'channel', type: 'channel', description: 'قناة السجلات', required: true, channelTypes: [0] }],
  async run(ctx) {
    const ch = ctx.get('channel');
    const current = store.peek('logsConfig', ctx.guild.id) || {};
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`setlog_${ch.id}`)
      .setPlaceholder('اختر الأحداث التي تُسجل في هذه القناة')
      .setMinValues(1)
      .setMaxValues(Object.keys(LOG_TYPES).length)
      .addOptions(
        Object.entries(LOG_TYPES).map(([value, t]) => {
          const o = { label: t.label, value, default: current[value] === ch.id };
          const em = E.component(t.emoji);
          if (em) o.emoji = em;
          return o;
        })
      );
    return ctx.reply({
      content: `${E.settings} اختار الأحداث اللي بدك تنسجل بـ ${ch}:`,
      components: [new ActionRowBuilder().addComponents(menu)],
    });
  },
  components: [
    {
      prefix: 'setlog_',
      handle: async (interaction) => {
        if (!canManageGuild(interaction.member)) return interaction.reply({ content: '• لا تملك الصلاحيات الكافية.', ephemeral: true });
        const channelId = interaction.customId.slice('setlog_'.length);
        const conf = store.guild('logsConfig', interaction.guild.id);
        for (const key of Object.keys(LOG_TYPES)) if (conf[key] === channelId && !interaction.values.includes(key)) delete conf[key];
        for (const key of interaction.values) conf[key] = channelId;
        store.save('logsConfig');
        const list = interaction.values.map((v) => `${E.dot} ${LOG_TYPES[v].label}`).join('\n');
        return interaction.update({ content: `${E.success} تم حفظ السجلات في <#${channelId}>:\n${list}`, components: [] });
      },
    },
  ],
};
