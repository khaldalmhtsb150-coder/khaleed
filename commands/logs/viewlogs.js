const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const { LOG_TYPES } = require('../../systems/logs');

module.exports = {
  name: 'viewlogs',
  aliases: ['السجلات'],
  description: 'عرض إعدادات قنوات السجلات',
  perms: ['ManageGuild'],
  async run(ctx) {
    const conf = store.peek('logsConfig', ctx.guild.id) || {};
    const lines = Object.entries(LOG_TYPES).map(([k, t]) => `${E[t.emoji]} ${t.label}: ${conf[k] ? `<#${conf[k]}>` : '`غير مفعل`'}`);
    return ctx.reply({ embeds: [ui.embed().setDescription([`### ${E.settings} السجلات`, '', ...lines].join('\n'))] });
  },
};
