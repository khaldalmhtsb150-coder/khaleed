const { Events, AuditLogEvent, ChannelType } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const { ts } = require('../utils/time');

const LOG_TYPES = {
  member_join_leave: { label: 'دخول وخروج الأعضاء', emoji: 'joinLeave' },
  message_edit_delete: { label: 'تعديل وحذف الرسائل', emoji: 'edit' },
  role_changes: { label: 'تغييرات رتب الأعضاء', emoji: 'roles' },
  channel_changes: { label: 'إنشاء وتعديل القنوات', emoji: 'settings' },
  moderation_actions: { label: 'الحظر والطرد والسجن', emoji: 'ban' },
  voice_changes: { label: 'نشاط الرومات الصوتية', emoji: 'voice' },
  nickname_changes: { label: 'تغيير الألقاب', emoji: 'edit' },
  server_updates: { label: 'تحديثات السيرفر', emoji: 'settings' },
  ticket_logs: { label: 'سجلات التذاكر', emoji: 'ticket' },
};

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

module.exports = { LOG_TYPES, send, channelFor, init };
