const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const art = require('../../utils/art');
const store = require('../../utils/store');
const premium = require('../../utils/premium');
const protection = require('../../systems/protection');

const FEATURES = {
  antiRaid: ['Anti-Raid', 'إيقاف هجمات الدخول الجماعي والحسابات الجديدة', 'antiRaid'],
  antiNuke: ['Anti-Nuke', 'معاقبة أي حدا بيخرّب بسرعة (حذف رومات ورتب، حظر جماعي…)', 'antiNuke'],
  antiBot: ['Anti-Bot', 'طرد أي بوت بيضيفه شخص مش موثوق', 'antiNuke'],
  dangerousPerms: ['الصلاحيات الخطيرة', 'سحب Administrator وصلاحيات الإدارة إذا انعطت بدون إذن', 'antiNuke'],
  serverLock: ['قفل الإعدادات', 'إرجاع اسم السيرفر وإعداداته إذا تغيرت بدون إذن', 'antiNuke'],
  antiScam: ['Anti-Scam', 'حذف روابط النيترو والستيم المزيفة', null],
  dehoist: ['Dehoist', 'شيل الرموز من أول الأسماء', null],
  impersonation: ['كشف الانتحال', 'لما حدا يقلّد اسم أو صورة إداري', 'impersonation'],
};

module.exports = {
  name: 'protection',
  aliases: ['حماية', 'الحماية'],
  description: 'لوحة الحماية: الحالة، تشغيل وإيقاف كل ميزة، والموثوقين',
  perms: ['Administrator'],
  options: [
    { name: 'action', type: 'string', description: 'شو بدك؟', choices: [{ name: 'الحالة', value: 'status' }, { name: 'تشغيل ميزة', value: 'on' }, { name: 'إيقاف ميزة', value: 'off' }, { name: 'إضافة موثوق', value: 'trust' }, { name: 'شيل موثوق', value: 'untrust' }, { name: 'روم التنبيهات', value: 'alerts' }] },
    { name: 'feature', type: 'string', description: 'الميزة', choices: Object.entries(FEATURES).map(([value, [name]]) => ({ name, value })) },
    { name: 'user', type: 'user', description: 'الشخص أو البوت (للموثوقين)' },
    { name: 'channel', type: 'channel', description: 'روم تنبيهات الحماية', channelTypes: [0] },
  ],
  async run(ctx) {
    const action = ctx.get('action') || 'status';
    const conf = protection.config(ctx.guild.id);
    const save = () => store.save('protectionConfig');
    if (action === 'on' || action === 'off') {
      const f = ctx.get('feature');
      if (!f) return ctx.fail('اختار الميزة.');
      const prem = FEATURES[f][2];
      if (action === 'on' && prem && !premium.has(ctx.guild.id, prem)) return ctx.fail(premium.lockedText(prem));
      conf[f].enabled = action === 'on';
      save();
      return ctx.reply(`${action === 'on' ? art.i('check', '✅') : art.i('cancel', '⛔')} **${FEATURES[f][0]}** ${action === 'on' ? 'اشتغلت' : 'وقفت'}${!conf.alertChannelId ? '\n-# حدد روم التنبيهات: /protection action:روم التنبيهات' : ''}`);
    }
    if (action === 'trust' || action === 'untrust') {
      const u = ctx.get('user');
      if (!u) return ctx.fail('حدد الشخص.');
      const wl = new Set(conf.antiNuke.whitelist);
      action === 'trust' ? wl.add(u.id) : wl.delete(u.id);
      conf.antiNuke.whitelist = [...wl].slice(0, 50);
      save();
      return ctx.reply({ content: `${E.success} ${u} ${action === 'trust' ? 'صار موثوق (الحماية ما بتعاقبه)' : 'ما عاد موثوق'}`, allowedMentions: { parse: [] } });
    }
    if (action === 'alerts') {
      conf.alertChannelId = (ctx.get('channel') || ctx.channel).id;
      save();
      return ctx.reply(`${E.success} تنبيهات الحماية بتنزل بـ <#${conf.alertChannelId}>`);
    }
    const line = ([k, [name, desc, prem]]) => {
      const locked = prem && !premium.has(ctx.guild.id, prem);
      const on = conf[k]?.enabled;
      return `${art.i(on && !locked ? 'check' : 'cancel', on ? '🟢' : '⚫')} **${name}**${locked ? ' 👑' : ''}\n-# ${desc}`;
    };
    const watched = Object.entries(protection.NUKE_ACTIONS).filter(([k]) => conf.antiNuke.watch[k]).map(([, a]) => a.label);
    const e = ui
      .embed()
      .setDescription(
        [
          `### ${art.i('shield', '🛡️')} حماية السيرفر`,
          ...Object.entries(FEATURES).map(line),
          '',
          `**Anti-Nuke:** ${conf.antiNuke.limit} مرات خلال ${conf.antiNuke.seconds} ثانية ← ${{ strip: 'سحب الرتب', kick: 'طرد', ban: 'حظر' }[conf.antiNuke.punishment]}`,
          `-# بيراقب: ${watched.join('، ') || 'ولا إشي'}`,
          `**الموثوقين:** ${conf.antiNuke.whitelist.length ? conf.antiNuke.whitelist.map((id) => `<@${id}>`).join(' ') : 'مالك السيرفر بس'}`,
          `**روم التنبيهات:** ${conf.alertChannelId ? `<#${conf.alertChannelId}>` : 'مش محدد'}`,
          '',
          '-# أوامر سريعة: /lockdown · /panic · /backup · /warn · /tempban · /slowmode',
        ].join('\n')
      );
    return ctx.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
};
