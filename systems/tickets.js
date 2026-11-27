const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  ButtonStyle,
  AttachmentBuilder,
  Events,
} = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const { canManageGuild } = require('../utils/perms');
const { formatDuration, ts } = require('../utils/time');
const { buildTranscript } = require('./transcript');
const premium = require('../utils/premium');
const gctx = require('../utils/guildContext');

const DEFAULT_DEPARTMENTS = [
  { id: 'support', label: 'الدعم الفني', description: 'المشاكل التقنية والاستفسارات العامة' },
  { id: 'store', label: 'المتجر والمبيعات', description: 'الشراء والطلبات والفواتير' },
  { id: 'partners', label: 'الشراكات والإعلانات', description: 'طلبات الشراكة والإعلان' },
  { id: 'reports', label: 'الشكاوى والاقتراحات', description: 'رفع شكوى أو تقديم اقتراح' },
];

const DEFAULT_CONFIG = {
  categoryId: null,
  logChannelId: null,
  supportRoleId: null,
  maxOpen: 1,
  panelTitle: 'مركز الدعم',
  panelDescription: '',
  bannerUrl: '',
  departments: DEFAULT_DEPARTMENTS,
  counter: 0,
  alertCooldown: 600,
  autoCloseHours: 0, // premium: close tickets with no messages for X hours (0 = off)
};

const DEFAULT_RULES = [
  'افتح تذكرة لسبب واضح وحقيقي.',
  'اشرح طلبك كامل بأول رسالة، هيك الرد بيكون أسرع.',
  'لا تمنشن فريق الدعم، بنرد حسب الدور.',
  'التذكرة اللي بتنترك بدون رد بتنسكّر لحالها.',
];

const config = (guildId) => store.guild('ticketConfig', guildId, DEFAULT_CONFIG);
const ticketsOf = (guildId) => store.guild('tickets', guildId);
const closing = new Set();

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `dept-${Date.now().toString(36)}`;
}

function parseDepartments(text) {
  return String(text)
    .split(/[,،\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25)
    .map((part) => {
      const [label, description] = part.split('|').map((s) => s.trim());
      return { id: slug(label), label: label.slice(0, 80), description: (description || '').slice(0, 100) };
    });
}

function isStaff(member, conf) {
  return canManageGuild(member) || Boolean(conf.supportRoleId && member.roles.cache.has(conf.supportRoleId));
}

function logChannel(guild, conf) {
  const ch = conf.logChannelId ? guild.channels.cache.get(conf.logChannelId) : null;
  return ch?.isTextBased() ? ch : null;
}

function staffStats(guildId, userId) {
  const all = store.guild('staffRatings', guildId);
  if (!all[userId]) all[userId] = { claimed: 0, closed: 0, ratings: [] };
  return all[userId];
}

// ---------- Panel ----------
function buildPanel(guild) {
  const conf = config(guild.id);
  const rules = conf.panelDescription?.trim()
    ? conf.panelDescription
    : DEFAULT_RULES.map((r) => `${E.dot} ${r}`).join('\n');

  const embed = ui
    .embed()
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() || undefined })
    .setTitle(conf.panelTitle || 'مركز الدعم')
    .setDescription('اختار القسم من القائمة تحت، وبتنفتحلك تذكرة خاصة مع فريق الدعم.')
    .addFields({ name: 'قبل ما تفتح', value: ui.trim(rules, 1024) });
  let files = [];
  if (conf.bannerUrl) embed.setImage(conf.bannerUrl);
  else {
    const b = require('../utils/art').banner('tickets');
    if (b) {
      embed.setImage('attachment://tickets.jpg');
      files = [b];
    }
  }

  const departments = (conf.departments?.length ? conf.departments : DEFAULT_DEPARTMENTS).slice(0, premium.limit(guild.id, 'ticketDepartments'));
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_open')
    .setPlaceholder('اختر قسم التذكرة')
    .addOptions(
      departments.slice(0, 25).map((d) => {
        const opt = { label: d.label, value: d.id };
        if (d.description) opt.description = d.description;
        const em = parseEmoji(d.emoji) || E.component('ticket');
        if (em) opt.emoji = em;
        return opt;
      })
    );
  return { embeds: [embed], files, components: [new ActionRowBuilder().addComponents(menu)] };
}

