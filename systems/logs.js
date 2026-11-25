// Server logs. Two sources:
//  1) the audit-log stream (GuildAuditLogEntryCreate): every admin action with WHO did it, the target,
//     the reason and the exact changes (old → new) — channels, roles, permissions, server settings,
//     bans/kicks/timeouts, nicknames, role grants, emojis, stickers, invites, webhooks, bots,
//     integrations, threads, events, AutoMod rules… unknown future actions still get a generic entry.
//  2) gateway events the audit log doesn't cover: joins/leaves, deleted/edited messages (with content,
//     attachments, ghost pings, bulk-delete transcripts), voice activity, boosts, username/avatar changes,
//     AutoMod hits and the bot's own commands.
// Each type can go to its own channel, by group, or all in one — picked by hand or created by the bot.
const { Events, AuditLogEvent, ChannelType, PermissionsBitField, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const { ts } = require('../utils/time');

const LOG_GROUPS = {
  members: { label: 'الأعضاء', channel: 'سجل-الأعضاء' },
  messages: { label: 'الرسائل', channel: 'سجل-الرسائل' },
  moderation: { label: 'العقوبات والحماية', channel: 'سجل-العقوبات' },
  server: { label: 'السيرفر', channel: 'سجل-السيرفر' },
  voice: { label: 'الصوت', channel: 'سجل-الصوت' },
  bot: { label: 'البوت', channel: 'سجل-البوت' },
};

const LOG_TYPES = {
  member_join: { group: 'members', label: 'دخول الأعضاء', icon: 'userplus', emoji: 'joinLeave', channel: 'سجل-الدخول' },
  member_leave: { group: 'members', label: 'خروج الأعضاء', icon: 'door', emoji: 'joinLeave', channel: 'سجل-الخروج' },
  member_update: { group: 'members', label: 'الألقاب والأسماء والصور', icon: 'rename', emoji: 'edit', channel: 'سجل-الأعضاء' },
  role_changes: { group: 'members', label: 'إعطاء وسحب الرتب', icon: 'players', emoji: 'roles', channel: 'سجل-رتب-الأعضاء' },
  boosts: { group: 'members', label: 'البوستات', icon: 'sparkles', emoji: 'star', channel: 'سجل-البوستات' },
  message_delete: { group: 'messages', label: 'الرسائل المحذوفة', icon: 'cancel', emoji: 'delete', channel: 'سجل-المحذوف' },
  message_edit: { group: 'messages', label: 'الرسائل المعدلة والمثبتة', icon: 'rename', emoji: 'edit', channel: 'سجل-التعديلات' },
  moderation_actions: { group: 'moderation', label: 'العقوبات: حظر، طرد، تايم أوت، تحذير', icon: 'kick', emoji: 'ban', channel: 'سجل-العقوبات' },
  automod: { group: 'moderation', label: 'الأوتومود وقواعده', icon: 'shield', emoji: 'shield', channel: 'سجل-الأوتومود' },
  channel_changes: { group: 'server', label: 'القنوات وصلاحياتها', icon: 'tasks', emoji: 'settings', channel: 'سجل-القنوات' },
  server_roles: { group: 'server', label: 'إنشاء وتعديل وحذف الرتب', icon: 'crown', emoji: 'roles', channel: 'سجل-الرتب' },
  server_updates: { group: 'server', label: 'إعدادات السيرفر', icon: 'repair', emoji: 'settings', channel: 'سجل-الإعدادات' },
  emojis_stickers: { group: 'server', label: 'الإيموجي والملصقات والأصوات', icon: 'star', emoji: 'star', channel: 'سجل-الإيموجي' },
  invites: { group: 'server', label: 'روابط الدعوة', icon: 'mail', emoji: 'announce', channel: 'سجل-الدعوات' },
  integrations: { group: 'server', label: 'البوتات والويب هوك والتكاملات', icon: 'zap', emoji: 'settings', channel: 'سجل-البوتات' },
  threads: { group: 'server', label: 'الثريدات', icon: 'chat', emoji: 'edit', channel: 'سجل-الثريدات' },
  events: { group: 'server', label: 'الفعاليات والستيج', icon: 'party', emoji: 'timer', channel: 'سجل-الفعاليات' },
  voice_changes: { group: 'voice', label: 'الرومات الصوتية', icon: 'voice', emoji: 'voice', channel: 'سجل-الصوت' },
  bot_commands: { group: 'bot', label: 'أوامر البوت المستخدمة', icon: 'list', emoji: 'settings', channel: 'سجل-الأوامر' },
  ticket_logs: { group: 'bot', label: 'التذاكر', icon: 'ticket', emoji: 'ticket', channel: 'سجل-التذاكر' },
};
// keys from the old version → still honoured until the server picks new channels
const LEGACY = { member_join: 'member_join_leave', member_leave: 'member_join_leave', message_delete: 'message_edit_delete', message_edit: 'message_edit_delete', member_update: 'nickname_changes', server_roles: 'channel_changes' };
const LOG_CATEGORY = 'السجلات';
const OLD_CATEGORY = '📋 سجلات ماركا';

const COLORS = { create: 0x2fd27a, delete: 0xff5d6c, update: 0xffb02e, info: 0x7c86ff, mod: 0xd42d43 };

// ---------- channels ----------
function channelFor(guild, type) {
  const conf = store.peek('logsConfig', guild.id);
  if (!conf) return null;
  const id = conf[type] || (LEGACY[type] && !(type in conf) ? conf[LEGACY[type]] : null);
  if (!id) return null;
  const ch = guild.channels.cache.get(id);
  return ch?.isTextBased() ? ch : null;
}

async function send(guild, type, payload) {
  const ch = channelFor(guild, type);
  if (!ch) return null;
  const data = payload?.data ? { embeds: [payload] } : payload;
  return ch.send({ allowedMentions: { parse: [] }, ...data }).catch((e) => console.error(`[logs:${type}]`, e.message));
}

/**
 * Creates log channels, hidden from members (staff with Manage Server / the manager role can see them).
 * mode 'separate' → one channel per type, 'grouped' → one per group, 'single' → one for everything.
 */
async function autoSetup(guild, { mode = 'separate', overwrite = false } = {}) {
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
  let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && (c.name === LOG_CATEGORY || c.name === OLD_CATEGORY));
  if (category && category.name !== LOG_CATEGORY) await category.setName(LOG_CATEGORY).catch(() => {});
  if (!category) category = await guild.channels.create({ name: LOG_CATEGORY, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: 'MarkaBot: إنشاء رومات السجلات' });

  const todo = Object.keys(LOG_TYPES).filter((k) => overwrite || !channelFor(guild, k));
  const made = [];
  const byName = new Map();
  const get = async (name) => {
    if (byName.has(name)) return byName.get(name);
    const existing = guild.channels.cache.find((c) => c.parentId === category.id && c.name === name);
    const ch = existing || (await guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites, reason: 'MarkaBot: إنشاء رومات السجلات' }));
    if (!existing) made.push(ch);
    byName.set(name, ch);
    return ch;
  };
  // channels made by the old version (emoji names) are renamed instead of duplicated
  if (!overwrite) {
    for (const k of Object.keys(LOG_TYPES)) {
      const ch = channelFor(guild, k);
      const want = LOG_TYPES[k].channel;
      if (ch && ch.parentId === category.id && /・/.test(ch.name) && mode === 'separate') await ch.setName(want).catch(() => {});
    }
  }
  for (const k of todo) {
    const name = mode === 'single' ? 'كل-السجلات' : mode === 'grouped' ? LOG_GROUPS[LOG_TYPES[k].group].channel : LOG_TYPES[k].channel;
    conf[k] = (await get(name)).id;
  }
  for (const old of new Set(Object.values(LEGACY))) if (old in conf && !(old in LOG_TYPES)) delete conf[old];
  store.save('logsConfig');
  const warn = me.permissions.has(PermissionFlagsBits.ViewAuditLog) ? null : 'البوت ما معه صلاحية View Audit Log، فما رح يعرف مين عمل الإجراءات.';
  return { category, made, set: todo.length, skipped: Object.keys(LOG_TYPES).length - todo.length, warn };
}

