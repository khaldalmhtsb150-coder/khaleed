const { EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const E = require('./emojis');

// MarkaBot design tokens for Discord. One palette shared with the dashboard and the drawn cards:
// a restrained royal purple for the brand, gold only for wins/premium, and four status colours.
// Pick by meaning (ui.embed('success')), never by mood.
const PALETTE = {
  brand: 0x6e56cf, // royal purple
  info: 0x3e63dd,
  success: 0x30a46c,
  warning: 0xe5a23a,
  danger: 0xe5484d,
  gold: 0xd4a72c,
  pink: 0xd6409f,
  muted: 0x5b6170,
};
const COLOR = PALETTE.brand;
const STATUS_ICON = { success: 'success', danger: 'error', warning: 'warning', info: 'dot' };

const ui = {
  COLOR,
  PALETTE,

  embed(kind = 'brand') {
    return new EmbedBuilder().setColor(PALETTE[kind] ?? COLOR);
  },

  /**
   * The four response styles every command uses: success · danger · warning · info.
   * A compact embed: the status colour on the side, one line (optionally a bold title) and optional fields.
   */
  notice(kind, text, { title = null, fields = [], footer = null } = {}) {
    const icon = kind === 'info' ? require('./art').i('info', E.dot) : E[STATUS_ICON[kind] || 'dot'];
    const e = new EmbedBuilder().setColor(PALETTE[kind] ?? COLOR);
    const body = title ? `${icon} **${title}**${text ? `\n${text}` : ''}` : `${icon} ${text}`;
    e.setDescription(ui.trim(body, 4000));
    if (fields.length) e.addFields(fields.filter(Boolean).map((f) => ({ name: f.name, value: ui.trim(String(f.value || '—'), 1024), inline: f.inline ?? true })));
    if (footer) e.setFooter({ text: footer });
    return e;
  },

  /**
   * A moderation action, one layout for every punishment:
   * `**Banned** @user` + Member / Moderator / Reason fields (+ duration when there is one).
   */
  action({ title, user, moderator, reason, duration = null, kind = 'danger', extra = [] }) {
    const e = new EmbedBuilder()
      .setColor(PALETTE[kind] ?? PALETTE.danger)
      .setDescription(`**${title}**`)
      .addFields(
        { name: 'العضو', value: user ? `${user} \`${user.id || ''}\``.trim() : '—', inline: true },
        { name: 'المشرف', value: moderator ? String(moderator) : '—', inline: true },
        ...(duration ? [{ name: 'المدة', value: String(duration), inline: true }] : []),
        { name: 'السبب', value: ui.trim(String(reason || 'بدون سبب'), 1024), inline: false },
        ...extra
      )
      .setTimestamp();
    if (user?.displayAvatarURL) e.setThumbnail(user.displayAvatarURL({ size: 128 }));
    return e;
  },

  /** `78/100 ▰▰▰▰▰▰▰▱▱▱` style meter for scores. */
  meter(score, max = 100, width = 10) {
    const n = Math.max(0, Math.min(width, Math.round((score / max) * width)));
    return `${'▰'.repeat(n)}${'▱'.repeat(width - n)}`;
  },

  /** One-line minimalist notice: `• text` */
  line(text) {
    return `• ${text}`;
  },

  ok(text) {
    return `${E.success} ${text}`;
  },

  /** Discord subtext */
  hint(text) {
    return `-# ${text}`;
  },

  button(customId, label, { emoji, style = ButtonStyle.Secondary, disabled = false } = {}) {
    const b = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
    const em = emoji ? E.component(emoji) : undefined;
    if (em) b.setEmoji(em);
    return b;
  },

  linkButton(url, label) {
    return new ButtonBuilder().setURL(url).setLabel(label).setStyle(ButtonStyle.Link);
  },

  /** Arabic names for permissions shown in error lines */
  permName(perm) {
    const names = {
      Administrator: 'المسؤول',
      ManageGuild: 'إدارة السيرفر',
      ManageChannels: 'إدارة القنوات',
      ManageRoles: 'إدارة الرتب',
      ManageMessages: 'إدارة الرسائل',
      BanMembers: 'حظر الأعضاء',
      KickMembers: 'طرد الأعضاء',
      ModerateMembers: 'إسكات الأعضاء',
      ManageThreads: 'إدارة الثريدات',
      ViewAuditLog: 'عرض سجل التدقيق',
      CreatePrivateThreads: 'إنشاء ثريدات خاصة',
    };
    return names[perm] || perm;
  },

  trim(text, max = 1024) {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  },

  PermissionFlagsBits,
};

module.exports = ui;