function parseEmoji(value) {
  const m = String(value || '').match(/^<(a?):(\w+):(\d+)>$/);
  return m ? { id: m[3], name: m[2], animated: m[1] === 'a' } : undefined;
}

/** The first message of a ticket. Rebuilt on claim so the status line stays true. */
function openEmbed(guild, record) {
  const ai = require('./aiStaff').ticketLine(guild.id);
  return ui
    .embed(record.claimedBy ? 'info' : 'brand')
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() || undefined })
    .setTitle(`تذكرة #${String(record.number).padStart(4, '0')}`)
    .setDescription(
      [`أهلاً <@${record.ownerId}>، اكتب طلبك بالتفصيل وابعت أي صور أو روابط بتساعد. حدا من الفريق رح يرد عليك بأقرب وقت.`, ai ? `\n${ai}` : null]
        .filter((x) => x !== null)
        .join('\n')
    )
    .addFields(
      { name: 'القسم', value: record.department || '—', inline: true },
      { name: 'فُتحت', value: ts(record.openedAt), inline: true },
      { name: 'الحالة', value: record.claimedBy ? `مع <@${record.claimedBy}>` : 'بانتظار الفريق', inline: true }
    )
    .setFooter({ text: 'للإغلاق استخدم زر «إغلاق» تحت' });
}

function controlRow(record) {
  return new ActionRowBuilder().addComponents(
    ui.button('ticket_claim', record.claimedName ? `مستلمة: ${record.claimedName}`.slice(0, 80) : 'استلام التذكرة', {
      emoji: 'crown',
      disabled: Boolean(record.claimedBy),
    }),
    ui.button('ticket_manage', 'إدارة التذكرة', { emoji: 'settings' }),
    ui.button('ticket_close', 'إغلاق التذكرة', { emoji: 'lock' })
  );
}

// ---------- Open ----------
const departmentsOf = (guildId, conf) =>
  (conf.departments?.length ? conf.departments : DEFAULT_DEPARTMENTS).slice(0, premium.limit(guildId, 'ticketDepartments'));

function openTicketsOf(guild, userId) {
  return Object.values(ticketsOf(guild.id)).filter((t) => t.status === 'open' && t.ownerId === userId && guild.channels.cache.has(t.channelId));
}

/** Select menu on the panel: either opens straight away, or shows the department's form first (premium). */
async function onOpenSelect(interaction) {
  const { guild, user } = interaction;
  const conf = config(guild.id);
  const dept = departmentsOf(guild.id, conf).find((d) => d.id === interaction.values[0]);
  const questions = premium.has(guild.id, 'ticketForms') ? dept?.questions || [] : [];

  if (dept && questions.length) {
    const category = conf.categoryId ? guild.channels.cache.get(conf.categoryId) : null;
    if (!category) return interaction.reply({ content: '• نظام التذاكر لسا مش مركّب، احكي مع الإدارة.', ephemeral: true });
    const open = openTicketsOf(guild, user.id);
    if (open.length >= Math.min(conf.maxOpen || 1, premium.limit(guild.id, 'ticketMaxOpen')))
      return interaction.reply({ content: `• عندك تذكرة مفتوحة: <#${open[0].channelId}>`, ephemeral: true });

    const modalForm = new ModalBuilder().setCustomId(`ticket_form_${dept.id}`.slice(0, 100)).setTitle(dept.label.slice(0, 45));
    questions.slice(0, 5).forEach((q, i) =>
      modalForm.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(`q${i}`).setLabel(q.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
        )
      )
    );
    await interaction.showModal(modalForm);
    interaction.message.edit({ components: interaction.message.components.map((r) => ActionRowBuilder.from(r)) }).catch(() => {});
    return;
  }
  return openTicket(interaction, dept || { label: 'عام', id: 'general' }, null);
}

