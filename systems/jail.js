const {
  Events,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const logs = require('./logs');
const { formatDuration, ts } = require('../utils/time');
const { canManageGuild } = require('../utils/perms');

const cfg = (guildId) => store.peek('jailConfig', guildId) || {};
const records = (guildId) => store.guild('jail', guildId);

function logChannel(guild) {
  const id = cfg(guild.id).logChannelId;
  const ch = id ? guild.channels.cache.get(id) : null;
  return ch?.isTextBased() ? ch : logs.channelFor(guild, 'moderation_actions');
}

function canAct(moderator, target) {
  if (target.id === target.guild.ownerId) return 'ما بتقدر تسجن مالك السيرفر.';
  if (target.id === moderator.id) return 'ما بتقدر تسجن حالك 😅';
  if (target.user.bot) return 'البوتات ما بتنسجن.';
  if (moderator.id !== moderator.guild.ownerId && moderator.roles.highest.comparePositionTo(target.roles.highest) <= 0)
    return 'رتبة العضو أعلى من رتبتك أو مساوية لها.';
  if (!target.manageable) return 'رتبة العضو أعلى من رتبتي، لا أستطيع تعديل رتبه.';
  return null;
}

async function jail({ guild, target, moderator, durationMs = null, reason = 'بدون سبب' }) {
  const conf = cfg(guild.id);
  const role = conf.roleId ? guild.roles.cache.get(conf.roleId) : null;
  if (!role) return { error: 'رتبة السجن لسا مش مركّبة. ركّبها بـ /jail-setup أو من الداشبورد.' };
  if (!role.editable) return { error: 'رتبة السجن أعلى من رتبتي، ارفع رتبة البوت فوقها.' };
  const blocked = canAct(moderator, target);
  if (blocked) return { error: blocked };
  const data = records(guild.id);
  if (data[target.id]) return { error: 'العضو مسجون بالفعل.' };

  const managed = target.roles.cache.filter((r) => r.managed).map((r) => r.id);
  const saved = target.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.id !== role.id).map((r) => r.id);

  await target.roles.set([role.id, ...managed], `سجن بواسطة ${moderator.user.tag}: ${reason}`);

  const until = durationMs ? Date.now() + durationMs : null;
  data[target.id] = { roles: saved, at: Date.now(), until, reason, by: moderator.id, appealed: false };
  store.save('jail');

  const jailCh = conf.channelId ? guild.channels.cache.get(conf.channelId) : null;
  if (jailCh?.isTextBased()) {
    const embed = ui
      .embed()
      .setAuthor({ name: target.user.username, iconURL: target.user.displayAvatarURL() })
      .setDescription(
        [
          `**${E.lock} تم عزلك مؤقتاً**`,
          '',
          `${E.dot} العضو: ${target}`,
          `${E.dot} المدة: ${durationMs ? `${formatDuration(durationMs)} — تنتهي ${ts(until)}` : 'غير محددة'}`,
          `${E.dot} السبب: ${reason}`,
          '',
          ui.hint('يمكنك تقديم طلب عفو واحد للإدارة عبر الزر بالأسفل.'),
        ].join('\n')
      );
    const row = new ActionRowBuilder().addComponents(
      ui.button(`appeal_jail_${target.id}`, 'تقديم اعتذار / طلب عفو', { emoji: 'heart' })
    );
    const msg = await jailCh
      .send({ content: `${target}`, embeds: [embed], components: [row] })
      .catch(() => null);
    if (msg) {
      data[target.id].messageId = msg.id;
      store.save('jail');
    }
  }

  logChannel(guild)
    ?.send({
      embeds: [
        ui
          .embed()
          .setDescription(
            [
              `**${E.lock} سجن عضو**`,
              `${E.dot} العضو: ${target} \`${target.id}\``,
              `${E.dot} بواسطة: ${moderator}`,
              `${E.dot} المدة: ${durationMs ? formatDuration(durationMs) : 'غير محددة'}`,
              `${E.dot} السبب: ${reason}`,
            ].join('\n')
          )
          .setTimestamp(),
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() => {});

  return { ok: true, until };
}

async function release(guild, userId, { by = null, reason = 'انتهاء المدة' } = {}) {
  const data = records(guild.id);
  const record = data[userId];
  if (!record) return { error: 'العضو غير مسجون.' };

  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) {
    const me = guild.members.me;
    const restore = record.roles.filter((id) => {
      const r = guild.roles.cache.get(id);
      return r && !r.managed && r.comparePositionTo(me.roles.highest) < 0;
    });
    const managed = member.roles.cache.filter((r) => r.managed).map((r) => r.id);
    await member.roles.set([...restore, ...managed], `تحرير: ${reason}`).catch((e) => console.error('[jail] restore', e.message));
  }

  delete data[userId];
  store.save('jail');

  const conf = cfg(guild.id);
  if (record.messageId && conf.channelId) {
    const ch = guild.channels.cache.get(conf.channelId);
    ch?.messages?.delete(record.messageId).catch(() => {});
  }

  logChannel(guild)
    ?.send({
      embeds: [
        ui
          .embed()
          .setDescription(
            [
              `**${E.unlock} تحرير عضو**`,
              `${E.dot} العضو: <@${userId}> \`${userId}\``,
              by ? `${E.dot} بواسطة: <@${by}>` : `${E.dot} تلقائياً`,
              `${E.dot} السبب: ${reason}`,
            ].join('\n')
          )
          .setTimestamp(),
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() => {});

  return { ok: true, member };
}

async function sweep(client) {
  const all = store.get('jail');
  const now = Date.now();
  for (const [guildId, users] of Object.entries(all)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    for (const [userId, rec] of Object.entries(users)) {
      if (rec.until && rec.until <= now) await release(guild, userId).catch((e) => console.error('[jail] sweep', e.message));
    }
  }
}

// ---- jail role lockdown ----
// What the jail role is denied in every channel except the jail channel.
const DENY = {
  ViewChannel: false,
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
  Connect: false,
  Speak: false,
};
const ALLOW_JAIL = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AddReactions: false, AttachFiles: false, EmbedLinks: false, CreatePublicThreads: false, CreatePrivateThreads: false };

/** Removes every permission from the jail role and hides every channel from it except the jail channel. */
async function lockRole(guild, role, jailChannel, reason = 'إعداد رتبة السجن') {
  await role.setPermissions(0n, reason).catch(() => {});
  let done = 0;
  const failed = [];
  for (const ch of guild.channels.cache.values()) {
    if (ch.isThread?.() || !ch.permissionOverwrites) continue;
    const opts = ch.id === jailChannel?.id ? ALLOW_JAIL : DENY;
    try {
      await ch.permissionOverwrites.edit(role, opts, { reason });
      if (opts === DENY) done++;
    } catch {
      failed.push(ch.name);
    }
  }
  if (jailChannel) await jailChannel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }, { reason }).catch(() => {});
  return { done, failed };
}

