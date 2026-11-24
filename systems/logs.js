const { Events, AuditLogEvent, ChannelType } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const { ts } = require('../utils/time');

const LOG_TYPES = {
  member_join_leave: { label: 'دخول وخروج الأعضاء', emoji: 'joinLeave', channel: '📥・دخول-وخروج' },
  message_edit_delete: { label: 'تعديل وحذف الرسائل', emoji: 'edit', channel: '💬・الرسائل' },
  role_changes: { label: 'تغييرات رتب الأعضاء', emoji: 'roles', channel: '🎭・الرتب' },
  channel_changes: { label: 'إنشاء وتعديل القنوات', emoji: 'settings', channel: '📁・القنوات' },
  moderation_actions: { label: 'الحظر والطرد والسجن', emoji: 'ban', channel: '🔨・العقوبات' },
  voice_changes: { label: 'نشاط الرومات الصوتية', emoji: 'voice', channel: '🔊・الصوت' },
  nickname_changes: { label: 'تغيير الألقاب', emoji: 'edit', channel: '✏️・الألقاب' },
  server_updates: { label: 'تحديثات السيرفر', emoji: 'settings', channel: '⚙️・السيرفر' },
  ticket_logs: { label: 'سجلات التذاكر', emoji: 'ticket', channel: '🎫・التذاكر' },
};
const LOG_CATEGORY = '📋 سجلات ماركا';

/**
 * Creates the log channels itself, hidden from members (staff with Manage Server / the manager role can see them).
 * mode 'separate' → one channel per log type, 'single' → one channel for everything.
 * Types that already point to a working channel are left alone unless overwrite is true.
 */
async function autoSetup(guild, { mode = 'separate', overwrite = false } = {}) {
  const { PermissionFlagsBits } = require('discord.js');
  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('البوت بحاجة صلاحية Manage Channels عشان ينشئ الرومات.');
  const conf = store.guild('logsConfig', guild.id);
  const managerRoleId = store.peek('guildSettings', guild.id)?.managerRoleId;
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (managerRoleId && guild.roles.cache.has(managerRoleId)) {
    overwrites.push({ id: managerRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
  }
  let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === LOG_CATEGORY);
  if (!category) category = await guild.channels.create({ name: LOG_CATEGORY, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: 'MarkaBot: إنشاء رومات السجلات' });

  const todo = Object.keys(LOG_TYPES).filter((k) => overwrite || !channelFor(guild, k));
  const made = [];
  const make = (name) =>
    guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites, reason: 'MarkaBot: إنشاء رومات السجلات' });
  if (mode === 'single') {
    if (todo.length) {
      const existing = category.children?.cache?.find((c) => c.name === '📋・كل-السجلات');
      const ch = existing || (await make('📋・كل-السجلات'));
      if (!existing) made.push(ch);
      for (const k of todo) conf[k] = ch.id;
    }
  } else {
    for (const k of todo) {
      const name = LOG_TYPES[k].channel;
      const existing = category.children?.cache?.find((c) => c.name === name);
      const ch = existing || (await make(name));
      if (!existing) made.push(ch);
      conf[k] = ch.id;
    }
  }
  store.save('logsConfig');
  return { category, made, set: todo.length, skipped: Object.keys(LOG_TYPES).length - todo.length };
}

function channelFor(guild, type) {
  const id = store.peek('logsConfig', guild.id)?.[type];
  if (!id) return null;
  const ch = guild.channels.cache.get(id);
  return ch?.isTextBased() ? ch : null;
}

async function send(guild, type, payload) {
  const ch = channelFor(guild, type);
  if (!ch) return null;
  const data = payload.data ? { embeds: [payload] } : payload;
  return ch.send({ allowedMentions: { parse: [] }, ...data }).catch((e) => console.error(`[logs:${type}]`, e.message));
}

const head = (key, title) => `${E[key]} ${title}`;