async function onForm(interaction) {
  const conf = config(interaction.guild.id);
  const deptId = interaction.customId.slice('ticket_form_'.length);
  const dept = departmentsOf(interaction.guild.id, conf).find((d) => d.id === deptId) || { label: 'عام', id: 'general', questions: [] };
  const answers = (dept.questions || []).slice(0, 5).map((q, i) => {
    let a = '';
    try {
      a = interaction.fields.getTextInputValue(`q${i}`);
    } catch {}
    return { q, a };
  });
  return openTicket(interaction, dept, answers);
}

async function openTicket(interaction, dept, answers) {
  const { guild, user } = interaction;
  await interaction.deferReply({ ephemeral: true });

  // reset the panel select so the same option can be chosen again
  if (!answers && interaction.message) {
    interaction.message
      .edit({ components: interaction.message.components.map((r) => ActionRowBuilder.from(r)) })
      .catch(() => {});
  }

  const conf = config(guild.id);
  const category = conf.categoryId ? guild.channels.cache.get(conf.categoryId) : null;
  if (!category) return interaction.editReply('• نظام التذاكر لسا مش مركّب، احكي مع الإدارة.');

  const all = ticketsOf(guild.id);
  const open = openTicketsOf(guild, user.id);
  if (open.length >= Math.min(conf.maxOpen || 1, premium.limit(guild.id, 'ticketMaxOpen'))) {
    return interaction.editReply(`• عندك تذكرة مفتوحة: <#${open[0].channelId}>`);
  }

  conf.counter = (conf.counter || 0) + 1;
  store.save('ticketConfig');
  const number = conf.counter;
  const name = `ticket-${String(number).padStart(4, '0')}`;

  const allowUser = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
  ];
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: allowUser },
    { id: guild.members.me.id, allow: [...allowUser, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];
  if (conf.supportRoleId && guild.roles.cache.has(conf.supportRoleId)) overwrites.push({ id: conf.supportRoleId, allow: allowUser });

  let channel;
  try {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `${dept.label} · ${user.id}`,
      permissionOverwrites: overwrites,
    });
  } catch (err) {
    console.error('[tickets] create', err.message);
    return interaction.editReply('• ما قدرت أفتح التذكرة، تأكد إنه البوت معه صلاحية إدارة القنوات.');
  }

  const record = {
    number,
    channelId: channel.id,
    ownerId: user.id,
    department: dept.label,
    claimedBy: null,
    claimedName: null,
    openedAt: Date.now(),
    lastMessageAt: Date.now(),
    status: 'open',
  };
  if (answers?.length) record.answers = answers.map(({ q, a }) => ({ q: String(q).slice(0, 100), a: String(a || '').slice(0, 300) }));
  all[channel.id] = record;
  store.save('tickets');
  bumpStats(guild.id, (st) => {
    st.opened++;
    st.byDept[dept.label] = (st.byDept[dept.label] || 0) + 1;
  });

  const embed = openEmbed(guild, record);

  const embeds = [embed];
  if (answers?.length) {
    const form = ui.embed().setTitle('إجابات النموذج');
    for (const { q, a } of answers) form.addFields({ name: ui.trim(q, 256), value: ui.trim(a || '—', 1024) });
    embeds.push(form);
  }

  await channel.send({
    content: `${user}${conf.supportRoleId ? ` <@&${conf.supportRoleId}>` : ''}`,
    embeds,
    components: [controlRow(record)],
    allowedMentions: { users: [user.id], roles: conf.supportRoleId ? [conf.supportRoleId] : [] },
  });

  // premium shop department (only in the shop server)
  if (dept.shop) await require('./shop').openPanel(channel, user).catch((e) => console.error('[shop] panel', e.message));

  logChannel(guild, conf)
    ?.send({
      embeds: [
        ui
          .embed()
          .setTitle(`تذكرة جديدة #${String(record.number).padStart(4, '0')}`)
          .addFields({ name: 'الروم', value: `${channel}`, inline: true }, { name: 'القسم', value: dept.label, inline: true }, { name: 'صاحبها', value: `${user}`, inline: true })
          .setTimestamp(),
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() => {});

  return interaction.editReply({ embeds: [ui.notice('success', `انفتحت تذكرتك: ${channel}`)] });
}

// ---------- Claim ----------
async function claim(interaction, record, conf) {
  if (!isStaff(interaction.member, conf)) return interaction.reply({ content: '• استلام التذاكر لفريق الدعم بس.', ephemeral: true });
  if (record.claimedBy) return interaction.reply({ content: `• هالتذكرة مستلمها <@${record.claimedBy}>.`, ephemeral: true, allowedMentions: { parse: [] } });

  record.claimedBy = interaction.user.id;
  record.claimedName = interaction.member.displayName;
  record.claimedAt = Date.now();
  staffStats(interaction.guild.id, interaction.user.id).claimed++;
  store.save('tickets');
  store.save('staffRatings');

  const ch = interaction.channel;
  if (conf.supportRoleId) {
    await ch.permissionOverwrites
      .edit(conf.supportRoleId, { ViewChannel: true, SendMessages: false })
      .catch(() => {});
  }
  await ch.permissionOverwrites
    .edit(interaction.user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true })
    .catch(() => {});

  const first = interaction.message?.embeds?.length ? [openEmbed(interaction.guild, record), ...interaction.message.embeds.slice(1)] : undefined;
  await interaction.update({ components: [controlRow(record)], ...(first ? { embeds: first } : {}) });
  await ch.send({ embeds: [ui.notice('info', `معك ${interaction.user} من فريق الدعم، كيف بقدر أساعدك؟`)], allowedMentions: { parse: [] } });

  logChannel(interaction.guild, conf)
    ?.send({
      embeds: [
        ui
          .embed('info')
          .setTitle(`استلام تذكرة #${String(record.number).padStart(4, '0')}`)
          .addFields({ name: 'الروم', value: `${ch}`, inline: true }, { name: 'المستلم', value: `${interaction.user}`, inline: true })
          .setTimestamp(),
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
}

// ---------- Close ----------
async function askClose(interaction, record, conf) {
  if (interaction.user.id !== record.ownerId && !isStaff(interaction.member, conf))
    return interaction.reply({ content: '• ما بتقدر تسكّر هالتذكرة.', ephemeral: true });
  const row = new ActionRowBuilder().addComponents(
    ui.button('ticket_close_confirm', 'أيوا سكّرها', { emoji: 'lock', style: ButtonStyle.Danger }),
    ui.button('ticket_close_cancel', 'لا، خليها')
  );
  return interaction.reply({ embeds: [ui.notice('warning', 'بنحفظ نسخة كاملة من المحادثة قبل ما تنحذف الروم.', { title: 'أكيد بدك تسكّر التذكرة؟' })], components: [row], ephemeral: true });
}

async function closeTicket(channel, record, closer) {
  if (closing.has(channel.id)) return;
  closing.add(channel.id);
  const { guild } = channel;
  const conf = config(guild.id);

  record.status = 'closed';
  record.closedBy = closer.id;
  record.closedAt = Date.now();
  if (record.claimedBy) staffStats(guild.id, record.claimedBy).closed++;
  store.save('tickets');
  store.save('staffRatings');
  bumpStats(guild.id, (st) => {
    st.closed++;
    st.totalDuration += record.closedAt - record.openedAt;
    if (closer.id === guild.client.user.id) st.autoClosed++;
  });

  await channel.send({ embeds: [ui.notice('warning', 'التذكرة رح تتسكّر خلال 5 ثواني. شكراً إنك تواصلت معنا.')], allowedMentions: { parse: [] } }).catch(() => {});
  // let the AI assistant read what the team taught here before the channel goes away
  await require('./aiStaff').learnFromTicket(channel, record).catch(() => {});

  const opener = await guild.client.users.fetch(record.ownerId).catch(() => null);
  let transcript = null;
  try {
    transcript = await buildTranscript(channel, {
      department: record.department,
      opener: opener?.username,
      claimer: record.claimedName,
    });
  } catch (err) {
    console.error('[tickets] transcript', err.message);
  }
  const fileName = `transcript-${channel.name}.html`;
  const duration = formatDuration(record.closedAt - record.openedAt);

  const summary = ui
    .embed('muted')
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() || undefined })
    .setTitle(`إغلاق تذكرة #${String(record.number).padStart(4, '0')}`)
    .addFields(
      { name: 'صاحب التذكرة', value: `<@${record.ownerId}>`, inline: true },
      { name: 'المستلم', value: record.claimedBy ? `<@${record.claimedBy}>` : 'ما انستلمت', inline: true },
      { name: 'أغلقها', value: `<@${closer.id}>`, inline: true },
      { name: 'القسم', value: record.department || '—', inline: true },
      { name: 'المدة', value: duration, inline: true },
      { name: 'الرسائل', value: transcript ? `${transcript.count}` : '—', inline: true }
    )
    .setFooter({ text: channel.name })
    .setTimestamp();

  const card = await require('../utils/cards')
    .ticketCard({
      number: record.number,
      department: record.department,
      owner: opener?.globalName || opener?.username || '—',
      claimer: record.claimedName || null,
      minutes: Math.max(1, Math.round((record.closedAt - record.openedAt) / 60000)),
      messages: transcript?.count,
    })
    .catch(() => null);
  const cardFile = () => (card ? [new AttachmentBuilder(card, { name: 'ticket.png' })] : []);
  if (card) summary.setImage('attachment://ticket.png');
  const log = logChannel(guild, conf);
  if (log) {
    await log
      .send({
        embeds: [summary],
        files: [...cardFile(), ...(transcript ? [new AttachmentBuilder(transcript.buffer, { name: fileName })] : [])],
        allowedMentions: { parse: [] },
      })
      .catch((e) => console.error('[tickets] log', e.message));
  }

  // who gets rated: the claimer, or else the staff member who closed it (not the opener, not a bot)
  const closerUser = await guild.client.users.fetch(record.closedBy).catch(() => null);
  record.servedBy = record.claimedBy || (record.closedBy && record.closedBy !== record.ownerId && !closerUser?.bot ? record.closedBy : null);
  store.save('tickets');
  const served = record.servedBy;

  if (opener) {
    const dm = ui
      .embed('muted')
      .setAuthor({ name: guild.name, iconURL: guild.iconURL() || undefined })
      .setTitle(`تذكرتك #${String(record.number).padStart(4, '0')} انسكّرت`)
      .setDescription(served ? 'كيف كانت الخدمة؟ قيّمها من الأزرار تحت.' : null)
      .addFields(
        { name: 'القسم', value: record.department || '—', inline: true },
        { name: 'المدة', value: duration, inline: true },
        ...(served ? [{ name: 'ساعدك', value: `<@${served}>`, inline: true }] : [])
      )
      .setFooter({ text: 'نسخة المحادثة مرفقة مع الرسالة' });
    const components = [];
    if (served) {
      const row = new ActionRowBuilder();
      for (let n = 1; n <= 5; n++) {
        row.addComponents(ui.button(`ticket_rate_${guild.id}_${channel.id}_${n}`, `${n}`, { emoji: 'star' }));
      }
      components.push(row);
    }
    if (card) dm.setImage('attachment://ticket.png');
    await opener
      .send({
        embeds: [dm],
        components,
        files: [...cardFile(), ...(transcript ? [new AttachmentBuilder(transcript.buffer, { name: fileName })] : [])],
      })
      .catch(() => {
        // DMs closed: tell the staff in the log channel instead of failing silently
        if (log) log.send({ embeds: [ui.notice('warning', `ما قدرت أبعت ملخص التذكرة #${String(record.number).padStart(4, '0')}${served ? ' وطلب التقييم' : ''} لـ <@${record.ownerId}>، الخاص عنده مسكّر.`)], allowedMentions: { parse: [] } }).catch(() => {});
      });
  }

  setTimeout(() => {
    channel.delete('Ticket closed').catch(() => {});
    closing.delete(channel.id);
  }, 5000);

  // prune closed tickets older than 30 days
  const all = ticketsOf(guild.id);
  const cutoff = Date.now() - 30 * 86_400_000;
  for (const [id, t] of Object.entries(all)) if (t.status === 'closed' && t.closedAt < cutoff) delete all[id];
  store.save('tickets');
}

// ---------- Manage ----------
function manageMenu() {
  const options = [
    { label: 'إضافة عضو للتذكرة', value: 'add', description: 'منح عضو صلاحية رؤية التذكرة' },
    { label: 'إزالة عضو من التذكرة', value: 'remove', description: 'سحب صلاحية عضو من التذكرة' },
    { label: 'إعادة تسمية التذكرة', value: 'rename', description: 'تغيير اسم قناة التذكرة' },
    { label: 'استدعاء العضو في الخاص', value: 'alert', description: 'إرسال تنبيه لصاحب التذكرة' },
  ];
  const map = { add: 'success', remove: 'error', rename: 'edit', alert: 'announce' };
  for (const o of options) {
    const em = E.component(map[o.value]);
    if (em) o.emoji = em;
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('ticket_manage_select').setPlaceholder('اختر الإجراء').addOptions(options)
  );
}

function modal(id, title, label, placeholder) {
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel(label).setPlaceholder(placeholder).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(90)
      )
    );
}