function init(client) {
  // New channels are hidden from the jail role automatically.
  client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.guild || !channel.permissionOverwrites) return;
    const conf = cfg(channel.guild.id);
    if (!conf.roleId || channel.id === conf.channelId) return;
    const role = channel.guild.roles.cache.get(conf.roleId);
    if (role) await channel.permissionOverwrites.edit(role, DENY, { reason: 'إخفاء القناة عن رتبة السجن' }).catch(() => {});
  });

  setInterval(() => sweep(client), 30_000);
  client.once(Events.ClientReady, () => sweep(client));

  // Re-apply jail when a jailed member leaves and rejoins.
  client.on(Events.GuildMemberAdd, async (member) => {
    const rec = store.peek('jail', member.guild.id)?.[member.id];
    const roleId = cfg(member.guild.id).roleId;
    if (rec && roleId) await member.roles.add(roleId, 'محاولة تهرب من السجن').catch(() => {});
  });
}

// ---- components ----
async function onButton(interaction) {
  const id = interaction.customId;

  if (id.startsWith('appeal_jail_')) {
    const userId = id.slice('appeal_jail_'.length);
    if (interaction.user.id !== userId) return interaction.reply({ content: '• هذا الزر مخصص للعضو المسجون فقط.', ephemeral: true });
    const rec = store.peek('jail', interaction.guild.id)?.[userId];
    if (!rec) return interaction.reply({ content: '• لم تعد مسجوناً.', ephemeral: true });
    if (rec.appealed) return interaction.reply({ content: '• لقد قدمت طلب عفو مسبقاً، انتظر رد الإدارة.', ephemeral: true });
    const modal = new ModalBuilder()
      .setCustomId(`appeal_modal_${userId}`)
      .setTitle('طلب عفو')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('text')
            .setLabel('اكتب اعتذارك وسبب طلب العفو')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(10)
            .setMaxLength(1000)
            .setRequired(true)
        )
      );
    return interaction.showModal(modal);
  }

  if (id.startsWith('jailappeal_')) {
    const [, action, userId] = id.split('_');
    if (!canManageGuild(interaction.member) && !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: '• لا تملك الصلاحيات الكافية.', ephemeral: true });

    const original = interaction.message.embeds[0];
    const done = ui
      .embed()
      .setDescription(`${original?.description || ''}\n\n${ui.hint(`${action === 'accept' ? 'تم القبول' : 'تم الرفض'} بواسطة ${interaction.user.username}`)}`);

    if (action === 'accept') {
      const res = await release(interaction.guild, userId, { by: interaction.user.id, reason: 'قبول طلب العفو' });
      if (res.error) return interaction.reply({ content: `• ${res.error}`, ephemeral: true });
      res.member?.send(`${E.success} انقبل طلب العفو تبعك بـ **${interaction.guild.name}** 🤍`).catch(() => {});
    } else {
      const user = await interaction.client.users.fetch(userId).catch(() => null);
      user?.send(`• انرفض طلب العفو تبعك بـ **${interaction.guild.name}**.`).catch(() => {});
    }
    return interaction.update({ embeds: [done], components: [] });
  }
}