// ---------- formatting ----------
const KEY_AR = {
  name: 'الاسم', topic: 'الوصف', description: 'الوصف', nsfw: 'محتوى +18', rate_limit_per_user: 'السلومود', default_thread_rate_limit_per_user: 'سلومود الثريدات',
  position: 'الترتيب', parent_id: 'الكاتيقوري', bitrate: 'جودة الصوت', user_limit: 'حد الأعضاء', rtc_region: 'منطقة الصوت', video_quality_mode: 'جودة الفيديو',
  permissions: 'الصلاحيات', allow: 'صلاحيات مسموحة', deny: 'صلاحيات ممنوعة', color: 'اللون', colors: 'الألوان', hoist: 'عرض منفصل', mentionable: 'قابلة للمنشن',
  icon_hash: 'الأيقونة', unicode_emoji: 'إيموجي الرتبة', nick: 'اللقب', communication_disabled_until: 'التايم أوت', deaf: 'كتم السماعة', mute: 'كتم المايك',
  avatar_hash: 'الصورة', banner_hash: 'البانر', splash_hash: 'خلفية الدعوة', discovery_splash_hash: 'خلفية الاكتشاف', verification_level: 'مستوى التحقق',
  explicit_content_filter: 'فلتر المحتوى', default_message_notifications: 'الإشعارات الافتراضية', afk_channel_id: 'روم الخمول', afk_timeout: 'مهلة الخمول',
  system_channel_id: 'روم رسائل النظام', system_channel_flags: 'إعدادات رسائل النظام', rules_channel_id: 'روم القوانين', public_updates_channel_id: 'روم تحديثات المجتمع',
  safety_alerts_channel_id: 'روم تنبيهات الأمان', vanity_url_code: 'الرابط المخصص', owner_id: 'المالك', mfa_level: 'التحقق الثنائي للإدارة', preferred_locale: 'اللغة',
  premium_progress_bar_enabled: 'شريط البوست', widget_enabled: 'الويدجت', widget_channel_id: 'روم الويدجت', code: 'الكود', max_uses: 'أقصى استخدام', max_age: 'المدة',
  temporary: 'عضوية مؤقتة', channel_id: 'القناة', inviter_id: 'صاحب الدعوة', uses: 'الاستخدامات', type: 'النوع', archived: 'مؤرشف', locked: 'مقفل',
  auto_archive_duration: 'الأرشفة التلقائية', invitable: 'الدعوة مسموحة', flags: 'الخصائص', applied_tags: 'الوسوم', available_tags: 'الوسوم المتاحة', tags: 'الوسوم',
  format_type: 'الصيغة', available: 'متاح', enabled: 'مفعل', trigger_type: 'نوع القاعدة', trigger_metadata: 'شروط القاعدة', actions: 'الإجراءات', event_type: 'الحدث',
  exempt_roles: 'رتب مستثناة', exempt_channels: 'قنوات مستثناة', entity_type: 'نوع الفعالية', status: 'الحالة', privacy_level: 'الخصوصية', location: 'المكان',
  scheduled_start_time: 'البداية', scheduled_end_time: 'النهاية', image_hash: 'الصورة', $add: 'أُضيفت', $remove: 'انسحبت', id: 'الآيدي', emoji_name: 'الإيموجي',
  volume: 'الصوت', sound_id: 'الصوت', default_auto_archive_duration: 'الأرشفة الافتراضية', default_reaction_emoji: 'تفاعل افتراضي', default_sort_order: 'الترتيب الافتراضي',
  default_forum_layout: 'شكل المنتدى', template: 'القالب', nsfw_level: 'تصنيف المحتوى', application_id: 'التطبيق', avatar: 'الصورة', guild_id: 'السيرفر',
};
const SECONDS = new Set(['rate_limit_per_user', 'default_thread_rate_limit_per_user', 'afk_timeout', 'max_age']);
const MINUTES = new Set(['auto_archive_duration', 'default_auto_archive_duration']);
const CHANNEL_KEYS = /(^|_)channel_id$|^parent_id$/;
const USER_KEYS = new Set(['owner_id', 'inviter_id']);
const PERM_KEYS = new Set(['permissions', 'allow', 'deny']);
const VERIFY = ['بدون', 'منخفض', 'متوسط', 'عالي', 'عالي جداً'];