async function onManageSelect(interaction, record, conf) {
  if (!isStaff(interaction.member, conf)) return interaction.reply({ content: '• هالقائمة لفريق الدعم بس.', ephemeral: true });
  const choice = interaction.values[0];
  if (choice === 'add') return interaction.showModal(modal('ticket_modal_add', 'إضافة عضو', 'آيدي العضو أو منشن', '123456789012345678'));
  if (choice === 'remove') return interaction.showModal(modal('ticket_modal_remove', 'إزالة عضو', 'آيدي العضو أو منشن', '123456789012345678'));
  if (choice === 'rename') return interaction.showModal(modal('ticket_modal_rename', 'إعادة تسمية', 'الاسم الجديد', 'ticket-vip'));

  if (choice === 'alert') {
    const cd = (conf.alertCooldown || 600) * 1000;
    if (record.lastAlert && Date.now() - record.lastAlert < cd) {
      return interaction.update({ content: `• بعتنا تنبيه قبل شوي، بتقدر تبعت كمان واحد ${ts(record.lastAlert + cd)}.`, components: [] });
    }
    const user = await interaction.client.users.fetch(record.ownerId).catch(() => null);
    const embed = ui
      .embed()
      .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() || undefined })
      .setTitle('تذكرتك بتستنى ردك')
      .setDescription(`${interaction.user} من فريق الدعم بيستناك بـ ${interaction.channel}.`)
      .setFooter({ text: 'اكبس الزر وبتروح عليها مباشرة' });
    const sent = await user
      ?.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(ui.linkButton(interaction.channel.url, 'الانتقال للتذكرة'))] })
      .catch(() => null);
    if (!sent) return interaction.update({ content: '• ما قدرت أبعتله، الخاص عنده مسكّر.', components: [] });
    record.lastAlert = Date.now();
    store.save('tickets');
    await interaction.channel.send({ embeds: [ui.notice('info', `انبعت تنبيه لـ <@${record.ownerId}> بالخاص.`)], allowedMentions: { parse: [] } });
    return interaction.update({ content: `${E.success} انبعت التنبيه.`, components: [] });
  }
}

