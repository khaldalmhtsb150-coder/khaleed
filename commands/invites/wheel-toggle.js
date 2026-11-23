const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const store = require('../../utils/store');
const wheel = require('../../systems/wheel');

module.exports = {
  name: 'wheel-toggle',
  aliases: ['العجلة', 'wheel-state'],
  description: 'تشغيل أو إيقاف عجلة الحظ (وهي موقفة ما تنحسب نقاط على الدعوات)',
  perms: ['ManageGuild'],
  options: [{ name: 'state', type: 'boolean', description: 'تشغيل أو إيقاف', label: 'on/off', required: true }],
  async run(ctx) {
    const on = ctx.get('state');
    const conf = wheel.config(ctx.guild.id);
    conf.enabled = on;
    store.save('wheelConfig');
    return ctx.reply(
      on
        ? `${E.success} تم **تشغيل** عجلة الحظ.\n${ui.hint('الدعوات الجديدة صارت تعطي نقاط، والأعضاء بيقدروا يلفوا العجلة.')}`
        : `${E.lock} تم **إيقاف** عجلة الحظ.\n${ui.hint('ما حدا بيقدر يلف العجلة، والدعوات الجديدة بتنحسب كدعوات بس بدون نقاط. النقاط الحالية محفوظة.')}`
    );
  },
};