function dur(sec) {
  sec = Number(sec) || 0;
  if (!sec) return 'بدون';
  if (sec < 60) return `${sec} ثانية`;
  if (sec < 3600) return `${Math.round(sec / 60)} دقيقة`;
  if (sec < 86400) return `${Math.round(sec / 3600)} ساعة`;
  return `${Math.round(sec / 86400)} يوم`;
}

function val(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (key === 'color' && typeof v === 'number') return v ? `#${v.toString(16).padStart(6, '0')}` : 'افتراضي';
  if (key === 'colors' && typeof v === 'object') return v.primary_color ? `#${Number(v.primary_color).toString(16).padStart(6, '0')}` : 'افتراضي';
  if (CHANNEL_KEYS.test(key)) return `<#${v}>`;
  if (USER_KEYS.has(key)) return `<@${v}>`;
  if (SECONDS.has(key)) return dur(v);
  if (MINUTES.has(key)) return dur(Number(v) * 60);
  if (key === 'communication_disabled_until') return v ? ts(new Date(v).getTime(), 'R') : 'انشال';
  if (key === 'verification_level') return VERIFY[v] ?? String(v);
  if (/_hash$/.test(key)) return 'تغيّرت';
  if (key === '$add' || key === '$remove') return (Array.isArray(v) ? v : []).map((r) => `<@&${r.id}>`).join(' ') || '—';
  if (Array.isArray(v)) return ui.trim(v.map((x) => (typeof x === 'object' ? x.name || x.id || JSON.stringify(x) : String(x))).join('، '), 300) || '—';
  if (typeof v === 'object') return ui.trim(JSON.stringify(v), 200);
  return ui.trim(String(v), 250);
}

function permDiff(oldV, newV) {
  const a = new PermissionsBitField(BigInt(oldV || 0));
  const b = new PermissionsBitField(BigInt(newV || 0));
  const added = b.toArray().filter((p) => !a.has(p));
  const removed = a.toArray().filter((p) => !b.has(p));
  const out = [];
  if (added.length) out.push(`+ ${added.map((p) => ui.permName(p)).join('، ')}`);
  if (removed.length) out.push(`− ${removed.map((p) => ui.permName(p)).join('، ')}`);
  return out.join('\n') || 'بدون تغيير';
}

function changeLines(changes = []) {
  const lines = [];
  for (const c of changes) {
    const label = KEY_AR[c.key] || c.key;
    if (c.key === '$add' || c.key === '$remove') {
      lines.push(`**${label}:** ${val(c.key, c.new ?? c.old)}`);
    } else if (PERM_KEYS.has(c.key)) {
      lines.push(`**${label}:**\n\`\`\`diff\n${permDiff(c.old, c.new)}\n\`\`\``);
    } else if (c.old === undefined) {
      lines.push(`**${label}:** ${val(c.key, c.new)}`);
    } else if (c.new === undefined) {
      lines.push(`**${label}:** ~~${val(c.key, c.old)}~~`);
    } else {
      lines.push(`**${label}:** ${val(c.key, c.old)} ← ${val(c.key, c.new)}`);
    }
  }
  return lines;
}

