// AutoMod: word / link / invite / spam / mention filters (free) + caps, emoji, per-channel rules and escalating punishments (premium "automodPlus").
const { Events, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const premium = require('../utils/premium');
const logs = require('./logs');

const DEFAULT = {
  enabled: false,
  logChannelId: '',
  ignoreChannels: [],
  ignoreRoles: [],
  words: { on: true, list: [], action: 'delete' },
  links: { on: false, allow: ['youtube.com', 'youtu.be', 'tenor.com', 'discord.com'], action: 'delete' },
  invites: { on: true, action: 'delete' },
  spam: { on: true, messages: 6, seconds: 5, action: 'timeout' },
  mentions: { on: true, max: 5, action: 'timeout' },
  // premium
  caps: { on: false, percent: 70, min: 12, action: 'delete' },
  emoji: { on: false, max: 10, action: 'delete' },
  escalation: { on: false, steps: [{ strikes: 3, action: 'timeout', minutes: 10 }, { strikes: 5, action: 'timeout', minutes: 60 }, { strikes: 8, action: 'ban' }], resetHours: 24 },
  channelRules: {}, // channelId → { off: ['links', ...] } (premium)
  timeoutMinutes: 5,
};

const RULES = ['words', 'links', 'invites', 'spam', 'mentions', 'caps', 'emoji'];
const PLUS_RULES = ['caps', 'emoji'];
const NAMES = { words: 'كلمة ممنوعة', links: 'رابط غير مسموح', invites: 'رابط دعوة', spam: 'سبام', mentions: 'منشن كثير', caps: 'كابس كثير', emoji: 'إيموجي كثير' };

function config(guildId) {
  const c = store.peek('automodConfig', guildId) || {};
  const out = { ...DEFAULT, ...c };
  for (const k of [...RULES, 'escalation']) out[k] = { ...DEFAULT[k], ...(c[k] || {}) };
  return out;
}

// ---------- detection ----------
const INVITE_RE = /(discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const URL_RE = /https?:\/\/([^\s/]+)/gi;
const EMOJI_RE = /<a?:\w+:\d+>|\p{Extended_Pictographic}/gu;
const arabicFold = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');

const recent = new Map(); // guild:user → timestamps

function check(message, conf, plus, edit = false) {
  const content = message.content || '';
  const off = (plus && conf.channelRules[message.channel.id]?.off) || [];
  const on = (rule) => conf[rule].on && !off.includes(rule) && (!PLUS_RULES.includes(rule) || plus);

  if (on('invites') && INVITE_RE.test(content)) return 'invites';
  if (on('links')) {
    const allow = conf.links.allow.map((d) => d.toLowerCase().replace(/^www\./, ''));
    for (const m of content.matchAll(URL_RE)) {
      const host = m[1].toLowerCase().replace(/^www\./, '');
      if (!allow.some((d) => host === d || host.endsWith(`.${d}`))) return 'links';
    }
  }
  if (on('words') && conf.words.list.length) {
    const text = arabicFold(content);
    if (conf.words.list.some((w) => w && text.includes(arabicFold(w)))) return 'words';
  }
  if (on('mentions')) {
    const count = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 5 : 0);
    if (count > conf.mentions.max) return 'mentions';
  }
  if (on('caps')) {
    const letters = content.replace(/[^A-Za-z]/g, '');
    if (letters.length >= conf.caps.min && (letters.replace(/[^A-Z]/g, '').length / letters.length) * 100 >= conf.caps.percent) return 'caps';
  }
  if (on('emoji') && (content.match(EMOJI_RE) || []).length > conf.emoji.max) return 'emoji';
  if (on('spam') && !edit) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const list = (recent.get(key) || []).filter((t) => now - t < conf.spam.seconds * 1000);
    list.push(now);
    recent.set(key, list);
    if (list.length >= conf.spam.messages) {
      recent.set(key, []);
      return 'spam';
    }
  }
  return null;
}

// ---------- punishment ----------
function strikes(guildId, userId, resetHours) {
  const all = store.guild('automodStrikes', guildId);
  const s = all[userId] && Date.now() - all[userId].last < resetHours * 3_600_000 ? all[userId] : { count: 0 };
  s.count++;
  s.last = Date.now();
  all[userId] = s;
  store.save('automodStrikes');
  return s.count;
}

