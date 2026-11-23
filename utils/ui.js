const { EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const E = require('./emojis');

const COLOR = 0x2b2d31;

const ui = {
  COLOR,

  embed() {
    return new EmbedBuilder().setColor(COLOR);
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