// action → [type, title, kind, icon]
const A = AuditLogEvent;
const ACTIONS = {
  [A.GuildUpdate]: ['server_updates', 'تعديل إعدادات السيرفر', 'update', 'repair'],
  [A.ChannelCreate]: ['channel_changes', 'إنشاء قناة', 'create', 'tasks'],
  [A.ChannelUpdate]: ['channel_changes', 'تعديل قناة', 'update', 'tasks'],
  [A.ChannelDelete]: ['channel_changes', 'حذف قناة', 'delete', 'tasks'],
  [A.ChannelOverwriteCreate]: ['channel_changes', 'إضافة صلاحيات لقناة', 'create', 'lock'],
  [A.ChannelOverwriteUpdate]: ['channel_changes', 'تعديل صلاحيات قناة', 'update', 'lock'],
  [A.ChannelOverwriteDelete]: ['channel_changes', 'حذف صلاحيات من قناة', 'delete', 'lock'],
  [A.MemberKick]: ['moderation_actions', 'طرد عضو', 'mod', 'kick'],
  [A.MemberPrune]: ['moderation_actions', 'تنظيف الأعضاء (Prune)', 'mod', 'kick'],
  [A.MemberBanAdd]: ['moderation_actions', 'حظر عضو', 'mod', 'kick'],
  [A.MemberBanRemove]: ['moderation_actions', 'فك حظر', 'create', 'unlock'],
  [A.MemberUpdate]: ['member_update', 'تعديل عضو', 'update', 'rename'],
  [A.MemberRoleUpdate]: ['role_changes', 'تعديل رتب عضو', 'update', 'players'],
  [A.MemberMove]: ['voice_changes', 'نقل أعضاء بين الرومات', 'update', 'voice'],
  [A.MemberDisconnect]: ['voice_changes', 'فصل أعضاء من الصوت', 'delete', 'voice'],
  [A.BotAdd]: ['integrations', 'إضافة بوت', 'create', 'zap'],
  [A.RoleCreate]: ['server_roles', 'إنشاء رتبة', 'create', 'crown'],
  [A.RoleUpdate]: ['server_roles', 'تعديل رتبة', 'update', 'crown'],
  [A.RoleDelete]: ['server_roles', 'حذف رتبة', 'delete', 'crown'],
  [A.InviteCreate]: ['invites', 'إنشاء رابط دعوة', 'create', 'mail'],
  [A.InviteUpdate]: ['invites', 'تعديل رابط دعوة', 'update', 'mail'],
  [A.InviteDelete]: ['invites', 'حذف رابط دعوة', 'delete', 'mail'],
  [A.WebhookCreate]: ['integrations', 'إنشاء ويب هوك', 'create', 'zap'],
  [A.WebhookUpdate]: ['integrations', 'تعديل ويب هوك', 'update', 'zap'],
  [A.WebhookDelete]: ['integrations', 'حذف ويب هوك', 'delete', 'zap'],
  [A.EmojiCreate]: ['emojis_stickers', 'إضافة إيموجي', 'create', 'star'],
  [A.EmojiUpdate]: ['emojis_stickers', 'تعديل إيموجي', 'update', 'star'],
  [A.EmojiDelete]: ['emojis_stickers', 'حذف إيموجي', 'delete', 'star'],
  [A.MessagePin]: ['message_edit', 'تثبيت رسالة', 'info', 'list'],
  [A.MessageUnpin]: ['message_edit', 'إلغاء تثبيت رسالة', 'info', 'list'],
  [A.IntegrationCreate]: ['integrations', 'إضافة تكامل', 'create', 'zap'],
  [A.IntegrationUpdate]: ['integrations', 'تعديل تكامل', 'update', 'zap'],
  [A.IntegrationDelete]: ['integrations', 'حذف تكامل', 'delete', 'zap'],
  [A.StageInstanceCreate]: ['events', 'بدء ستيج', 'create', 'voice'],
  [A.StageInstanceUpdate]: ['events', 'تعديل ستيج', 'update', 'voice'],
  [A.StageInstanceDelete]: ['events', 'إنهاء ستيج', 'delete', 'voice'],
  [A.StickerCreate]: ['emojis_stickers', 'إضافة ملصق', 'create', 'star'],
  [A.StickerUpdate]: ['emojis_stickers', 'تعديل ملصق', 'update', 'star'],
  [A.StickerDelete]: ['emojis_stickers', 'حذف ملصق', 'delete', 'star'],
  [A.GuildScheduledEventCreate]: ['events', 'إنشاء فعالية', 'create', 'party'],
  [A.GuildScheduledEventUpdate]: ['events', 'تعديل فعالية', 'update', 'party'],
  [A.GuildScheduledEventDelete]: ['events', 'حذف فعالية', 'delete', 'party'],
  [A.ThreadCreate]: ['threads', 'إنشاء ثريد', 'create', 'chat'],
  [A.ThreadUpdate]: ['threads', 'تعديل ثريد', 'update', 'chat'],
  [A.ThreadDelete]: ['threads', 'حذف ثريد', 'delete', 'chat'],
  [A.ApplicationCommandPermissionUpdate]: ['integrations', 'تعديل صلاحيات أوامر بوت', 'update', 'zap'],
  [A.AutoModerationRuleCreate]: ['automod', 'إنشاء قاعدة أوتومود', 'create', 'shield'],
  [A.AutoModerationRuleUpdate]: ['automod', 'تعديل قاعدة أوتومود', 'update', 'shield'],
  [A.AutoModerationRuleDelete]: ['automod', 'حذف قاعدة أوتومود', 'delete', 'shield'],
  [A.AutoModerationBlockMessage]: ['automod', 'الأوتومود منع رسالة', 'mod', 'shield'],
  [A.AutoModerationFlagToChannel]: ['automod', 'الأوتومود بلّغ عن رسالة', 'info', 'shield'],
  [A.AutoModerationUserCommunicationDisabled]: ['automod', 'الأوتومود عطى تايم أوت', 'mod', 'shield'],
};
// sound board / onboarding / home settings etc. exist on newer API versions; add them when the enum knows them
for (const [k, t] of [['SoundboardSoundCreate', 'إضافة صوت'], ['SoundboardSoundUpdate', 'تعديل صوت'], ['SoundboardSoundDelete', 'حذف صوت']]) if (A[k] !== undefined) ACTIONS[A[k]] = ['emojis_stickers', t, t.startsWith('حذف') ? 'delete' : t.startsWith('إضافة') ? 'create' : 'update', 'voice'];
for (const k of ['OnboardingPromptCreate', 'OnboardingPromptUpdate', 'OnboardingPromptDelete', 'OnboardingCreate', 'OnboardingUpdate', 'HomeSettingsCreate', 'HomeSettingsUpdate']) if (A[k] !== undefined) ACTIONS[A[k]] = ['server_updates', 'تعديل الأونبوردنق والصفحة الرئيسية', 'update', 'repair'];

