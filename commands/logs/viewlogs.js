const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const logs = require('../../systems/logs');
const { LOG_TYPES, LOG_GROUPS } = logs;
const art = require('../../utils/art');

module.exports = {
  name: 'viewlogs',
  aliases: ['السجلات'],
  description: 'عرض إعدادات قنوات السجلات',
  perms: ['ManageGuild'],
  async run(ctx) {
    const e = ui.embed().setDescription(`### ${art.i('tasks', E.settings)} السجلات`);
    for (const [g, info] of Object.entries(LOG_GROUPS)) {
      const lines = Object.entries(LOG_TYPES)
        .filter(([, t]) => t.group === g)
        .map(([k, t]) => {
          const ch = logs.channelFor(ctx.guild, k);
          return `${art.i(t.icon, E.dot)} ${t.label}: ${ch ? `${ch}` : '`معطل`'}`;
        });
      e.addFields({ name: info.label, value: lines.join('\n') });
    }
    e.setFooter({ text: 'إنشاء تلقائي: /logs-setup • روم لنوع: /setlog' });
    return ctx.reply({ embeds: [e] });
  },
};
