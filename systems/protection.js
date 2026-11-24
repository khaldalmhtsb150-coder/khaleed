// Premium protection: Anti-Raid (mass joins) and Anti-Nuke (mass destructive actions by one person).
const { Events, AuditLogEvent, GuildVerificationLevel, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const premium = require('../utils/premium');
const { isOwner } = require('../utils/perms');

const NUKE_ACTIONS = {
  channelDelete: { label: 'حذف القنوات', event: AuditLogEvent.ChannelDelete },
  channelCreate: { label: 'إنشاء القنوات', event: AuditLogEvent.ChannelCreate },
  roleDelete: { label: 'حذف الرتب', event: AuditLogEvent.RoleDelete },
  roleCreate: { label: 'إنشاء الرتب', event: AuditLogEvent.RoleCreate },
  ban: { label: 'الحظر', event: AuditLogEvent.MemberBanAdd },
  kick: { label: 'الطرد', event: AuditLogEvent.MemberKick },
  webhookCreate: { label: 'إنشاء الويب هوك', event: AuditLogEvent.WebhookCreate },
};

const DEFAULT = {
  alertChannelId: '',
  antiRaid: { enabled: false, joins: 10, seconds: 10, action: 'kick', newAccountDays: 0, lockdown: true },
  antiNuke: {
    enabled: false,
    limit: 3,
    seconds: 60,
    punishment: 'strip',
    whitelist: [],
    watch: Object.fromEntries(Object.keys(NUKE_ACTIONS).map((k) => [k, true])),
  },
  impersonation: { enabled: false, action: 'alert' },
};

function config(guildId) {
  const c = store.guild('protectionConfig', guildId, DEFAULT);
  c.antiRaid = { ...DEFAULT.antiRaid, ...c.antiRaid };
  c.antiNuke = { ...DEFAULT.antiNuke, ...c.antiNuke, watch: { ...DEFAULT.antiNuke.watch, ...(c.antiNuke?.watch || {}) } };
  c.impersonation = { ...DEFAULT.impersonation, ...(c.impersonation || {}) };
  return c;
}

async function alert(guild, text) {
  const id = store.peek('protectionConfig', guild.id)?.alertChannelId;
  const ch = id ? guild.channels.cache.get(id) : null;
  if (!ch?.isTextBased()) return;
  await ch.send({ embeds: [ui.embed().setColor(0xf43f5e).setDescription(text).setTimestamp()], allowedMentions: { parse: [] } }).catch(() => {});
}

// ---------- Anti-Raid ----------
const joins = new Map(); // guildId → [timestamps]
const raidUntil = new Map(); // guildId → timestamp
const lockState = new Map(); // guildId → previous verification level

async function punishJoin(member, action, reason) {
  if (!member.manageable && action !== 'ban') return false;
  try {
    if (action === 'ban') await member.ban({ reason, deleteMessageSeconds: 3600 });
    else if (action === 'timeout') await member.timeout(60 * 60_000, reason);
    else await member.kick(reason);
    return true;
  } catch {
    return false;
  }
}

async function onJoin(member) {
  const { guild } = member;
  if (!premium.has(guild.id, 'antiRaid') || member.user.bot) return;
  const conf = config(guild.id).antiRaid;
  if (!conf.enabled) return;
  const now = Date.now();
  const actionName = { kick: 'طرد', ban: 'حظر', timeout: 'إسكات' }[conf.action];

  // brand-new accounts
  if (conf.newAccountDays > 0 && now - member.user.createdTimestamp < conf.newAccountDays * 86_400_000) {
    if (await punishJoin(member, conf.action, `Anti-Raid: حساب أحدث من ${conf.newAccountDays} يوم`))
      await alert(guild, `${E.shield} **Anti-Raid** — ${actionName} ${member.user.tag} (\`${member.id}\`)\n${E.dot} السبب: حساب جديد (أقل من ${conf.newAccountDays} يوم)`);
    return;
  }

  const list = (joins.get(guild.id) || []).filter((t) => now - t < conf.seconds * 1000);
  list.push(now);
  joins.set(guild.id, list);

  if (raidUntil.get(guild.id) > now) {
    await punishJoin(member, conf.action, 'Anti-Raid: دخول أثناء الهجوم');
    return;
  }

  if (list.length >= conf.joins) {
    raidUntil.set(guild.id, now + 10 * 60_000);
    // members who joined inside the window
    const recent = guild.members.cache.filter((m) => !m.user.bot && m.joinedTimestamp && now - m.joinedTimestamp < conf.seconds * 1000);
    let done = 0;
    for (const m of recent.values()) if (await punishJoin(m, conf.action, 'Anti-Raid: هجوم دخول جماعي')) done++;

    let locked = false;
    if (conf.lockdown && guild.members.me.permissions.has(PermissionFlagsBits.ManageGuild) && !lockState.has(guild.id)) {
      lockState.set(guild.id, guild.verificationLevel);
      locked = await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'Anti-Raid lockdown').then(() => true).catch(() => false);
      if (!locked) lockState.delete(guild.id);
      setTimeout(async () => {
        if (!lockState.has(guild.id)) return;
        await guild.setVerificationLevel(lockState.get(guild.id), 'Anti-Raid: انتهاء الإغلاق').catch(() => {});
        lockState.delete(guild.id);
        await alert(guild, `${E.unlock} **Anti-Raid** — انتهى وضع الإغلاق وعاد مستوى التحقق كما كان.`);
      }, 10 * 60_000).unref();
    }
    await alert(
      guild,
      [
        `${E.shield} **Anti-Raid — تم رصد هجوم دخول جماعي**`,
        `${E.dot} ${list.length} عضو دخلوا خلال ${conf.seconds} ثانية`,
        `${E.dot} تم ${actionName} **${done}** عضو، وأي داخل جديد خلال 10 دقائق سيتم ${actionName}ه`,
        locked ? `${E.lock} تم رفع مستوى التحقق للأعلى لمدة 10 دقائق` : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}

// ---------- Anti-Nuke ----------
const actions = new Map(); // `${guild}:${user}:${type}` → [timestamps]
const punished = new Map(); // `${guild}:${user}` → until

async function onAudit(entry, guild) {
  if (!premium.has(guild.id, 'antiNuke')) return;
  const conf = config(guild.id).antiNuke;
  if (!conf.enabled) return;
  const type = Object.keys(NUKE_ACTIONS).find((k) => NUKE_ACTIONS[k].event === entry.action);
  if (!type || !conf.watch[type]) return;
  const executorId = entry.executorId;
  if (!executorId || executorId === guild.client.user.id || executorId === guild.ownerId || isOwner(executorId)) return;
  if (conf.whitelist.includes(executorId)) return;

  const key = `${guild.id}:${executorId}:${type}`;
  const now = Date.now();
  const list = (actions.get(key) || []).filter((t) => now - t < conf.seconds * 1000);
  list.push(now);
  actions.set(key, list);
  if (list.length < conf.limit) return;

  const pkey = `${guild.id}:${executorId}`;
  if (punished.get(pkey) > now) return;
  punished.set(pkey, now + 60_000);
  actions.delete(key);

  const member = await guild.members.fetch(executorId).catch(() => null);
  let result = 'تعذر معاقبته (رتبته أعلى من البوت؟)';
  const reason = `Anti-Nuke: ${NUKE_ACTIONS[type].label} ${list.length} مرات خلال ${conf.seconds} ثانية`;
  try {
    if (conf.punishment === 'ban') {
      await guild.members.ban(executorId, { reason });
      result = 'تم حظره';
    } else if (member && conf.punishment === 'kick') {
      await member.kick(reason);
      result = 'تم طرده';
    } else if (member) {
      await member.roles.set(member.roles.cache.filter((r) => r.managed && r.id !== guild.id).map((r) => r.id), reason);
      result = 'تم سحب جميع رتبه';
    }
  } catch {}

  await alert(
    guild,
    [
      `${E.shield} **Anti-Nuke — تم إيقاف محاولة تخريب**`,
      `${E.dot} المنفذ: <@${executorId}> (\`${executorId}\`)${member?.user.bot ? ' — بوت' : ''}`,
      `${E.dot} الإجراء: ${NUKE_ACTIONS[type].label} ×${list.length} خلال ${conf.seconds} ثانية`,
      `${E.dot} النتيجة: **${result}**`,
    ].join('\n')
  );
  // offer a one-click repair from the last backup (deleted roles/channels come back)
  const alertId = store.peek('protectionConfig', guild.id)?.alertChannelId;
  require('./backup').offerRepair(guild, alertId ? guild.channels.cache.get(alertId) : null).catch(() => {});
}

function init(client) {
  client.on(Events.GuildMemberAdd, (m) => onJoin(m).catch((e) => console.error('[anti-raid]', e.message)));
  client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => onAudit(entry, guild).catch((e) => console.error('[anti-nuke]', e.message)));
}

module.exports = { init, config, NUKE_ACTIONS, DEFAULT };