async function punish(message, rule, conf, plus) {
  const { member, guild } = message;
  await message.delete().catch(() => {});
  if (rule === 'spam') {
    // also clear the spammer's recent messages in this channel
    const msgs = await message.channel.messages.fetch({ limit: 30 }).catch(() => null);
    const mine = msgs?.filter((m) => m.author.id === member.id && Date.now() - m.createdTimestamp < 60_000);
    if (mine?.size) await message.channel.bulkDelete(mine, true).catch(() => {});
  }
  let action = conf[rule].action;
  let minutes = conf.timeoutMinutes;
  let strikeCount = null;
  if (plus && conf.escalation.on) {
    strikeCount = strikes(guild.id, member.id, conf.escalation.resetHours);
    const step = [...conf.escalation.steps].sort((a, b) => b.strikes - a.strikes).find((s) => strikeCount >= s.strikes);
    if (step && strikeCount === step.strikes) {
      action = step.action;
      minutes = step.minutes || minutes;
    }
  }
  let done = 'حذف الرسالة';
  if (action === 'timeout' && member.moderatable) {
    await member.timeout(minutes * 60_000, `AutoMod: ${NAMES[rule]}`).catch(() => {});
    done = `إسكات ${minutes} دقيقة`;
  } else if (action === 'kick' && member.kickable) {
    await member.kick(`AutoMod: ${NAMES[rule]}`).catch(() => {});
    done = 'طرد';
  } else if (action === 'ban' && member.bannable) {
    await member.ban({ reason: `AutoMod: ${NAMES[rule]}`, deleteMessageSeconds: 3600 }).catch(() => {});
    done = 'حظر';
  }

  const warn = await message.channel
    .send({ content: `${member} ${E.warning} ممنوع: **${NAMES[rule]}**${done !== 'حذف الرسالة' ? ` — ${done}` : ''}`, allowedMentions: { users: [member.id] } })
    .catch(() => null);
  if (warn) setTimeout(() => warn.delete().catch(() => {}), 6000);

  const log = conf.logChannelId ? guild.channels.cache.get(conf.logChannelId) : logs.channelFor?.(guild, 'moderation_actions');
  if (log?.isTextBased?.()) {
    await log
      .send({
        embeds: [
          ui
            .embed()
            .setColor(0xf59e0b)
            .setDescription(
              [
                `**${E.shield} AutoMod — ${NAMES[rule]}**`,
                `${E.dot} العضو: ${member} (\`${member.id}\`)`,
                `${E.dot} القناة: ${message.channel}`,
                `${E.dot} الإجراء: ${done}${strikeCount ? ` · المخالفة رقم ${strikeCount}` : ''}`,
                message.content ? `\`\`\`${ui.trim(message.content.replace(/`/g, "'"), 900)}\`\`\`` : '',
              ].join('\n')
            )
            .setTimestamp(),
        ],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }
}

async function onMessage(message, edit = false) {
  if (!message.guild || message.author.bot || !message.member || message.webhookId) return;
  const conf = config(message.guild.id);
  if (!conf.enabled) return;
  const m = message.member;
  if (m.permissions.has(PermissionFlagsBits.ManageMessages) || m.id === message.guild.ownerId) return;
  if (conf.ignoreChannels.includes(message.channel.id) || conf.ignoreChannels.includes(message.channel.parentId)) return;
  if (conf.ignoreRoles.some((r) => m.roles.cache.has(r))) return;
  const plus = premium.has(message.guild.id, 'automodPlus');
  const rule = check(message, conf, plus, edit);
  if (rule) await punish(message, rule, conf, plus);
}

function init(client) {
  client.on(Events.MessageCreate, (m) => onMessage(m).catch((e) => console.error('[automod]', e.message)));
  client.on(Events.MessageUpdate, (_, m) => {
    if (m.partial) return;
    onMessage(m, true).catch(() => {});
  });
  setInterval(() => recent.clear(), 10 * 60_000).unref();
}

module.exports = { init, config, check, DEFAULT, RULES, PLUS_RULES, NAMES, arabicFold };