function init(client) {
  client.on(Events.GuildMemberAdd, (member) => {
    const age = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
    send(
      member.guild,
      'member_join_leave',
      ui
        .embed()
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setDescription(
          [
            `**${head('joinLeave', 'انضمام عضو')}**`,
            `${E.dot} العضو: ${member} \`${member.id}\``,
            `${E.dot} عمر الحساب: ${ts(member.user.createdTimestamp)}${age < 7 ? ` ${E.warning} حساب جديد` : ''}`,
            `${E.dot} عدد الأعضاء: **${member.guild.memberCount}**`,
          ].join('\n')
        )
        .setTimestamp()
    );
  });

  client.on(Events.GuildMemberRemove, (member) => {
    send(
      member.guild,
      'member_join_leave',
      ui
        .embed()
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setDescription(
          [
            `**${head('joinLeave', 'مغادرة عضو')}**`,
            `${E.dot} العضو: ${member.user} \`${member.id}\``,
            member.joinedTimestamp ? `${E.dot} انضم: ${ts(member.joinedTimestamp)}` : null,
            member.roles?.cache.size > 1
              ? `${E.dot} الرتب: ${ui.trim(member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => `${r}`).join(' '), 900)}`
              : null,
          ]
            .filter(Boolean)
            .join('\n')
        )
        .setTimestamp()
    );
  });

  client.on(Events.MessageDelete, (message) => {
    if (!message.guild || message.author?.bot) return;
    const e = ui
      .embed()
      .setDescription(
        [
          `**${head('delete', 'حذف رسالة')}**`,
          `${E.dot} الكاتب: ${message.author || 'غير معروف'}`,
          `${E.dot} القناة: ${message.channel}`,
          '',
          message.content ? ui.trim(message.content, 1500) : ui.hint('بدون نص'),
        ].join('\n')
      )
      .setTimestamp();
    if (message.attachments?.size) e.addFields({ name: 'المرفقات', value: `${message.attachments.size} مرفق` });
    send(message.guild, 'message_edit_delete', e);
  });

  client.on(Events.MessageUpdate, (oldMsg, newMsg) => {
    if (!newMsg.guild || newMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content || oldMsg.partial) return;
    send(
      newMsg.guild,
      'message_edit_delete',
      ui
        .embed()
        .setDescription(
          [
            `**${head('edit', 'تعديل رسالة')}** — [الانتقال](${newMsg.url})`,
            `${E.dot} الكاتب: ${newMsg.author}`,
            `${E.dot} القناة: ${newMsg.channel}`,
          ].join('\n')
        )
        .addFields(
          { name: 'قبل', value: ui.trim(oldMsg.content || '—', 1000) },
          { name: 'بعد', value: ui.trim(newMsg.content || '—', 1000) }
        )
        .setTimestamp()
    );
  });

  client.on(Events.GuildMemberUpdate, (oldM, newM) => {
    const added = newM.roles.cache.filter((r) => !oldM.roles.cache.has(r.id));
    const removed = oldM.roles.cache.filter((r) => !newM.roles.cache.has(r.id));
    if (added.size || removed.size) {
      const lines = [`**${head('roles', 'تحديث رتب عضو')}**`, `${E.dot} العضو: ${newM}`];
      if (added.size) lines.push(`${E.dot} أضيفت: ${added.map((r) => `${r}`).join(' ')}`);
      if (removed.size) lines.push(`${E.dot} أزيلت: ${removed.map((r) => `${r}`).join(' ')}`);
      send(newM.guild, 'role_changes', ui.embed().setDescription(lines.join('\n')).setTimestamp());
    }
    if (oldM.nickname !== newM.nickname) {
      send(
        newM.guild,
        'nickname_changes',
        ui
          .embed()
          .setDescription(
            [
              `**${head('edit', 'تغيير لقب')}**`,
              `${E.dot} العضو: ${newM}`,
              `${E.dot} من: \`${oldM.nickname || 'بدون'}\``,
              `${E.dot} إلى: \`${newM.nickname || 'بدون'}\``,
            ].join('\n')
          )
          .setTimestamp()
      );
    }
  });

  const chType = (c) =>
    ({ [ChannelType.GuildText]: 'كتابية', [ChannelType.GuildVoice]: 'صوتية', [ChannelType.GuildCategory]: 'تصنيف', [ChannelType.GuildAnnouncement]: 'إعلانات', [ChannelType.GuildStageVoice]: 'ستيج', [ChannelType.GuildForum]: 'منتدى' })[c.type] || 'قناة';

  client.on(Events.ChannelCreate, (c) => {
    if (!c.guild) return;
    send(c.guild, 'channel_changes', ui.embed().setDescription(`**${head('settings', 'إنشاء قناة')}**\n${E.dot} ${c} — ${chType(c)}`).setTimestamp());
  });
  client.on(Events.ChannelDelete, (c) => {
    if (!c.guild) return;
    send(c.guild, 'channel_changes', ui.embed().setDescription(`**${head('delete', 'حذف قناة')}**\n${E.dot} \`${c.name}\` — ${chType(c)}`).setTimestamp());
  });
  client.on(Events.ChannelUpdate, (o, n) => {
    if (!n.guild) return;
    const lines = [];
    if (o.name !== n.name) lines.push(`${E.dot} الاسم: \`${o.name}\` ← \`${n.name}\``);
    if (o.topic !== n.topic) lines.push(`${E.dot} الوصف: ${ui.trim(n.topic || 'بدون', 300)}`);
    if (!lines.length) return;
    send(n.guild, 'channel_changes', ui.embed().setDescription([`**${head('edit', 'تعديل قناة')}** ${n}`, ...lines].join('\n')).setTimestamp());
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    let by = null;
    try {
      const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
      const entry = logs.entries.first();
      if (entry?.target?.id === ban.user.id) by = entry.executor;
    } catch {}
    send(
      ban.guild,
      'moderation_actions',
      ui
        .embed()
        .setDescription(
          [
            `**${head('ban', 'حظر عضو')}**`,
            `${E.dot} العضو: ${ban.user} \`${ban.user.id}\``,
            by ? `${E.dot} بواسطة: ${by}` : null,
            `${E.dot} السبب: ${ban.reason || 'بدون سبب'}`,
          ]
            .filter(Boolean)
            .join('\n')
        )
        .setTimestamp()
    );
  });

  client.on(Events.GuildBanRemove, (ban) => {
    send(ban.guild, 'moderation_actions', ui.embed().setDescription(`**${head('unlock', 'فك حظر')}**\n${E.dot} العضو: ${ban.user} \`${ban.user.id}\``).setTimestamp());
  });

  client.on(Events.VoiceStateUpdate, (o, n) => {
    const member = n.member;
    if (!member || o.channelId === n.channelId) return;
    let text;
    if (!o.channel) text = `${E.dot} ${member} دخل ${n.channel}`;
    else if (!n.channel) text = `${E.dot} ${member} خرج من ${o.channel}`;
    else text = `${E.dot} ${member} انتقل من ${o.channel} إلى ${n.channel}`;
    send(n.guild, 'voice_changes', ui.embed().setDescription(`**${head('voice', 'نشاط صوتي')}**\n${text}`).setTimestamp());
  });

  client.on(Events.GuildUpdate, (o, n) => {
    const lines = [];
    if (o.name !== n.name) lines.push(`${E.dot} الاسم: \`${o.name}\` ← \`${n.name}\``);
    if (o.icon !== n.icon) lines.push(`${E.dot} تم تغيير أيقونة السيرفر`);
    if (o.verificationLevel !== n.verificationLevel) lines.push(`${E.dot} مستوى التحقق: ${o.verificationLevel} ← ${n.verificationLevel}`);
    if (o.vanityURLCode !== n.vanityURLCode) lines.push(`${E.dot} الرابط المخصص: \`${o.vanityURLCode || '—'}\` ← \`${n.vanityURLCode || '—'}\``);
    if (!lines.length) return;
    const e = ui.embed().setDescription([`**${head('settings', 'تحديث السيرفر')}**`, ...lines].join('\n')).setTimestamp();
    if (n.iconURL()) e.setThumbnail(n.iconURL());
    send(n, 'server_updates', e);
  });
}

module.exports = { LOG_TYPES, LOG_CATEGORY, send, channelFor, init, autoSetup };