function targetText(entry, guild) {
  const id = entry.targetId;
  const t = entry.target;
  const nameChange = entry.changes?.find((c) => c.key === 'name');
  const name = t?.name || t?.username || nameChange?.new || nameChange?.old;
  switch (entry.targetType) {
    case 'User':
      return id ? `<@${id}> \`${id}\`` : null;
    case 'Channel':
    case 'Thread':
      return guild.channels.cache.has(id) ? `<#${id}>` : `\`${name || id}\``;
    case 'Role':
      return guild.roles.cache.has(id) ? `<@&${id}>` : `\`${name || id}\``;
    case 'Invite':
      return `\`${t?.code || entry.changes?.find((c) => c.key === 'code')?.new || entry.changes?.find((c) => c.key === 'code')?.old || '—'}\``;
    case 'Guild':
      return null;
    default:
      return name ? `\`${name}\`` : id ? `\`${id}\`` : null;
  }
}

function extraText(entry) {
  const x = entry.extra;
  if (!x) return null;
  if (entry.action === A.MemberPrune) return `**المحذوفين:** ${x.removed} • **غير نشطين من:** ${x.days} يوم`;
  if (entry.action === A.MemberMove) return `**إلى:** <#${x.channel?.id}> • **العدد:** ${x.count}`;
  if (entry.action === A.MemberDisconnect) return `**العدد:** ${x.count}`;
  if (entry.action === A.MessagePin || entry.action === A.MessageUnpin) return `**القناة:** <#${x.channel?.id}> • [الرسالة](https://discord.com/channels/${entry.guildId || ''}/${x.channel?.id}/${x.messageId})`;
  if (/^ChannelOverwrite/.test(A[entry.action] || '')) return x.id ? `**على:** ${x.type === 1 || x.type === 'member' ? `<@${x.id}>` : `<@&${x.id}>`}` : null;
  if (x.channel) return `**القناة:** <#${x.channel.id}>`;
  return null;
}

// timeouts and voice mutes come as MemberUpdate; they belong to moderation, not to "member updates"
function routeMemberUpdate(entry) {
  const keys = (entry.changes || []).map((c) => c.key);
  if (keys.includes('communication_disabled_until')) {
    const c = entry.changes.find((x) => x.key === 'communication_disabled_until');
    return ['moderation_actions', c.new ? 'تايم أوت' : 'فك تايم أوت', c.new ? 'mod' : 'create', 'timer'];
  }
  if (keys.includes('mute') || keys.includes('deaf')) return ['voice_changes', 'كتم صوتي من الإدارة', 'mod', 'voice'];
  if (keys.includes('nick')) return ['member_update', 'تغيير لقب', 'update', 'rename'];
  return null;
}

const recentDeletes = new Map(); // `${channelId}:${authorId}` → { executorId, at }

async function onAudit(entry, guild) {
  if (entry.action === A.MessageDelete) {
    recentDeletes.set(`${entry.extra?.channel?.id}:${entry.targetId}`, { executorId: entry.executorId, at: Date.now() });
    return;
  }
  if (entry.action === A.MessageBulkDelete) return; // the bulk-delete transcript covers it
  let meta = ACTIONS[entry.action];
  if (entry.action === A.MemberUpdate) meta = routeMemberUpdate(entry) || meta;
  if (!meta) meta = ['server_updates', `إجراء إداري (${A[entry.action] || entry.action})`, 'info'];
  const [type, title, kind] = meta;
  if (!channelFor(guild, type)) return;

  const e = ui.embed().setColor(COLORS[kind] || COLORS.info).setTitle(title).setTimestamp(entry.createdTimestamp || Date.now());
  const ex = entry.executor;
  if (ex?.username) e.setAuthor({ name: ex.username, iconURL: ex.displayAvatarURL?.() });
  if (entry.targetType === 'User' && entry.target?.displayAvatarURL) e.setThumbnail(entry.target.displayAvatarURL());
  const fields = [];
  const target = targetText(entry, guild);
  if (target) fields.push({ name: 'الهدف', value: target, inline: true });
  fields.push({ name: 'بواسطة', value: entry.executorId ? `<@${entry.executorId}>${ex?.bot ? ' · بوت' : ''}` : 'غير معروف', inline: true });
  const extra = extraText({ ...entry, guildId: guild.id });
  if (extra) fields.push({ name: 'تفاصيل', value: ui.trim(extra.replace(/\*\*/g, ''), 1024), inline: false });
  if (entry.reason) fields.push({ name: 'السبب', value: ui.trim(entry.reason, 1024), inline: false });
  e.addFields(fields);
  const ch = changeLines(entry.changes);
  if (ch.length) e.setDescription(ui.trim(ch.join('\n'), 4000));
  e.setFooter({ text: [entry.targetId && `الهدف ${entry.targetId}`, entry.executorId && `المنفذ ${entry.executorId}`].filter(Boolean).join(' · ') || ' ' });
  await send(guild, type, e);
}

// ---------- gateway-side logs ----------
function userCard(user, color, title) {
  return ui
    .embed()
    .setColor(color)
    .setTitle(title)
    .setAuthor({ name: user.username || 'عضو', iconURL: user.displayAvatarURL?.() })
    .setFooter({ text: `ID ${user.id}` })
    .setTimestamp();
}
const dateAndAgo = (t) => `${ts(t, 'D')} · ${ts(t, 'R')}`;