async function onModal(interaction, record, conf) {
  if (!isStaff(interaction.member, conf)) return interaction.reply({ content: '• هاي لفريق الدعم بس.', ephemeral: true });
  const value = interaction.fields.getTextInputValue('value').trim();
  const ch = interaction.channel;
  const kind = interaction.customId.replace('ticket_modal_', '');

  if (kind === 'rename') {
    const name = value.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 90);
    if (!name) return interaction.reply({ content: '• الاسم مش زابط.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const ok = await Promise.race([
      ch.setName(name).then(() => true).catch(() => false),
      new Promise((r) => setTimeout(() => r('slow'), 4000)),
    ]);
    if (ok === 'slow') return interaction.editReply('• الاسم رح يتغير خلال دقايق، لأنه ديسكورد بيحدد كم مرة بتقدر تغيّر الأسماء.');
    if (!ok) return interaction.editReply('• ما قدرت أغيّر الاسم.');
    await ch.send({ embeds: [ui.notice('info', `${interaction.user} غيّر اسم التذكرة لـ \`${name}\`.`)], allowedMentions: { parse: [] } });
    return interaction.editReply(`${E.success} تم.`);
  }

  const id = (value.match(/\d{17,21}/) || [])[0];
  const member = id && (await interaction.guild.members.fetch(id).catch(() => null));
  if (!member) return interaction.reply({ content: '• ما لقيت العضو.', ephemeral: true });

  if (kind === 'add') {
    await ch.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
    await interaction.reply({ embeds: [ui.notice('success', `انضاف ${member} للتذكرة.`)], allowedMentions: { users: [member.id] } });
  } else if (kind === 'remove') {
    if (member.id === record.ownerId) return interaction.reply({ content: '• ما بتقدر تشيل صاحب التذكرة.', ephemeral: true });
    await ch.permissionOverwrites.delete(member.id).catch(() => {});
    await interaction.reply({ embeds: [ui.notice('info', `انشال ${member} من التذكرة.`)], allowedMentions: { parse: [] } });
  }
}

