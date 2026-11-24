// Temporary voice rooms: join the hub → your own room is created and you're moved into it.
// The owner controls it from a panel posted in the room's chat. Empty rooms delete themselves.
const {
  Events,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const art = require('../utils/art');
const { canManageGuild } = require('../utils/perms');

const DEFAULT = { enabled: false, hubId: '', categoryId: '', nameTemplate: '🔊 روم {user}', limit: 0 };
const config = (gid) => ({ ...DEFAULT, ...(store.peek('tempVoice', gid) || {}) });
const rooms = () => store.get('tempRooms'); // channelId → { gid, owner, at }
const P = PermissionFlagsBits;
const creating = new Set(); // userId while their room is being made (stops double rooms)

function panel(channel, ownerId, { first = false } = {}) {
  const ow = channel.permissionOverwrites?.cache?.get(channel.guild.roles.everyone.id);
  const locked = ow?.deny?.has?.(P.Connect);
  const hidden = ow?.deny?.has?.(P.ViewChannel);
  const id = (a) => `tv:${a}:${channel.id}`;
  const content = [
    `${art.i('crown', '👑')} <@${ownerId}>`,
    `-# ${locked ? 'مقفل' : 'مفتوح'} · ${hidden ? 'مخفي' : 'ظاهر'} · الحد ${channel.userLimit || 'بدون'} · لما يفضى بينحذف لحاله`,
  ].join('\n');
  const payload = {
    content,
    allowedMentions: { parse: [] },
    components: [
      new ActionRowBuilder().addComponents(
        ui.button(id(locked ? 'unlock' : 'lock'), locked ? 'فتح' : 'قفل', { emoji: locked ? 'unlock' : 'lock' }),
        ui.button(id(hidden ? 'show' : 'hide'), hidden ? 'إظهار' : 'إخفاء', { emoji: hidden ? 'show' : 'hide' }),
        ui.button(id('rename'), 'الاسم', { emoji: 'rename' }),
        ui.button(id('limit'), 'العدد', { emoji: 'limit' }),
        ui.button(id('claim'), 'استلام', { emoji: 'claim' })
      ),
      new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(id('permit')).setPlaceholder('اسمح لعضو يدخل حتى لو مقفل').setMaxValues(5)),
      new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(id('kick')).setPlaceholder('اطرد عضو من الروم').setMaxValues(5)),
    ],
  };
  if (first) {
    const b = art.banner('tempvoice');
    if (b) payload.files = [b];
  }
  return payload;
}

async function createRoom(member, conf) {
  const { guild } = member;
  if (creating.has(member.id)) return null;
  // already owns a room: just move them back to it
  const existing = Object.entries(rooms()).find(([cid, r]) => r.gid === guild.id && r.owner === member.id && guild.channels.cache.has(cid));
  if (existing) {
    await member.voice.setChannel(existing[0]).catch(() => {});
    return guild.channels.cache.get(existing[0]);
  }
  creating.add(member.id);
  try {
    const hub = guild.channels.cache.get(conf.hubId);
    const name = conf.nameTemplate.replace(/\{user\}/g, member.displayName).slice(0, 90);
    const ch = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: conf.categoryId || hub?.parentId || undefined,
      userLimit: conf.limit || 0,
      permissionOverwrites: [{ id: member.id, allow: [P.Connect, P.ViewChannel, P.Speak, P.Stream, P.MoveMembers] }, { id: guild.members.me.id, allow: [P.Connect, P.ViewChannel, P.ManageChannels, P.MoveMembers, P.SendMessages] }],
      reason: 'MarkaBot: روم صوتي مؤقت',
    });
    rooms()[ch.id] = { gid: guild.id, owner: member.id, at: Date.now() };
    store.save('tempRooms');
    await member.voice.setChannel(ch).catch(() => {});
    await ch.send({ ...panel(ch, member.id, { first: true }), allowedMentions: { users: [member.id] } }).catch(() => {});
    return ch;
  } finally {
    creating.delete(member.id);
  }
}

async function cleanup(channel) {
  const r = rooms()[channel?.id];
  if (!r) return;
  if (channel.members?.size > 0) return;
  delete rooms()[channel.id];
  store.save('tempRooms');
  await channel.delete('MarkaBot: الروم المؤقت فضي').catch(() => {});
}

async function onVoice(oldState, newState) {
  const conf = config(newState.guild.id);
  if (conf.enabled && conf.hubId && newState.channelId === conf.hubId && newState.member && !newState.member.user.bot) {
    await createRoom(newState.member, conf).catch((e) => console.error('[tempvoice]', e.message));
  }
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const ch = oldState.guild.channels.cache.get(oldState.channelId);
    if (ch) await cleanup(ch);
  }
}

const isOwnerOf = (i, room) => room && (room.owner === i.user.id || canManageGuild(i.member));

