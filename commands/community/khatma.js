const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const khatma = require('../../systems/khatma');
const { canManageGuild } = require('../../utils/perms');

module.exports = {
  name: 'khatma',
  aliases: ['ختمة', 'ختمه'],
  description: 'الختمة الجماعية: 30 جزء، كل عضو بيحجز جزء ويقرأه، وبنختم القرآن سوا',
  cooldown: 5,
  options: [
    { name: 'action', type: 'string', description: 'شو بدك؟', choices: [{ name: 'وين وصلنا', value: 'status' }, { name: 'ابدأ ختمة جديدة', value: 'start' }, { name: 'إنهاء الختمة الحالية', value: 'end' }, { name: 'الإعدادات', value: 'settings' }] },
    { name: 'dedication', type: 'string', description: 'إهداء الختمة، مثل: على روح المرحوم فلان' },
    { name: 'channel', type: 'channel', description: 'روم الختمة', channelTypes: [0] },
    { name: 'max', type: 'integer', description: 'أقصى عدد أجزاء محجوزة للعضو بنفس الوقت', min: 1, max: 10 },
    { name: 'hours', type: 'integer', description: 'بعد كم ساعة الجزء المحجوز بينفك لحاله', min: 6, max: 336 },
    { name: 'role', type: 'role', description: 'رتبة بتنمنشن لما تبدأ ختمة' },
  ],
  async run(ctx) {
    const action = ctx.get('action') || 'status';
    const d = khatma.data(ctx.guild.id);
    if (action !== 'status' && !canManageGuild(ctx.member)) return ctx.fail('هاد للإدارة بس.');
    if (action === 'settings') {
      const conf = store.guild('khatmaConfig', ctx.guild.id, { ...khatma.DEFAULT });
      if (ctx.get('max')) conf.maxPerUser = Number(ctx.get('max'));
      if (ctx.get('hours')) conf.holdHours = Number(ctx.get('hours'));
      if (ctx.get('role')) conf.roleId = ctx.get('role').id;
      if (ctx.get('channel')) conf.channelId = ctx.get('channel').id;
      store.save('khatmaConfig');
      if (d.active) await khatma.refresh(ctx.guild);
      return ctx.reply({ content: `${E.success} كل عضو بيحجز لحد **${conf.maxPerUser}** أجزاء، والجزء بينفك بعد **${conf.holdHours}** ساعة.${conf.roleId ? ` المنشن: <@&${conf.roleId}>` : ''}`, allowedMentions: { parse: [] } });
    }
    if (action === 'start') {
      const conf = khatma.config(ctx.guild.id);
      const ch = ctx.get('channel') || ctx.guild.channels.cache.get(conf.channelId) || ctx.channel;
      try {
        await khatma.start(ctx.guild, ch, ctx.user, { dedication: ctx.get('dedication') || '' });
      } catch (e) {
        return ctx.fail(e.message);
      }
      return ctx.reply(`${E.success} بلشت الختمة بـ ${ch} 📖`, { ephemeral: true });
    }
    if (action === 'end') {
      if (!d.active) return ctx.fail('ما في ختمة شغالة.');
      await khatma.finish(ctx.guild, { cancelled: true });
      return ctx.reply(`${E.success} أنهيت الختمة الحالية بدون ما تنحسب.`);
    }
    if (!d.active) {
      return ctx.reply(
        [`📖 ما في ختمة شغالة هلأ.`, `${E.dot} ختمنا لحد هلأ: **${d.completed}** ختمة.`, ui.hint('الإدارة بتبدأ ختمة بـ /khatma action:ابدأ ختمة جديدة')].join('\n')
      );
    }
    const done = Object.values(d.active.juz).filter((j) => j.done).length;
    return ctx.reply(`📖 الختمة واصلة **${done}/30** جزء. اللوحة: https://discord.com/channels/${ctx.guild.id}/${d.active.channelId}/${d.active.messageId}`);
  },
};
