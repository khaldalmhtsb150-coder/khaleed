const { EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const E = require('./emojis');

// One palette for every message, so the bot reads as one product: a teal brand, a gold for wins and
// premium, and clear status colours. Pick by meaning (ui.embed('success')), never by mood.
const PALETTE = {
  brand: 0x14b8a6,
  info: 0x3b82f6,
  success: 0x22c55e,
  warning: 0xf59e0b,
  danger: 0xef4444,
  gold: 0xeab308,
  pink: 0xec4899,
  muted: 0x64748b,
};
const COLOR = PALETTE.brand;

const ui = {
  COLOR,
  PALETTE,

  embed(kind = 'brand') {
    return new EmbedBuilder().setColor(PALETTE[kind] ?? COLOR);
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
