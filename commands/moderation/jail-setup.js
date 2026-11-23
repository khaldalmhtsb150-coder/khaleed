const { ChannelType } = require('discord.js');
const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const { lockRole } = require('../../systems/jail');

module.exports = {
  name: 'jail-setup',
  aliases: ['اعداد-السجن'],
  description: 'إعداد السجن تلقائياً: ينشئ رتبة السجن وقناة العزل ويقفل باقي القنوات عنها',
  perms: ['ManageGuild'],
  botPerms: ['ManageRoles', 'ManageChannels'],
  options: [
    { name: 'role', type: 'role', description: 'رتبة سجن موجودة (اتركها فاضية وأنا بنشئها)' },
    { name: 'channel', type: 'channel', description: 'قناة العزل (اتركها فاضية وأنا بنشئها)', channelTypes: [0] },
    { name: 'log', type: 'channel', description: 'قناة طلبات العفو والسجلات', channelTypes: [0] },
  ],
  async run(ctx) {
    await ctx.defer();
    const guild = ctx.guild;
    const conf = store.guild('jailConfig', guild.id);
    const reason = `إعداد السجن بواسطة ${ctx.user.username}`;

    // 1) role: the one given, the saved one, or a new one
    let role = ctx.get('role') || (conf.roleId && guild.roles.cache.get(conf.roleId)) || null;
    let createdRole = false;
    if (!role) {
      role = await guild.roles
        .create({ name: 'مسجون', color: 0x4b4f5c, permissions: [], hoist: false, mentionable: false, reason })
        .catch(() => null);
      if (!role) return ctx.fail('ما قدرت أنشئ رتبة السجن، تأكد إن عندي صلاحية Manage Roles.');
      createdRole = true;
    }
    if (role.managed || role.id === guild.id) return ctx.fail('هاي الرتبة ما بتنفع كرتبة سجن.');
    if (!role.editable) return ctx.fail('رتبة السجن أعلى من رتبة البوت، نزّلها تحت رتبتي وجرب مرة ثانية.');

    // 2) jail channel: the one given, the saved one, or a new one
    let channel = ctx.get('channel') || (conf.channelId && guild.channels.cache.get(conf.channelId)) || null;
    let createdChannel = false;
    if (!channel) {
      channel = await guild.channels
        .create({ name: 'السجن', type: ChannelType.GuildText, topic: 'قناة العزل — المسجونين بشوفوا هاي القناة بس.', reason })
        .catch(() => null);
      if (!channel) return ctx.fail('ما قدرت أنشئ قناة السجن، تأكد إن عندي صلاحية Manage Channels.');
      createdChannel = true;
    }

    conf.roleId = role.id;
    conf.channelId = channel.id;
    if (ctx.get('log')) conf.logChannelId = ctx.get('log').id;
    store.save('jailConfig');

    // 3) strip every permission and hide every channel except the jail channel
    const { done, failed } = await lockRole(guild, role, channel, reason);

    const lines = [
      `${E.success} **تم إعداد السجن**`,
      `${E.dot} الرتبة: ${role}${createdRole ? ' (جديدة)' : ''} — بدون أي صلاحيات`,
      `${E.dot} قناة العزل: ${channel}${createdChannel ? ' (جديدة)' : ''} — الوحيدة اللي بيشوفها المسجون`,
      `${E.dot} تم قفل **${done}** قناة عن رتبة السجن`,
      `${E.dot} أي قناة جديدة بتنقفل عنها تلقائياً`,
    ];
    if (failed.length)
      lines.push(
        '',
        `${E.error} ما قدرت أعدل ${failed.length} قناة (ما عندي صلاحية فيها): ${failed.slice(0, 10).map((n) => `\`${n}\``).join('، ')}${failed.length > 10 ? '…' : ''}`
      );
    return ctx.reply(lines.join('\n') + `\n${ui.hint('لو ضفت قنوات كثير وبدك تتأكد، شغّل الأمر مرة ثانية — ما بينشئ إشي مكرر.')}`);
  },
};