// ---------- Rating (DM) ----------
async function onRate(interaction) {
  const [, , guildId, channelId, starsRaw] = interaction.customId.split('_');
  const stars = Math.min(5, Math.max(1, parseInt(starsRaw, 10)));
  const record = store.peek('tickets', guildId)?.[channelId];

  const disabledRows = interaction.message.components.map((row) => {
    const r = ActionRowBuilder.from(row);
    r.components.forEach((c) => c.setDisabled(true));
    return r;
  });

  const servedBy = record?.servedBy || record?.claimedBy;
  if (!record || record.rated || !servedBy) {
    return interaction.update({ components: disabledRows, content: record?.rated ? '• قيّمت هالتذكرة من قبل، شكراً.' : '• هالتذكرة ما عاد فيك تقيّمها.' });
  }
  record.rated = stars;
  store.save('tickets');

  const stats = staffStats(guildId, servedBy);
  stats.ratings.push({ stars, ticket: record.number, by: interaction.user.id, at: Date.now() });
  store.save('staffRatings');

  await interaction.update({
    content: `شكراً على تقييمك: ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`,
    components: disabledRows,
  });

  const guild = interaction.client.guilds.cache.get(guildId);
  const log = guild && logChannel(guild, config(guildId));
  log
    ?.send({
      embeds: [
        ui
          .embed(stars >= 4 ? 'success' : stars <= 2 ? 'warning' : 'brand')
          .setTitle(`تقييم تذكرة #${String(record.number).padStart(4, '0')}`)
          .addFields(
            { name: 'التقييم', value: `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} · ${stars}/5`, inline: true },
            { name: 'الموظف', value: `<@${servedBy}>`, inline: true },
            { name: 'من', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setTimestamp(),
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
}

// ---------- Analytics (premium) ----------
const STATS_DEFAULT = { opened: 0, closed: 0, autoClosed: 0, totalDuration: 0, responses: 0, totalResponse: 0, byDept: {} };

function bumpStats(guildId, fn) {
  fn(store.guild('ticketStats', guildId, STATS_DEFAULT));
  store.save('ticketStats');
}

function analytics(guildId) {
  const st = { ...STATS_DEFAULT, ...(store.peek('ticketStats', guildId) || {}) };
  const records = Object.values(store.peek('tickets', guildId) || {});
  const now = Date.now();
  const since = (days) => records.filter((t) => t.openedAt > now - days * 86_400_000).length;
  const ratings = Object.values(store.peek('staffRatings', guildId) || {}).flatMap((s) => s.ratings || []);
  return {
    opened: st.opened,
    closed: st.closed,
    autoClosed: st.autoClosed,
    open: records.filter((t) => t.status === 'open').length,
    last7: since(7),
    last30: since(30),
    avgDuration: st.closed ? Math.round(st.totalDuration / st.closed) : 0,
    avgFirstResponse: st.responses ? Math.round(st.totalResponse / st.responses) : 0,
    avgRating: ratings.length ? ratings.reduce((a, r) => a + r.stars, 0) / ratings.length : 0,
    ratings: ratings.length,
    byDept: Object.entries(st.byDept)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ---------- Activity + auto close (premium) ----------
async function onMessage(message) {
  if (!message.guild || message.author.bot) return;
  const record = store.peek('tickets', message.guild.id)?.[message.channelId];
  if (!record || record.status !== 'open') return;
  record.lastMessageAt = Date.now();
  record.autoWarnedAt = null;
  if (!record.firstResponseAt && message.author.id !== record.ownerId && message.member && isStaff(message.member, config(message.guild.id))) {
    record.firstResponseAt = Date.now();
    bumpStats(message.guild.id, (st) => {
      st.responses++;
      st.totalResponse += record.firstResponseAt - record.openedAt;
    });
  }
  store.save('tickets');
}

const WARN_BEFORE = 3_600_000; // warn 1 hour before closing

async function autoCloseTick(client) {
  const all = store.get('tickets');
  for (const [guildId, list] of Object.entries(all)) {
    if (!premium.has(guildId, 'ticketAutoClose')) continue;
    const hours = store.peek('ticketConfig', guildId)?.autoCloseHours || 0;
    if (!hours) continue;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    await gctx.run(guildId, async () => {
      for (const record of Object.values(list)) {
        if (record.status !== 'open') continue;
        const channel = guild.channels.cache.get(record.channelId);
        if (!channel) continue;
        const idle = Date.now() - (record.lastMessageAt || record.openedAt);
        if (!record.autoWarnedAt && idle >= hours * 3_600_000 - WARN_BEFORE) {
          record.autoWarnedAt = Date.now();
          store.save('tickets');
          await channel
            .send({
              content: `<@${record.ownerId}>`,
              embeds: [ui.notice('warning', `التذكرة صارلها فترة بدون رد، ورح تتسكّر لحالها ${ts(record.autoWarnedAt + WARN_BEFORE)} إذا ما في رد.`)],
              allowedMentions: { users: [record.ownerId] },
            })
            .catch(() => {});
        } else if (record.autoWarnedAt && Date.now() - record.autoWarnedAt >= WARN_BEFORE) {
          await channel.send({ embeds: [ui.notice('warning', 'انسكّرت التذكرة لحالها لأنه ما في رد.')] }).catch(() => {});
          await closeTicket(channel, record, client.user).catch((e) => console.error('[tickets] auto-close', e.message));
        }
      }
    });
  }
}

function init(client) {
  client.on(Events.MessageCreate, (m) => onMessage(m).catch(() => {}));
  client.once(Events.ClientReady, () => {
    setInterval(() => autoCloseTick(client).catch((e) => console.error('[tickets] auto-close', e.message)), 5 * 60_000).unref();
  });
}

// ---------- Router ----------
async function route(interaction) {
  const id = interaction.customId;
  if (id.startsWith('ticket_rate_')) return onRate(interaction);
  if (!interaction.guild) return;
  if (id === 'ticket_open') return onOpenSelect(interaction);
  if (id.startsWith('ticket_form_')) return onForm(interaction);

  const conf = config(interaction.guild.id);
  const record = ticketsOf(interaction.guild.id)[interaction.channelId];
  if (!record || record.status !== 'open') return interaction.reply({ content: '• هالروم مش تذكرة مفتوحة.', ephemeral: true });

  switch (id) {
    case 'ticket_claim':
      return claim(interaction, record, conf);
    case 'ticket_close':
      return askClose(interaction, record, conf);
    case 'ticket_close_cancel':
      return interaction.update({ content: '• تمام، التذكرة لسا مفتوحة.', components: [] });
    case 'ticket_close_confirm':
      await interaction.update({ content: `${E.lock} عم تتسكّر…`, components: [] });
      return closeTicket(interaction.channel, record, interaction.user);
    case 'ticket_manage':
      if (!isStaff(interaction.member, conf)) return interaction.reply({ content: '• إدارة التذكرة لفريق الدعم بس.', ephemeral: true });
      return interaction.reply({ content: `${E.settings} شو بدك تعمل؟`, components: [manageMenu()], ephemeral: true });
    case 'ticket_manage_select':
      return onManageSelect(interaction, record, conf);
    default:
      if (id.startsWith('ticket_modal_')) return onModal(interaction, record, conf);
  }
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_DEPARTMENTS,
  config,
  parseDepartments,
  buildPanel,
  staffStats,
  isStaff,
  closeTicket,
  analytics,
  init,
  components: [{ prefix: 'ticket_', type: 'any', handle: route }],
};