async function onJoin(member) {
  if (!channelFor(member.guild, 'member_join')) return;
  await new Promise((r) => setTimeout(r, 2500)); // let the invite tracker work out who invited them
  let inviter = null;
  try {
    inviter = require('./invites').findInviter(member.guild.id, member.id);
  } catch {}
  const age = Date.now() - member.user.createdTimestamp;
  const e = userCard(member.user, COLORS.create, member.user.bot ? 'انضمام بوت' : 'انضمام عضو')
    .setThumbnail(member.user.displayAvatarURL?.({ size: 256 }) || null)
    .setDescription(`${member} \`${member.user.username}\``)
    .addFields(
      { name: 'تاريخ إنشاء الحساب', value: `${dateAndAgo(member.user.createdTimestamp)}${age < 7 * 86_400_000 ? '\n⚠️ حساب جديد' : ''}`, inline: true },
      { name: 'دعوة من', value: inviter ? `<@${inviter.inviterId}>` : 'غير معروف', inline: true },
      { name: 'عدد الأعضاء', value: `${member.guild.memberCount}`, inline: true }
    );
  send(member.guild, 'member_join', e);
}

async function onLeave(member) {
  if (!channelFor(member.guild, 'member_leave')) return;
  const roles = member.roles?.cache?.filter((r) => r.id !== member.guild.id);
  const e = userCard(member.user, COLORS.delete, member.user.bot ? 'مغادرة بوت' : 'مغادرة عضو')
    .setThumbnail(member.user.displayAvatarURL?.({ size: 256 }) || null)
    .setDescription(`${member.user} \`${member.user.username}\``)
    .addFields(
      { name: 'انضم', value: member.joinedTimestamp ? dateAndAgo(member.joinedTimestamp) : 'غير معروف', inline: true },
      { name: 'عدد الأعضاء', value: `${member.guild.memberCount}`, inline: true },
      { name: `الرتب (${roles?.size || 0})`, value: roles?.size ? ui.trim(roles.map((r) => `${r}`).join(' '), 1024) : 'لا يوجد', inline: false }
    );
  send(member.guild, 'member_leave', e);
}

function onMemberUpdate(oldM, newM) {
  const g = newM.guild;
  if (!oldM.premiumSince && newM.premiumSince) {
    send(g, 'boosts', userCard(newM.user, 0xf47fff, 'بوست جديد').setDescription(`${newM} عمل بوست للسيرفر`).addFields({ name: 'عدد البوستات', value: `${g.premiumSubscriptionCount ?? '—'}`, inline: true }, { name: 'المستوى', value: `${g.premiumTier ?? 0}`, inline: true }));
  } else if (oldM.premiumSince && !newM.premiumSince) {
    send(g, 'boosts', userCard(newM.user, COLORS.delete, 'إلغاء بوست').setDescription(`${newM} شال البوست`).addFields({ name: 'كان مبوست منذ', value: dateAndAgo(oldM.premiumSinceTimestamp), inline: true }));
  }
  if (!oldM.partial && oldM.avatar !== newM.avatar) {
    const e = userCard(newM.user, COLORS.update, 'تغيير صورة السيرفر').setDescription(`${newM}`);
    if (newM.avatar) e.setThumbnail(newM.displayAvatarURL({ size: 512 }));
    send(g, 'member_update', e);
  }
  if (oldM.pending && !newM.pending) send(g, 'member_join', userCard(newM.user, COLORS.create, 'موافقة على القوانين').setDescription(`${newM}`));
}

function onUserUpdate(oldU, newU, client) {
  const fields = [];
  if (oldU.username !== newU.username) fields.push({ name: 'اسم المستخدم', value: `\`${oldU.username}\` ← \`${newU.username}\``, inline: false });
  if (oldU.globalName !== newU.globalName) fields.push({ name: 'الاسم الظاهر', value: `\`${oldU.globalName || '—'}\` ← \`${newU.globalName || '—'}\``, inline: false });
  const avatar = oldU.avatar !== newU.avatar;
  if (!fields.length && !avatar) return;
  for (const g of client.guilds.cache.values()) {
    if (!g.members.cache.has(newU.id) || !channelFor(g, 'member_update')) continue;
    const e = userCard(newU, COLORS.update, avatar && !fields.length ? 'تغيير الصورة الشخصية' : 'تحديث الحساب').setDescription(`<@${newU.id}>`);
    if (fields.length) e.addFields(fields);
    if (avatar) e.setThumbnail(newU.displayAvatarURL({ size: 512 }));
    send(g, 'member_update', e);
  }
}

