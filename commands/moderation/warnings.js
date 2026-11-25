const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const art = require('../../utils/art');
const warns = require('../../systems/warns');

module.exports = {
  name: 'warnings',
  aliases: ['تحذيرات', 'انذارات'],
  description: 'تحذيرات عضو: عرض، حذف تحذير، أو مسحها كلها',
  perms: ['ModerateMembers'],
  options: [
    { name: 'user', type: 'user', description: 'العضو', required: true },
    { name: 'action', type: 'string', description: 'شو بدك؟', choices: [{ name: 'عرض', value: 'list' }, { name: 'حذف تحذير', value: 'remove' }, { name: 'مسح الكل', value: 'clear' }] },
    { name: 'id', type: 'integer', description: 'رقم التحذير (للحذف)', min: 1 },
  ],
  async run(ctx) {
    const user = ctx.get('user');
    const action = ctx.get('action') || 'list';
    if (action === 'clear') {
      const n = warns.remove(ctx.guild, user.id, 'all', ctx.user.id);
      return ctx.reply({ content: n ? `${E.success} انمسحت **${n}** تحذيرات لـ ${user}` : `${E.dot} ما عنده تحذيرات.`, allowedMentions: { parse: [] } });
    }
    if (action === 'remove') {
      if (!ctx.get('id')) return ctx.fail('حط رقم التحذير.');
      const n = warns.remove(ctx.guild, user.id, ctx.get('id'), ctx.user.id);
      return n ? ctx.reply({ content: `${E.success} انحذف التحذير #${ctx.get('id')} لـ ${user}`, allowedMentions: { parse: [] } }) : ctx.fail('ما لقيت هالتحذير.');
    }
    const list = warns.list(ctx.guild.id, user.id);
    const conf = warns.config(ctx.guild.id);
    const e = ui
      .embed()
      .setAuthor({ name: user.globalName || user.username, iconURL: user.displayAvatarURL?.() })
      .setDescription(
        [
          `${art.i('bell', '⚠️')} **${list.length}** تحذير`,
          '',
          list.length ? list.slice(-15).map((w) => `\`#${w.id}\` ${ui.trim(w.reason, 120)}\n-# <@${w.by}> · <t:${Math.round(w.at / 1000)}:R>`).join('\n') : 'ما عنده ولا تحذير.',
          '',
          `-# ${conf.steps.map((s) => `${s.count} ← ${warns.ACTION_AR[s.action]}${s.action === 'timeout' ? ` ${s.minutes || 60}د` : ''}`).join(' · ')}${conf.expireDays ? ` · بتنتهي بعد ${conf.expireDays} يوم` : ''}`,
        ].join('\n')
      );
    return ctx.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
};
