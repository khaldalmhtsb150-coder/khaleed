const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const tempvoice = require('../../systems/tempvoice');

module.exports = {
  name: 'voice-setup',
  aliases: ['رومات-مؤقتة', 'فويس-مؤقت'],
  description: 'الرومات الصوتية المؤقتة: العضو بيدخل روم وبينعمله روم خاص فيه بلوحة تحكم',
  perms: ['ManageGuild'],
  botPerms: ['ManageChannels', 'MoveMembers'],
  options: [
    { name: 'action', type: 'string', description: 'شو بدك؟', required: true, choices: [{ name: 'جهّزها لحالك', value: 'create' }, { name: 'استخدم روم موجود', value: 'hub' }, { name: 'إيقاف', value: 'off' }] },
    { name: 'hub', type: 'channel', description: 'الروم الصوتي اللي بيدخله العضو', channelTypes: [2] },
    { name: 'category', type: 'channel', description: 'الكاتيقوري اللي بتنعمل فيها الرومات', channelTypes: [4] },
    { name: 'name', type: 'string', description: 'اسم الروم، و {user} = اسم العضو' },
    { name: 'limit', type: 'integer', description: 'الحد الأعلى للأعضاء (0 = بدون)', min: 0, max: 99 },
  ],
  async run(ctx) {
    const action = ctx.get('action');
    const conf = store.guild('tempVoice', ctx.guild.id, { ...tempvoice.DEFAULT });
    if (ctx.get('name')) conf.nameTemplate = String(ctx.get('name')).slice(0, 80);
    if (ctx.get('limit') !== null && ctx.get('limit') !== undefined) conf.limit = Number(ctx.get('limit')) || 0;
    if (ctx.get('category')) conf.categoryId = ctx.get('category').id;
    if (action === 'off') {
      conf.enabled = false;
      store.save('tempVoice');
      return ctx.reply(`${E.success} وقفت الرومات المؤقتة. الرومات الموجودة بتنحذف لما تفضى.`);
    }
    if (action === 'hub') {
      const hub = ctx.get('hub');
      if (!hub) return ctx.fail('حدد الروم الصوتي (hub).');
      Object.assign(conf, { enabled: true, hubId: hub.id, categoryId: conf.categoryId || hub.parentId || '' });
      store.save('tempVoice');
    } else {
      store.save('tempVoice');
      try {
        await tempvoice.setup(ctx.guild);
      } catch (e) {
        return ctx.fail(e.message);
      }
    }
    const c = tempvoice.config(ctx.guild.id);
    return ctx.reply(
      [
        `${E.success} الرومات المؤقتة شغالة! أي عضو بيدخل <#${c.hubId}> بينعمله روم خاص فيه.`,
        `${E.dot} الاسم: \`${c.nameTemplate}\` • الحد: **${c.limit || 'بدون'}**`,
        ui.hint('صاحب الروم بيتحكم فيه من لوحة بتنزل بشات الروم: قفل، إخفاء، اسم، عدد، سماح، طرد، واستلام.'),
      ].join('\n')
    );
  },
};
