const E = require('../../utils/emojis');
const ui = require('../../utils/ui');
const store = require('../../utils/store');
const lv = require('../../systems/levels');

module.exports = {
  name: 'levelrole',
  aliases: ['رتبة-لفل', 'مكافآت-اللفل'],
  description: 'رتب مكافآت المستويات: إضافة، حذف، أو عرض',
  perms: ['ManageGuild'],
  botPerms: ['ManageRoles'],
  options: [
    { name: 'action', type: 'string', description: 'العملية', required: true, choices: [{ name: 'إضافة', value: 'add' }, { name: 'حذف', value: 'remove' }, { name: 'عرض', value: 'list' }] },
    { name: 'level', type: 'integer', description: 'اللفل', min: 1, max: 500 },
    { name: 'role', type: 'role', description: 'الرتبة' },
    { name: 'type', type: 'string', description: 'لفل الكتابة أو الفويس (الافتراضي كتابة)', choices: [{ name: 'الكتابة', value: 'text' }, { name: 'الفويس', value: 'voice' }] },
  ],
  async run(ctx) {
    const conf = store.guild('levelConfig', ctx.guild.id, {});
    conf.rewards = conf.rewards || [];
    const action = ctx.get('action');
    const type = ctx.get('type') === 'voice' ? 'voice' : 'text';

    if (action === 'list') {
      if (!conf.rewards.length) return ctx.fail('ما في رتب مكافآت. ضيف وحدة: `/levelrole action:إضافة level:5 role:@رتبة`');
      const lines = [...conf.rewards]
        .sort((a, b) => a.type.localeCompare(b.type) || a.level - b.level)
        .map((r) => `${r.type === 'voice' ? E.voice : E.star} لفل **${r.level}** ${r.type === 'voice' ? 'فويس' : 'كتابة'} ← <@&${r.roleId}>`);
      return ctx.reply({ embeds: [ui.embed().setDescription(`### رتب المكافآت\n${lines.join('\n')}`)], allowedMentions: { parse: [] } });
    }

    const role = ctx.get('role');
    if (action === 'remove') {
      const before = conf.rewards.length;
      conf.rewards = conf.rewards.filter((r) => !((role && r.roleId === role.id) || (!role && ctx.get('level') && r.level === ctx.get('level') && r.type === type)));
      if (conf.rewards.length === before) return ctx.fail('ما لقيت مكافأة بهالرتبة أو اللفل.');
      store.save('levelConfig');
      return ctx.reply(`${E.success} تم حذف المكافأة.`);
    }

    const level = ctx.get('level');
    if (!level || !role) return ctx.fail('حدد اللفل والرتبة.');
    if (role.managed || role.id === ctx.guild.id) return ctx.fail('هاي الرتبة ما بتنعطى.');
    if (!role.editable) return ctx.fail('الرتبة أعلى من رتبة البوت، نزّلها تحت رتبتي.');
    if (conf.rewards.length >= 25) return ctx.fail('وصلت للحد (25 مكافأة).');
    conf.rewards = conf.rewards.filter((r) => !(r.level === level && r.type === type));
    conf.rewards.push({ level, roleId: role.id, type });
    store.save('levelConfig');
    return ctx.reply({ content: `${E.success} اللي بيوصل لفل **${level}** ${type === 'voice' ? 'بالفويس' : 'بالكتابة'} بياخد ${role}.`, allowedMentions: { parse: [] } });
  },
};