async function onMessageDelete(message) {
  if (!message.guild || message.author?.bot || !channelFor(message.guild, 'message_delete')) return;
  await new Promise((r) => setTimeout(r, 1500)); // the audit entry (deleted by a moderator?) arrives right after
  const key = `${message.channelId}:${message.author?.id}`;
  const by = recentDeletes.get(key);
  const byMod = by && Date.now() - by.at < 5000;
  if (byMod) recentDeletes.delete(key);
  const mentions = message.mentions?.users?.filter((u) => !u.bot && u.id !== message.author?.id);
  const ghost = mentions?.size && Date.now() - message.createdTimestamp < 60_000;
  const e = ui
    .embed()
    .setColor(COLORS.delete)
    .setTitle(ghost ? 'منشن مخفي (Ghost Ping)' : 'رسالة محذوفة')
    .setDescription(message.content ? ui.trim(message.content, 4000) : message.partial ? '*المحتوى غير محفوظ — الرسالة أقدم من آخر تشغيل للبوت*' : '*بدون نص*')
    .setFooter({ text: `الكاتب ${message.author?.id || '—'} · الرسالة ${message.id}` })
    .setTimestamp();
  if (message.author) e.setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() });
  const fields = [
    { name: 'الكاتب', value: message.author ? `${message.author}` : 'غير معروف', inline: true },
    { name: 'القناة', value: `${message.channel}`, inline: true },
  ];
  if (byMod) fields.push({ name: 'حذفها', value: `<@${by.executorId}>`, inline: true });
  if (message.createdTimestamp) fields.push({ name: 'أُرسلت', value: ts(message.createdTimestamp, 'R'), inline: true });
  if (ghost) fields.push({ name: 'المنشن', value: mentions.map((u) => `${u}`).join(' '), inline: false });
  if (message.reference?.messageId) fields.push({ name: 'رد على', value: `[رسالة](https://discord.com/channels/${message.guild.id}/${message.reference.channelId}/${message.reference.messageId})`, inline: true });
  if (message.attachments?.size) {
    fields.push({ name: `المرفقات (${message.attachments.size})`, value: ui.trim(message.attachments.map((a) => `[${a.name}](${a.proxyURL || a.url})`).join('\n'), 1024), inline: false });
    const img = message.attachments.find((a) => a.contentType?.startsWith('image/'));
    if (img) e.setImage(img.proxyURL || img.url);
  }
  if (message.stickers?.size) fields.push({ name: 'ملصقات', value: message.stickers.map((x) => x.name).join('، '), inline: false });
  e.addFields(fields);
  send(message.guild, 'message_delete', e);
}

async function onBulkDelete(messages, channel) {
  const guild = channel.guild;
  if (!guild || !channelFor(guild, 'message_delete')) return;
  const list = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const text = list
    .map((m) => `[${new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19)}] ${m.author ? `${m.author.username} (${m.author.id})` : 'غير معروف'}: ${m.content || ''}${m.attachments?.size ? ` [${m.attachments.map((a) => a.url).join(' ')}]` : ''}`)
    .join('\n');
  let by = null;
  try {
    const logs = await guild.fetchAuditLogs({ type: A.MessageBulkDelete, limit: 1 });
    const en = logs.entries.first();
    if (en && Date.now() - en.createdTimestamp < 10_000) by = en.executorId;
  } catch {}
  const e = ui
    .embed()
    .setColor(COLORS.delete)
    .setTitle('حذف جماعي')
    .addFields({ name: 'القناة', value: `${channel}`, inline: true }, { name: 'العدد', value: `${messages.size}`, inline: true }, { name: 'بواسطة', value: by ? `<@${by}>` : 'غير معروف', inline: true })
    .setFooter({ text: 'نص الرسائل بالملف المرفق' })
    .setTimestamp();
  send(guild, 'message_delete', { embeds: [e], files: [new AttachmentBuilder(Buffer.from(`﻿${text}`, 'utf8'), { name: `deleted-${channel.name}-${Date.now()}.txt` })] });
}

function onMessageUpdate(oldMsg, newMsg) {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (oldMsg.partial || oldMsg.content === newMsg.content) return;
  const e = ui
    .embed()
    .setColor(COLORS.update)
    .setTitle('تعديل رسالة')
    .setURL(newMsg.url)
    .setAuthor({ name: newMsg.author.username, iconURL: newMsg.author.displayAvatarURL() })
    .addFields(
      { name: 'الكاتب', value: `${newMsg.author}`, inline: true },
      { name: 'القناة', value: `${newMsg.channel}`, inline: true },
      { name: 'قبل', value: ui.trim(oldMsg.content || '—', 1024), inline: false },
      { name: 'بعد', value: ui.trim(newMsg.content || '—', 1024), inline: false }
    )
    .setFooter({ text: `الكاتب ${newMsg.author.id} · الرسالة ${newMsg.id}` })
    .setTimestamp();
  send(newMsg.guild, 'message_edit', e);
}

function onVoice(o, n) {
  const member = n.member || o.member;
  const g = n.guild;
  if (!member || !channelFor(g, 'voice_changes')) return;
  let title = null;
  let desc = '';
  let color = COLORS.info;
  if (o.channelId !== n.channelId) {
    if (!o.channelId) [title, desc, color] = ['دخول روم صوتي', `${member} ← ${n.channel}`, COLORS.create];
    else if (!n.channelId) [title, desc, color] = ['مغادرة روم صوتي', `${member} من ${o.channel}`, COLORS.delete];
    else [title, desc, color] = ['تنقّل بين الرومات', `${member}\n${o.channel} ← ${n.channel}`, COLORS.update];
  } else if (o.streaming !== n.streaming) [title, desc] = [n.streaming ? 'بدء مشاركة الشاشة' : 'إيقاف مشاركة الشاشة', `${member} · ${n.channel}`];
  else if (o.selfVideo !== n.selfVideo) [title, desc] = [n.selfVideo ? 'تشغيل الكاميرا' : 'إيقاف الكاميرا', `${member} · ${n.channel}`];
  if (!title) return;
  send(g, 'voice_changes', ui.embed().setColor(color).setTitle(title).setAuthor({ name: member.user.username, iconURL: member.displayAvatarURL() }).setDescription(desc).setFooter({ text: `ID ${member.id}` }).setTimestamp());
}