async function onComponent(i) {
  const [, action, cid] = i.customId.split(':');
  const ch = i.guild.channels.cache.get(cid);
  const room = rooms()[cid];
  if (!ch || !room) return i.reply({ content: '• هالروم ما عاد موجود.', ephemeral: true });
  if (action === 'claim') {
    if (room.owner === i.user.id) return i.reply({ content: '• إنت صاحب الروم أصلاً 👑', ephemeral: true });
    if (ch.members.has(room.owner)) return i.reply({ content: '• صاحب الروم لسا موجود فيه.', ephemeral: true });
    if (!ch.members.has(i.user.id)) return i.reply({ content: '• لازم تكون جوا الروم عشان تستلمه.', ephemeral: true });
    room.owner = i.user.id;
    store.save('tempRooms');
    await ch.permissionOverwrites.edit(i.user.id, { Connect: true, ViewChannel: true, MoveMembers: true }).catch(() => {});
    i.message?.edit(panel(ch, i.user.id)).catch(() => {});
    return i.reply({ content: `${art.i('crown', '👑')} <@${i.user.id}> صار صاحب الروم`, allowedMentions: { parse: [] } });
  }
  if (!isOwnerOf(i, room)) return i.reply({ content: '• بس صاحب الروم بيقدر يستخدم اللوحة.', ephemeral: true });
  const everyone = i.guild.roles.everyone.id;
  const refresh = () => i.message?.edit(panel(ch, room.owner)).catch(() => {});
  switch (action) {
    case 'lock':
    case 'unlock':
      await ch.permissionOverwrites.edit(everyone, { Connect: action === 'lock' ? false : null });
      await i.reply({ content: action === 'lock' ? `${art.i('lock', '🔒')} قفلت الروم` : `${art.i('unlock', '🔓')} فتحت الروم`, ephemeral: true });
      return refresh();
    case 'hide':
    case 'show':
      await ch.permissionOverwrites.edit(everyone, { ViewChannel: action === 'hide' ? false : null });
      await i.reply({ content: action === 'hide' ? `${art.i('hide', '🙈')} خبيت الروم` : `${art.i('show', '👁️')} الروم ظاهر للكل`, ephemeral: true });
      return refresh();
    case 'rename':
    case 'limit': {
      const input = new TextInputBuilder()
        .setCustomId('v')
        .setLabel(action === 'rename' ? 'اسم الروم الجديد' : 'الحد الأعلى (0 = بدون)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(action === 'rename' ? 90 : 2)
        .setRequired(true);
      return i.showModal(new ModalBuilder().setCustomId(`tv:${action}Set:${cid}`).setTitle(action === 'rename' ? 'تغيير الاسم' : 'تحديد العدد').addComponents(new ActionRowBuilder().addComponents(input)));
    }
    case 'renameSet': {
      const name = i.fields.getTextInputValue('v').trim().slice(0, 90);
      await ch.setName(name || ch.name).catch(() => {});
      return i.reply({ content: `${art.i('rename', '✏️')} صار اسم الروم **${name}**`, ephemeral: true });
    }
    case 'limitSet': {
      const n = Math.max(0, Math.min(99, parseInt(i.fields.getTextInputValue('v'), 10) || 0));
      await ch.setUserLimit(n).catch(() => {});
      await i.reply({ content: `${art.i('limit', '👥')} الحد صار **${n || 'بدون'}**`, ephemeral: true });
      return refresh();
    }
    case 'permit':
      for (const uid of i.values) await ch.permissionOverwrites.edit(uid, { Connect: true, ViewChannel: true }).catch(() => {});
      return i.reply({ content: `${art.i('permit', '✅')} سمحت لـ ${i.values.map((u) => `<@${u}>`).join(' ')}`, ephemeral: true, allowedMentions: { parse: [] } });
    case 'kick': {
      const out = [];
      for (const uid of i.values) {
        if (uid === room.owner) continue;
        const m = ch.members.get(uid);
        if (m) await m.voice.disconnect('طرد من الروم المؤقت').catch(() => {});
        await ch.permissionOverwrites.edit(uid, { Connect: false }).catch(() => {});
        out.push(`<@${uid}>`);
      }
      return i.reply({ content: out.length ? `${art.i('kick', '👢')} طردت ${out.join(' ')} وما بيقدروا يرجعوا` : '• ما في حدا أطرده.', ephemeral: true, allowedMentions: { parse: [] } });
    }
    default:
      return i.reply({ content: '• أمر غير معروف.', ephemeral: true });
  }
}

/** Creates the hub (and a category) for /voice-setup and the dashboard button. */
async function setup(guild, { hubName = '➕ اعمل رومك', categoryName = '🔊 رومات مؤقتة' } = {}) {
  const me = guild.members.me;
  if (!me.permissions.has(P.ManageChannels) || !me.permissions.has(P.MoveMembers)) throw new Error('البوت بحاجة صلاحيتي Manage Channels و Move Members.');
  const conf = store.guild('tempVoice', guild.id, { ...DEFAULT });
  let category = conf.categoryId && guild.channels.cache.get(conf.categoryId);
  if (!category) category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory, reason: 'MarkaBot: الرومات المؤقتة' });
  let hub = conf.hubId && guild.channels.cache.get(conf.hubId);
  if (!hub) hub = await guild.channels.create({ name: hubName, type: ChannelType.GuildVoice, parent: category.id, reason: 'MarkaBot: الرومات المؤقتة' });
  Object.assign(conf, { enabled: true, hubId: hub.id, categoryId: category.id });
  store.save('tempVoice');
  return { hub, category };
}

function init(client) {
  client.on(Events.VoiceStateUpdate, (o, n) => onVoice(o, n).catch((e) => console.error('[tempvoice]', e.message)));
  client.once(Events.ClientReady, async () => {
    // rooms left empty while the bot was offline
    for (const [cid, r] of Object.entries(rooms())) {
      const g = client.guilds.cache.get(r.gid);
      const ch = g?.channels.cache.get(cid);
      if (!ch) {
        delete rooms()[cid];
        continue;
      }
      await cleanup(ch);
    }
    store.save('tempRooms');
  });
}

module.exports = { init, config, DEFAULT, setup, createRoom, cleanup, onVoice, panel, components: [{ prefix: 'tv:', handle: onComponent }] };