async function onModal(interaction) {
  if (!interaction.customId.startsWith('appeal_modal_')) return;
  const userId = interaction.customId.slice('appeal_modal_'.length);
  const rec = store.peek('jail', interaction.guild.id)?.[userId];
  if (!rec) return interaction.reply({ content: '• لم تعد مسجوناً.', ephemeral: true });
  const text = interaction.fields.getTextInputValue('text');
  const ch = logChannel(interaction.guild);
  if (!ch) return interaction.reply({ content: '• لا توجد قناة سجلات لاستقبال الطلب، تواصل مع الإدارة.', ephemeral: true });

  rec.appealed = true;
  store.save('jail');

  const embed = ui
    .embed()
    .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    .setDescription(
      [
        `**${E.heart} طلب عفو جديد**`,
        `${E.dot} العضو: ${interaction.user} \`${userId}\``,
        `${E.dot} سبب السجن: ${rec.reason}`,
        `${E.dot} سُجن بواسطة: <@${rec.by}> ${ts(rec.at)}`,
        '',
        `>>> ${text}`,
      ].join('\n')
    );
  const row = new ActionRowBuilder().addComponents(
    ui.button(`jailappeal_accept_${userId}`, 'قبول وتحرير', { emoji: 'unlock' }),
    ui.button(`jailappeal_reject_${userId}`, 'رفض', { emoji: 'error', style: ButtonStyle.Danger })
  );
  await ch.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  return interaction.reply({ content: `${E.success} تم إرسال طلبك للإدارة.`, ephemeral: true });
}

module.exports = {
  jail,
  release,
  init,
  lockRole,
  components: [
    { prefix: 'appeal_jail_', type: 'button', handle: onButton },
    { prefix: 'jailappeal_', type: 'button', handle: onButton },
    { prefix: 'appeal_modal_', type: 'modal', handle: onModal },
  ],
};