function onAutoMod(ex) {
  const g = ex.guild;
  if (!channelFor(g, 'automod')) return;
  const ACT = { 1: 'منع الرسالة', 2: 'تنبيه بقناة', 3: 'تايم أوت', 4: 'منع التفاعل' };
  const TRIG = { 1: 'كلمات ممنوعة', 3: 'سبام', 4: 'قائمة جاهزة', 5: 'منشن كثير', 6: 'ملف العضو' };
  const e = ui
    .embed()
    .setColor(COLORS.mod)
    .setTitle('تدخّل الأوتومود')
    .addFields(
      { name: 'العضو', value: `<@${ex.userId}>`, inline: true },
      { name: 'القناة', value: ex.channelId ? `<#${ex.channelId}>` : '—', inline: true },
      { name: 'الإجراء', value: `${ACT[ex.action?.type] || ex.action?.type}`, inline: true },
      { name: 'القاعدة', value: `${TRIG[ex.ruleTriggerType] || ex.ruleTriggerType}${ex.matchedKeyword ? ` · \`${ex.matchedKeyword}\`` : ''}`, inline: false }
    )
    .setFooter({ text: `ID ${ex.userId}` })
    .setTimestamp();
  if (ex.content) e.setDescription(ui.trim(ex.content, 4000));
  send(g, 'automod', e);
}

/** Called after every bot command (utils/commands). */
function logCommand(ctx) {
  const g = ctx.guild;
  if (!g || !channelFor(g, 'bot_commands')) return;
  const opts = Object.entries(ctx.options || {})
    .map(([k, v]) => `${k}: ${v?.id ? (v.username ? `@${v.username}` : v.name ? `#${v.name}` : v.id) : ui.trim(String(v), 80)}`)
    .join('\n');
  const e = ui
    .embed()
    .setColor(COLORS.info)
    .setTitle(`${ctx.isSlash ? '/' : ctx.prefix}${ctx.command.name}`)
    .setAuthor({ name: ctx.user.username, iconURL: ctx.user.displayAvatarURL?.() })
    .addFields({ name: 'العضو', value: `${ctx.user}`, inline: true }, { name: 'القناة', value: `${ctx.channel}`, inline: true })
    .setFooter({ text: `ID ${ctx.user.id}` })
    .setTimestamp();
  if (opts) e.setDescription(`\`\`\`\n${ui.trim(opts, 1000)}\n\`\`\``);
  send(g, 'bot_commands', e);
}

/** Bot-made moderation actions that don't show up in Discord's audit log (warnings, jail, notes…). */
function modAction(guild, { title, target, by, reason, extra, color = COLORS.mod }) {
  const e = ui.embed().setColor(color).setTitle(title).setTimestamp();
  const fields = [];
  if (target) fields.push({ name: 'العضو', value: `<@${target}>`, inline: true });
  if (by) fields.push({ name: 'بواسطة', value: `<@${by}>`, inline: true });
  if (reason) fields.push({ name: 'السبب', value: ui.trim(reason, 1024), inline: false });
  if (extra) fields.push({ name: 'تفاصيل', value: ui.trim(String(extra).replace(/\*\*/g, ''), 1024), inline: false });
  e.addFields(fields);
  if (target) e.setFooter({ text: `ID ${target}` });
  send(guild, 'moderation_actions', e);
}

/** Old configs (3 merged types) → the new split types, once. */
function migrate() {
  const all = store.get('logsConfig');
  let changed = false;
  for (const conf of Object.values(all)) {
    if (!conf || typeof conf !== 'object') continue;
    for (const [type, old] of Object.entries(LEGACY)) {
      if (!(type in conf) && conf[old]) {
        conf[type] = conf[old];
        changed = true;
      }
    }
    for (const old of ['member_join_leave', 'message_edit_delete', 'nickname_changes']) {
      if (old in conf) {
        delete conf[old];
        changed = true;
      }
    }
  }
  if (changed) store.save('logsConfig');
}

function init(client) {
  migrate();
  client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => onAudit(entry, guild).catch((e) => console.error('[logs:audit]', e.message)));
  client.on(Events.GuildMemberAdd, (m) => onJoin(m).catch(() => {}));
  client.on(Events.GuildMemberRemove, (m) => onLeave(m).catch(() => {}));
  client.on(Events.GuildMemberUpdate, (o, n) => {
    try {
      onMemberUpdate(o, n);
    } catch {}
  });
  client.on(Events.UserUpdate, (o, n) => {
    try {
      onUserUpdate(o, n, client);
    } catch {}
  });
  client.on(Events.MessageDelete, (m) => onMessageDelete(m).catch(() => {}));
  client.on(Events.MessageBulkDelete, (msgs, ch) => onBulkDelete(msgs, ch).catch(() => {}));
  client.on(Events.MessageUpdate, (o, n) => {
    try {
      onMessageUpdate(o, n);
    } catch {}
  });
  client.on(Events.VoiceStateUpdate, (o, n) => {
    try {
      onVoice(o, n);
    } catch {}
  });
  client.on(Events.AutoModerationActionExecution, (ex) => {
    try {
      onAutoMod(ex);
    } catch {}
  });
  setInterval(() => {
    for (const [k, v] of recentDeletes) if (Date.now() - v.at > 10_000) recentDeletes.delete(k);
  }, 30_000).unref();
}

module.exports = { LOG_TYPES, LOG_GROUPS, LEGACY, LOG_CATEGORY, send, channelFor, init, migrate, autoSetup, logCommand, modAction, onAudit, changeLines, permDiff, COLORS };
