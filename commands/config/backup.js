const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const backup = require('../../systems/backup');

module.exports = {
  name: 'backup',
  aliases: ['نسخة', 'باكاب', 'اصلاح'],
  description: 'نسخة احتياطية للسيرفر (رتب ورومات وصلاحيات) وإصلاح ذكي بعد التخريب',
  perms: ['Administrator'],
  botPerms: ['ManageChannels', 'ManageRoles'],
  cooldown: 10,
  options: [
    { name: 'action', type: 'string', description: 'شو بدك؟', required: true, choices: [{ name: 'نسخة هسا', value: 'create' }, { name: 'النسخ الموجودة', value: 'list' }, { name: 'إصلاح السيرفر', value: 'repair' }, { name: 'تشغيل النسخ اليومي', value: 'auto-on' }, { name: 'إيقاف النسخ اليومي', value: 'auto-off' }] },
    { name: 'number', type: 'integer', description: 'رقم النسخة من القائمة (1 = الأحدث)', min: 1, max: 7 },
  ],
  async run(ctx) {
    const action = ctx.get('action');
    const conf = store.guild('backupConfig', ctx.guild.id, { ...backup.DEFAULT });
    if (action === 'auto-on' || action === 'auto-off') {
      conf.auto = action === 'auto-on';
      store.save('backupConfig');
      return ctx.reply(`${E.success} النسخ اليومي ${conf.auto ? 'شغال' : 'موقف'}.`);
    }
    if (action === 'create') {
      const { snap } = backup.take(ctx.guild);
      return ctx.reply(`${E.success} انحفظت نسخة: **${snap.roles.length}** رتبة و **${snap.channels.length}** روم مع صلاحياتها. البوت بيحتفظ بآخر **${backup.keep(ctx.guild.id)}** نسخ.`);
    }
    const snaps = backup.list(ctx.guild.id);
    if (!snaps.length) return ctx.fail('ما في نسخ لسا. اختار "نسخة هسا".');
    if (action === 'list') {
      return ctx.reply({
        embeds: [
          ui
            .embed()
            .setDescription(
              [
                '### 🗂️ النسخ الاحتياطية',
                ...snaps.map((s, i) => `\`${i + 1}\` <t:${Math.round(s.at / 1000)}:f> — ${s.roles.length} رتبة • ${s.channels.length} روم`),
                '',
                ui.hint(`النسخ اليومي ${conf.auto ? 'شغال ✅' : 'موقف ⛔'}. الإصلاح: /backup action:إصلاح السيرفر number:1`),
              ].join('\n')
            ),
        ],
      });
    }
    const idx = Math.min(snaps.length, ctx.get('number') || 1) - 1;
    return ctx.reply(backup.previewPayload(ctx.guild, idx));
  },
};
