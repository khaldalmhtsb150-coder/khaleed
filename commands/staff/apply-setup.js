const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const apply = require('../../systems/apply');

module.exports = {
  name: 'apply-setup',
  aliases: ['تقديم', 'التقديم'],
  description: 'تقديم الإدارة: نشر اللوحة، منصب جاهز، فتح وإغلاق، والإحصائيات',
  perms: ['ManageGuild'],
  botPerms: ['ManageRoles', 'CreatePrivateThreads'],
  cooldown: 5,
  options: [
    {
      name: 'action',
      type: 'string',
      description: 'شو بدك؟',
      required: true,
      choices: [
        { name: 'نشر لوحة التقديم', value: 'panel' },
        { name: 'إضافة منصب إداري جاهز', value: 'template' },
        { name: 'فتح التقديم', value: 'open' },
        { name: 'إغلاق التقديم', value: 'close' },
        { name: 'الإحصائيات', value: 'stats' },
      ],
    },
    { name: 'channel', type: 'channel', description: 'روم اللوحة (أو روم المراجعة مع "إضافة منصب")', channelTypes: [0, 5] },
    { name: 'review', type: 'channel', description: 'روم الإدارة اللي بتوصله التقديمات', channelTypes: [0, 5] },
  ],
  async run(ctx) {
    const g = ctx.guild;
    const action = ctx.get('action');
    const conf = store.guild('applyConfig', g.id, { ...apply.DEFAULT });
    const review = ctx.get('review');
    if (review) conf.reviewChannelId = review.id;

    if (action === 'template') {
      try {
        const p = apply.addTemplate(g);
        conf.enabled = true;
        store.save('applyConfig');
        return ctx.reply(
          [
            `${E.success} أضفت منصب **${p.name}** بـ ${p.questions.length} أسئلة وشروط جاهزة (التاق، الرابط بالبايو، عمر الحساب 30 يوم، أسبوع بالسيرفر، بدون تحذيرات).`,
            p.roles.length ? `${E.dot} الرتبة عند القبول: <@&${p.roles[0]}>` : `${E.warning} ما حددت رتبة للقبول — حددها من الداشبورد.`,
            conf.reviewChannelId ? `${E.dot} التقديمات بتوصل: <#${conf.reviewChannelId}>` : `${E.warning} حدد روم المراجعة: \`/apply-setup action:نشر لوحة التقديم review:#روم\``,
            ui.hint('عدّل الأسئلة والشروط والمهام من الداشبورد ← تقديم الإدارة.'),
          ].join('\n'),
          { ephemeral: true }
        );
      } catch (e) {
        return ctx.fail(e.message);
      }
    }
    if (action === 'panel') {
      const ch = ctx.get('channel') || ctx.channel;
      if (!apply.config(g.id).positions.length) apply.addTemplate(g);
      if (!conf.reviewChannelId) return ctx.fail('حدد روم الإدارة اللي بتوصله التقديمات بخانة review.');
      conf.enabled = true;
      store.save('applyConfig');
      await ctx.defer(true);
      try {
        await apply.publish(g, ch);
        return ctx.reply(`${E.success} نزلت لوحة التقديم بـ ${ch}. التقديمات بتوصل <#${conf.reviewChannelId}>.`);
      } catch (e) {
        return ctx.fail(`ما قدرت أنشر: ${e.message}`);
      }
    }
    if (action === 'open' || action === 'close') {
      conf.enabled = action === 'open';
      store.save('applyConfig');
      await apply.refreshPanel(g);
      return ctx.reply(`${E.success} ${conf.enabled ? 'فتحت' : 'سكّرت'} التقديم.`);
    }
    if (action === 'stats') {
      const s = apply.stats(g.id);
      return ctx.reply({
        embeds: [
          ui.embed().setDescription(
            [
              '### إحصائيات التقديم',
              `${E.dot} كل التقديمات: **${s.total}** • مفتوحة: **${s.open}**`,
              `${E.dot} مقبول: **${s.accepted}**${s.auto ? ` (منهم ${s.auto} تلقائي)` : ''} • مرفوض: **${s.rejected}**`,
              s.avgHours ? `${E.dot} متوسط وقت الرد: **${s.avgHours}** ساعة` : null,
            ]
              .filter(Boolean)
              .join('\n')
          ),
        ],
      });
    }
  },
};
