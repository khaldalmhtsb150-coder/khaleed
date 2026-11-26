// MarkaBot dashboard — Express, runs inside the bot process (one port, shared memory, no DB).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/store');
const E = require('../utils/emojis');
const { isOwner } = require('../utils/perms');
const commandsRegistry = require('../utils/commands');
const { LOG_TYPES } = require('../systems/logs');
const tickets = require('../systems/tickets');
const { applyPresence } = require('../utils/presence');
const botlog = require('../utils/botlog');
const premium = require('../utils/premium');
const gctx = require('../utils/guildContext');
const media = require('../utils/media');
const welcome = require('../systems/welcome');
const botProfile = require('../systems/botProfile');
const protection = require('../systems/protection');
const giveaways = require('../systems/giveaways');
const levels = require('../systems/levels');
const automod = require('../systems/automod');
const roleMenus = require('../systems/roleMenus');
const embeds = require('../systems/embeds');
const verify = require('../systems/verify');
const purge = require('../systems/purge');
const kafeel = require('../systems/kafeel');
const prayer = require('../systems/prayer');
const adhkar = require('../systems/adhkar');
const gamesSys = require('../systems/games');
const tempvoice = require('../systems/tempvoice');
const appealsSys = require('../systems/appeals');
const khatmaSys = require('../systems/khatma');
const radarSys = require('../systems/radar');
const backupSys = require('../systems/backup');
const ytSys = require('../systems/youtube');
const aiStaff = require('../systems/aiStaff');
const applySys = require('../systems/apply');
const aiCore = require('../utils/ai');
const staffSys = require('../systems/staff');
const wrapped = require('../systems/wrapped');
const who = (req) => ({ id: req.session.user.id, name: req.session.user.globalName || req.session.user.username });
const MODULE_NAMES = { giveaway: 'القيفاواي', protection: 'الحماية', prefix: 'البادئة', general: 'الإعدادات العامة', greetings: 'الترحيب النصي', welcome: 'الترحيب المتقدم', autoLine: 'الخط التلقائي', feedback: 'الآراء', jail: 'السجن', tickets: 'التذاكر', vanity: 'حماية الرابط', logs: 'السجلات', invites: 'الدعوات', replies: 'الردود التلقائية', levels: 'المستويات', automod: 'AutoMod', verify: 'التحقق', purge: 'المسح التلقائي', kafeel: 'الكفيل', prayer: 'أوقات الصلاة', adhkar: 'الأذكار', games: 'الألعاب', wrapped: 'ملخص السيرفر', tempVoice: 'الرومات المؤقتة', appeals: 'طلبات فك الحظر', khatma: 'الختمة الجماعية', radar: 'رادار الأعضاء الجداد', backup: 'النسخ الاحتياطي', warns: 'التحذيرات', gameArt: 'صور الألعاب', ai: 'المساعد الذكي', apply: 'تقديم الإدارة' };

const VIEWS = path.join(__dirname, 'views');
const API = 'https://discord.com/api/v10';
const MANAGE = 0x20n | 0x8n; // MANAGE_GUILD | ADMINISTRATOR
const SESSION_TTL = 7 * 86_400_000;

const sessions = new Map(); // sid → session
const pendingStates = new Map(); // state → expires

function env() {
  const port = Number(process.env.SERVER_PORT || process.env.PORT || 3000);
  const base = (process.env.DASHBOARD_URL || `http://localhost:${port}`).replace(/\/$/, '');
  return {
    port,
    base,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirect: `${base}/callback`,
    secure: base.startsWith('https://'),
  };
}

// ---------- sessions ----------
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function getSession(req) {
  const sid = parseCookies(req).mb_sid;
  const s = sid && sessions.get(sid);
  if (!s) return null;
  if (Date.now() - s.created > SESSION_TTL) {
    sessions.delete(sid);
    return null;
  }
  return s;
}

function setCookie(res, name, value, maxAgeSec) {
  const { secure } = env();
  res.append(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`
  );
}

setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of sessions) if (now - s.created > SESSION_TTL) sessions.delete(sid);
  for (const [st, exp] of pendingStates) if (exp < now) pendingStates.delete(st);
}, 3_600_000).unref();

// ---------- discord oauth ----------
async function discord(pathname, token) {
  const r = await fetch(`${API}${pathname}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 429) {
    const body = await r.json().catch(() => ({}));
    await new Promise((res) => setTimeout(res, (body.retry_after || 1) * 1000));
    return discord(pathname, token);
  }
  if (!r.ok) throw new Error(`Discord API ${r.status}`);
  return r.json();
}

function manageableGuilds(list) {
  return list
    .filter((g) => g.owner || (BigInt(g.permissions || 0) & MANAGE) !== 0n)
    .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
}

// ---------- helpers ----------
const iconUrl = (g) =>
  g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith('a_') ? 'gif' : 'png'}?size=128` : null;

function inviteUrl(guildId) {
  const { clientId } = env();
  const id = clientId || global.client?.user?.id;
  const q = new URLSearchParams({ client_id: id, scope: 'bot applications.commands', permissions: '8' });
  if (guildId) {
    q.set('guild_id', guildId);
    q.set('disable_guild_select', 'true');
  }
  return `https://discord.com/oauth2/authorize?${q}`;
}

async function canManage(client, session, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  if (isOwner(session.user.id)) return guild;
  if (guild.ownerId === session.user.id) return guild;
  const member = await guild.members.fetch(session.user.id).catch(() => null);
  if (member) {
    const ok =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      Boolean(store.peek('guildSettings', guildId)?.managerRoleId && member.roles.cache.has(store.peek('guildSettings', guildId).managerRoleId));
    return ok ? guild : null;
  }
  return session.guilds.some((g) => g.id === guildId) ? guild : null;
}

const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const bool = (v) => v === true || v === 'true' || v === 1 || v === 'on';
const int = (v, min, max, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const url = (v) => (typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim().slice(0, 500) : '');
const imageRef = (v) => (media.isLocal(v) ? v : url(v)); // uploaded file (/media/...) or https link
const color = (v, def) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : def);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
function needPremium(guild, feature) {
  if (!premium.has(guild.id, feature)) throw new Error(premium.lockedText(feature));
}

function channelIn(guild, id, types = [ChannelType.GuildText, ChannelType.GuildAnnouncement]) {
  if (!id) return null;
  const ch = guild.channels.cache.get(String(id));
  return ch && types.includes(ch.type) ? ch.id : null;
}
const roleIn = (guild, id) => (id && guild.roles.cache.has(String(id)) && String(id) !== guild.id ? String(id) : null);
const channelsIn = (guild, list) => (Array.isArray(list) ? list.map((id) => channelIn(guild, id)).filter(Boolean).slice(0, 25) : []);

// ---------- settings ----------
function readSettings(guild) {
  const id = guild.id;
  const p = (name, def = {}) => ({ ...def, ...(store.peek(name, id) || {}) });
  return {
    prefix: { prefix: store.get('prefixes')[id] || '' },
    general: { managerRoleId: p('guildSettings').managerRoleId || '' },
    greetings: (() => { const g = p('greetings', { enabled: false, channelId: '', message: '', duration: 0 }); return { ...g, channelIds: require('../systems/welcome').greetChannels(g) }; })(),
    welcome: p('welcome', { enabled: false, channelId: '', message: '', imageUrl: '', ...welcome.LAYOUT_DEFAULTS }),
    autoLine: p('autoLine', { enabled: false, channels: [], imageUrl: '' }),
    feedback: p('feedback', { enabled: false, channels: [], emojis: [] }),
    jail: {
      ...p('jailConfig', { roleId: '', channelId: '', logChannelId: '' }),
      jailed: Object.entries(store.peek('jail', id) || {}).map(([userId, r]) => ({ userId, until: r.until, reason: r.reason, by: r.by, at: r.at })),
    },
    tickets: { ...tickets.DEFAULT_CONFIG, ...(store.peek('ticketConfig', id) || {}) },
    vanity: { ...p('linkProtection', { vanityProtect: false, punishment: 'ban', whitelist: [] }), current: guild.vanityURLCode || null },
    logs: Object.fromEntries(Object.keys(LOG_TYPES).map((k) => [k, require('../systems/logs').channelFor(guild, k)?.id || ''])),
    invites: { ...p('inviteConfig', { logChannelId: '', minAccountAgeDays: 30, pointHoldHours: 0 }), wheelEnabled: store.peek('wheelConfig', id)?.enabled !== false, wheelImage: store.peek('wheelConfig', id)?.image || '' },
    replies: p('customReplies', { enabled: false, replies: [] }),
    giveaway: p('giveawayConfig', giveaways.DEFAULT_CONFIG),
    protection: protection.config(id),
    warns: require('../systems/warns').config(id),
    nukeActions: Object.fromEntries(Object.entries(protection.NUKE_ACTIONS).map(([k, a]) => [k, a.label])),
    levels: levels.config(id),
    shopGuild: require('../systems/shop').config().guildId === id,
    automod: automod.config(id),
    kafeel: kafeel.config(id),
    prayer: prayer.config(id),
    adhkar: adhkar.config(id),
    games: gamesSys.config(id),
    gameArt: p('gameArt'),
    tempVoice: tempvoice.config(id),
    appeals: { ...appealsSys.config(id), pending: Object.values(store.peek('appeals', id) || {}).filter((a) => a.status === 'pending').length },
    khatma: (() => {
      const d = store.peek('khatma', id) || {};
      const k = d.active;
      return { ...khatmaSys.config(id), completed: d.completed || 0, active: k ? { channelId: k.channelId, done: Object.values(k.juz).filter((j) => j.done).length, taken: Object.values(k.juz).filter((j) => j.uid && !j.done).length, dedication: k.dedication } : null };
    })(),
    radar: { ...radarSys.config(id), report: (({ pct, ...r }) => r)(radarSys.report(id, 30)) },
    backup: { ...backupSys.config(id), keep: backupSys.keep(id), snaps: backupSys.list(id).map((x) => ({ at: x.at, roles: x.roles.length, channels: x.channels.length })) },
    youtube: { limit: ytSys.limit(id), feeds: ytSys.feeds(id).map((f) => ({ ytId: f.ytId, name: f.name, channelId: f.discordChannelId, roleId: f.roleId, errors: f.errors || 0 })) },
    prayerCities: Object.fromEntries(Object.entries(prayer.CITIES).map(([k, c]) => [k, c.name])),
    wrapped: wrapped.config(id),
    staffReport: staffSys.canReport(id),
    roleMenus: Object.values(store.peek('roleMenus', id) || {}),
    verify: verify.config(id),
    purge: purge.listOf(id),
    scheduled: embeds.listOf(id).map(({ id: sid, channelId, at, repeatHours, embed }) => ({ id: sid, channelId, at, repeatHours, title: embed.title || embed.content?.slice(0, 60) || '—' })),
    botProfile: botProfile.get(id),
    premium: premium.status(id),
    ai: (() => {
      const b = store.peek('aiBrain', id) || {};
      return {
        ...aiStaff.config(id),
        available: aiCore.available(),
        provider: aiCore.providerName(),
        usage: aiCore.usage(id).n,
        limit: aiCore.limitFor(id),
        factLimit: premium.limit(id, 'aiFacts'),
        facts: (b.facts || []).map(({ id: fid, text, source, at }) => ({ id: fid, text, source, at })),
        pending: (b.pending || []).map(({ id: pid, text, from, at }) => ({ id: pid, text, from, at })),
        stats: b.stats || {},
      };
    })(),
    apply: {
      ...applySys.config(id),
      stats: applySys.stats(id),
      posLimit: premium.limit(id, 'applyPositions'),
      vanity: guild.vanityURLCode || null,
      aiReady: aiCore.available(),
      template: applySys.TEMPLATE,
      recent: Object.values(store.peek('applications', id) || {})
        .sort((a, b) => b.at - a.at)
        .slice(0, 20)
        .map((a) => ({ id: a.id, uid: a.uid, name: a.name, posName: a.posName, status: a.status, at: a.at, score: a.ai?.score ?? null, auto: Boolean(a.auto) })),
    },
  };
}

function writeSettings(guild, module, d) {
  const id = guild.id;
  switch (module) {
    case 'ai': {
      const conf = store.guild('aiConfig', id, { ...aiStaff.DEFAULT });
      Object.assign(conf, {
        enabled: bool(d.enabled),
        name: str(d.name, 32).trim() || 'المساعد',
        instructions: str(d.instructions, 6000),
        dialect: oneOf(d.dialect, ['auto', 'jordanian', 'gulf', 'egyptian', 'fusha'], 'auto'),
        tickets: bool(d.tickets),
        mention: bool(d.mention),
        channels: channelsIn(guild, d.channels).slice(0, 10),
        canRoles: bool(d.canRoles),
        allowRoles: (Array.isArray(d.allowRoles) ? d.allowRoles : []).map((r) => roleIn(guild, r)).filter(Boolean).slice(0, 25),
        canTimeout: bool(d.canTimeout),
        maxTimeout: int(d.maxTimeout, 1, 1440, 60),
        canCloseTicket: bool(d.canCloseTicket),
        handoff: bool(d.handoff),
        learn: oneOf(d.learn, ['review', 'auto', 'off'], 'review'),
      });
      if (conf.enabled && !aiCore.available()) throw new Error('مفتاح الذكاء الاصطناعي مش مضاف بالبوت لسا (AI_API_KEY بملف .env)');
      return store.save('aiConfig');
    }
    case 'apply': {
      const conf = store.guild('applyConfig', id, { ...applySys.DEFAULT });
      const max = premium.limit(id, 'applyPositions') ?? 2;
      const given = Array.isArray(d.positions) ? d.positions : [];
      if (given.length > max) throw new Error(premium.limitText('applyPositions', max));
      const positions = given.map((p) => {
        const r = p.req || {};
        return {
          id: /^[a-z0-9]{4,10}$/.test(String(p.id || '')) ? String(p.id) : Math.random().toString(36).slice(2, 8),
          name: str(p.name, 60).trim() || 'منصب',
          emoji: str(p.emoji, 40).trim(),
          description: str(p.description, 100),
          roles: (Array.isArray(p.roles) ? p.roles : []).map((x) => roleIn(guild, x)).filter(Boolean).slice(0, 5),
          questions: (Array.isArray(p.questions) ? p.questions : String(p.questions || '').split('\n')).map((q) => str(String(q), 200).trim()).filter(Boolean).slice(0, 15),
          req: { logo: bool(r.logo), logoPatterns: (Array.isArray(r.logoPatterns) ? r.logoPatterns : String(r.logoPatterns || '').split('\n')).map((x) => str(String(x), 40).trim()).filter(Boolean).slice(0, 10), tag: bool(r.tag), link: bool(r.link), linkText: str(r.linkText, 80).trim(), accountDays: int(r.accountDays, 0, 3650, 0), serverDays: int(r.serverDays, 0, 3650, 0), level: int(r.level, 0, 500, 0), noWarns: bool(r.noWarns) },
          mode: oneOf(p.mode, ['manual', 'assist', 'auto'], 'assist'),
          interview: bool(p.interview),
          acceptAt: int(p.acceptAt, 50, 100, 80),
          criteria: str(p.criteria, 1000),
          duties: str(p.duties, 2000),
          trialDays: int(p.trialDays, 0, 90, 0),
          seats: int(p.seats, 0, 100, 0),
          open: bool(p.open),
          cooldownDays: int(p.cooldownDays, 0, 90, 7),
        };
      });
      Object.assign(conf, {
        enabled: bool(d.enabled),
        reviewChannelId: channelIn(guild, d.reviewChannelId) || '',
        reviewerRoleId: roleIn(guild, d.reviewerRoleId) || '',
        title: str(d.title, 100).trim() || 'تقديم الإدارة',
        description: str(d.description, 1500),
        bannerUrl: /^https?:\/\//.test(String(d.bannerUrl || '')) ? str(d.bannerUrl, 500) : '',
        dm: bool(d.dm),
        positions,
      });
      if (conf.enabled && !conf.reviewChannelId) throw new Error('اختار روم الإدارة اللي بتوصله التقديمات');
      if (conf.enabled && !positions.length) throw new Error('ضيف منصب واحد على الأقل');
      store.save('applyConfig');
      return applySys.refreshPanel(guild).catch(() => {});
    }
    case 'prefix': {
      const v = str(d.prefix, 5).trim();
      const all = store.get('prefixes');
      if (!v) delete all[id];
      else if (/\s/.test(v)) throw new Error('البادئة لا يجب أن تحتوي مسافات');
      else all[id] = v;
      return store.save('prefixes');
    }
    case 'general': {
      store.guild('guildSettings', id).managerRoleId = roleIn(guild, d.managerRoleId);
      return store.save('guildSettings');
    }
    case 'greetings': {
      const ids = [...new Set((Array.isArray(d.channelIds) ? d.channelIds : [d.channelId]).map((c) => channelIn(guild, c)).filter(Boolean))].slice(0, 10);
      Object.assign(store.guild('greetings', id), {
        enabled: bool(d.enabled),
        channelId: ids[0] || '',
        channelIds: ids,
        message: str(d.message, 1800),
        duration: int(d.duration, 0, 3600, 0),
      });
      return store.save('greetings');
    }
    case 'welcome': {
      const conf = store.guild('welcome', id);
      const D = welcome.LAYOUT_DEFAULTS;
      Object.assign(conf, {
        enabled: bool(d.enabled),
        channelId: channelIn(guild, d.channelId),
        message: str(d.message, 1800),
        imageUrl: imageRef(d.imageUrl),
        avatarX: int(d.avatarX, 0, welcome.W, D.avatarX),
        avatarY: int(d.avatarY, 0, welcome.H, D.avatarY),
        avatarRadius: int(d.avatarRadius, 20, 250, D.avatarRadius),
      });
      // full editor (shape, colours, username, custom text) — premium only; kept untouched on free servers
      if (premium.has(id, 'welcomeEditor')) {
        Object.assign(conf, {
          avatarShape: oneOf(d.avatarShape, ['circle', 'rounded', 'square'], D.avatarShape),
          avatarBorderColor: color(d.avatarBorderColor, D.avatarBorderColor),
          avatarBorderWidth: int(d.avatarBorderWidth, 0, 30, D.avatarBorderWidth),
          nameEnabled: bool(d.nameEnabled),
          nameX: int(d.nameX, 0, welcome.W, D.nameX),
          nameY: int(d.nameY, 0, welcome.H, D.nameY),
          nameSize: int(d.nameSize, 10, 140, D.nameSize),
          nameColor: color(d.nameColor, D.nameColor),
          nameAlign: oneOf(d.nameAlign, ['left', 'center', 'right'], D.nameAlign),
          textEnabled: bool(d.textEnabled),
          text: str(d.text, 120),
          textX: int(d.textX, 0, welcome.W, D.textX),
          textY: int(d.textY, 0, welcome.H, D.textY),
          textSize: int(d.textSize, 10, 140, D.textSize),
          textColor: color(d.textColor, D.textColor),
          textAlign: oneOf(d.textAlign, ['left', 'center', 'right'], D.textAlign),
        });
      }
      return store.save('welcome');
    }
    case 'autoLine': {
      Object.assign(store.guild('autoLine', id), { enabled: bool(d.enabled), channels: channelsIn(guild, d.channels), imageUrl: url(d.imageUrl) });
      return store.save('autoLine');
    }
    case 'feedback': {
      const emojis = (Array.isArray(d.emojis) ? d.emojis : [])
        .map((e) => String(e).trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((e) => {
          const m = e.match(/^<a?:(\w+):(\d+)>$/);
          return m ? `${m[1]}:${m[2]}` : e.slice(0, 64);
        });
      Object.assign(store.guild('feedback', id), { enabled: bool(d.enabled), channels: channelsIn(guild, d.channels), emojis });
      return store.save('feedback');
    }
    case 'jail': {
      Object.assign(store.guild('jailConfig', id), {
        roleId: roleIn(guild, d.roleId),
        channelId: channelIn(guild, d.channelId),
        logChannelId: channelIn(guild, d.logChannelId),
      });
      return store.save('jailConfig');
    }
    case 'tickets': {
      const conf = tickets.config(id);
      const lim = premium.limits(id);
      const rawDepts = (Array.isArray(d.departments) ? d.departments : []).filter((x) => x && str(x.label).trim());
      // after premium ends: what was already saved stays (it just stops working past the free limit) — only ADDING beyond the limit is blocked
      const prevDepts = (conf.departments || []).length;
      if (rawDepts.length > lim.ticketDepartments && rawDepts.length > prevDepts) throw new Error(premium.limitText('ticketDepartments', lim.ticketDepartments));
      if (int(d.maxOpen, 1, 5, 1) > lim.ticketMaxOpen && int(d.maxOpen, 1, 5, 1) > (conf.maxOpen || 1)) throw new Error(premium.limitText('ticketMaxOpen', lim.ticketMaxOpen));
      const oldDepts = conf.departments || [];
      const departments = rawDepts.slice(0, 25).map((x, i) => {
        const deptId = str(x.id, 50) || `dept-${i}-${Date.now().toString(36)}`;
        const questions = premium.has(id, 'ticketForms')
          ? (Array.isArray(x.questions) ? x.questions : String(x.questions || '').split('\n'))
              .map((q) => str(q, 45).trim())
              .filter(Boolean)
              .slice(0, 5)
          : oldDepts.find((o) => o.id === deptId)?.questions || []; // keep saved forms on free servers
        const shop = Boolean(x.shop) && require('../systems/shop').config().guildId === id;
        return { id: deptId, label: str(x.label, 80).trim(), description: str(x.description, 100).trim(), emoji: E.normalize(x.emoji) || '', questions, ...(shop ? { shop: true } : {}) };
      });
      if (premium.has(id, 'ticketAutoClose')) conf.autoCloseHours = int(d.autoCloseHours, 0, 720, 0);
      Object.assign(conf, {
        categoryId: channelIn(guild, d.categoryId, [ChannelType.GuildCategory]),
        logChannelId: channelIn(guild, d.logChannelId),
        supportRoleId: roleIn(guild, d.supportRoleId),
        maxOpen: int(d.maxOpen, 1, 5, 1),
        alertCooldown: int(d.alertCooldown, 60, 86400, 600),
        panelTitle: str(d.panelTitle, 100) || 'مركز الدعم',
        panelDescription: str(d.panelDescription, 3000),
        bannerUrl: url(d.bannerUrl),
        departments: departments.length ? departments : tickets.DEFAULT_DEPARTMENTS,
      });
      return store.save('ticketConfig');
    }
    case 'vanity': {
      const conf = store.guild('linkProtection', id);
      Object.assign(conf, {
        vanityProtect: bool(d.vanityProtect) && Boolean(guild.vanityURLCode),
        punishment: ['ban', 'kick', 'strip'].includes(d.punishment) ? d.punishment : 'ban',
        whitelist: (Array.isArray(d.whitelist) ? d.whitelist : []).map((x) => String(x).match(/\d{17,21}/)?.[0]).filter(Boolean).slice(0, 50),
      });
      if (conf.vanityProtect) conf.savedVanity = guild.vanityURLCode;
      return store.save('linkProtection');
    }
    case 'logs': {
      const conf = store.guild('logsConfig', id);
      for (const key of Object.keys(LOG_TYPES)) {
        const ch = channelIn(guild, d[key]);
        if (ch) conf[key] = ch;
        else delete conf[key];
      }
      return store.save('logsConfig');
    }
    case 'invites': {
      Object.assign(store.guild('inviteConfig', id), {
        logChannelId: channelIn(guild, d.logChannelId),
        minAccountAgeDays: int(d.minAccountAgeDays, 0, 365, 30),
        pointHoldHours: int(d.pointHoldHours, 0, 720, 0),
      });
      if ('wheelEnabled' in d) {
        store.guild('wheelConfig', id).enabled = bool(d.wheelEnabled);
        // the picture is premium; on free servers the saved one is kept (it comes back on renewal)
        if (premium.has(id, 'wheelImage') && 'wheelImage' in d) store.guild('wheelConfig', id).image = imageRef(d.wheelImage);
        store.save('wheelConfig');
      }
      return store.save('inviteConfig');
    }
    case 'replies': {
      const replies = (Array.isArray(d.replies) ? d.replies : [])
        .filter((r) => str(r.trigger).trim() && str(r.response).trim())
        .slice(0, 1000) // no plan limit — safety cap only
        .map((r) => ({ trigger: str(r.trigger, 100).trim(), response: str(r.response, 1800), exact: bool(r.exact) }));
      Object.assign(store.guild('customReplies', id), { enabled: bool(d.enabled), replies });
      return store.save('customReplies');
    }
    case 'giveaway': {
      const conf = store.guild('giveawayConfig', id, giveaways.DEFAULT_CONFIG);
      if (premium.has(id, 'giveawayMessage')) {
        Object.assign(conf, {
          title: str(d.title, 200),
          description: str(d.description, 2000),
          color: color(d.color, giveaways.DEFAULT_CONFIG.color),
          imageUrl: url(d.imageUrl),
          reaction: E.normalize(d.reaction) || (/^\p{Extended_Pictographic}/u.test(String(d.reaction || '').trim()) ? String(d.reaction).trim().slice(0, 8) : ''),
          winMessage: str(d.winMessage, 1000),
        });
      }
      if (premium.has(id, 'giveawayRequirements')) {
        Object.assign(conf, {
          requiredRoleId: roleIn(guild, d.requiredRoleId) || '',
          minInvites: int(d.minInvites, 0, 10000, 0),
          minAccountAgeDays: int(d.minAccountAgeDays, 0, 3650, 0),
        });
      }
      if (premium.has(id, 'giveawayBonus')) {
        conf.bonusRoles = (Array.isArray(d.bonusRoles) ? d.bonusRoles : [])
          .map((b) => ({ roleId: roleIn(guild, b.roleId), entries: int(b.entries, 1, 10, 2) }))
          .filter((b) => b.roleId)
          .slice(0, 10);
      }
      return store.save('giveawayConfig');
    }
    case 'kafeel': {
      const conf = store.guild('kafeelConfig', id, {});
      Object.assign(conf, {
        enabled: bool(d.enabled),
        channelId: channelIn(guild, d.channelId) || '',
        sponsorRoleId: roleIn(guild, d.sponsorRoleId) || '',
        goalMessages: int(d.goalMessages, 3, 500, 20),
        days: int(d.days, 1, 30, 7),
        rewardXp: int(d.rewardXp, 0, 5000, 150),
        maxPerSponsor: int(d.maxPerSponsor, 1, 20, 3),
      });
      return store.save('kafeelConfig');
    }
    case 'prayer': {
      const conf = store.guild('prayerConfig', id, {});
      Object.assign(conf, {
        enabled: bool(d.enabled),
        channelId: channelIn(guild, d.channelId) || '',
        city: oneOf(d.city, Object.keys(prayer.CITIES), 'amman'),
        roleId: roleIn(guild, d.roleId) || '',
        prayers: (Array.isArray(d.prayers) ? d.prayers : prayer.ADHAN).filter((x) => prayer.ADHAN.includes(x)),
        ramadan: bool(d.ramadan),
        suhoorMinutes: int(d.suhoorMinutes, 10, 120, 30),
      });
      if (conf.enabled && !conf.channelId) throw new Error('اختار قناة الأذان');
      return store.save('prayerConfig');
    }
    case 'games': {
      const conf = store.guild('gamesConfig', id, {});
      const n = d.night || {};
      const time = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(n.time || '')) ? String(n.time).padStart(5, '0') : '21:00';
      Object.assign(conf, {
        enabled: bool(d.enabled),
        channels: (Array.isArray(d.channels) ? d.channels : []).map((c) => channelIn(guild, c)).filter(Boolean).slice(0, 20),
        starterRoleId: roleIn(guild, d.starterRoleId) || '',
        lobbySeconds: int(d.lobbySeconds, 10, 120, 30),
        winXp: int(d.winXp, 0, 1000, 60),
        playXp: int(d.playXp, 0, 500, 10),
        perks: bool(d.perks),
        championRoleId: roleIn(guild, d.championRoleId) || '',
        night: {
          ...gamesSys.DEFAULT.night,
          enabled: bool(n.enabled),
          channelId: channelIn(guild, n.channelId) || '',
          day: int(n.day, 0, 6, 4),
          time,
          roleId: roleIn(guild, n.roleId) || '',
          games: (Array.isArray(n.games) ? n.games : []).filter((g) => gamesSys.TYPES.has(g)).slice(0, 8),
        },
      });
      if (conf.night.enabled && !conf.night.channelId) throw new Error('اختار روم سهرة الألعاب');
      if (conf.night.enabled && !conf.night.games.length) throw new Error('اختار لعبة وحدة على الأقل للسهرة');
      return store.save('gamesConfig');
    }
    case 'gameArt': {
      needPremium(guild, 'gameArt');
      const ga = store.guild('gameArt', id);
      for (const key of [...require('../utils/art').GAME_ART_KEYS, 'rouletteWheel']) {
        if (!(key in d)) continue;
        const v = d[key] ? imageRef(d[key]) : '';
        if (v) ga[key] = v;
        else {
          delete ga[key];
          media.remove(`game-${key}-${id}`);
        }
      }
      return store.save('gameArt');
    }
    case 'tempVoice': {
      const conf = store.guild('tempVoice', id, { ...tempvoice.DEFAULT });
      Object.assign(conf, {
        enabled: bool(d.enabled),
        hubId: channelIn(guild, d.hubId, [ChannelType.GuildVoice]) || '',
        categoryId: channelIn(guild, d.categoryId, [ChannelType.GuildCategory]) || '',
        nameTemplate: String(d.nameTemplate || tempvoice.DEFAULT.nameTemplate).slice(0, 80),
        limit: int(d.limit, 0, 99, 0),
      });
      if (conf.enabled && !conf.hubId) throw new Error('اختار الروم الصوتي اللي بيدخله العضو، أو اضغط "جهّزها لحالك"');
      return store.save('tempVoice');
    }
    case 'appeals': {
      const conf = store.guild('appealsConfig', id, { ...appealsSys.DEFAULT });
      Object.assign(conf, { enabled: bool(d.enabled), channelId: channelIn(guild, d.channelId) || '', cooldownDays: int(d.cooldownDays, 1, 90, 7) });
      if (conf.enabled && !conf.channelId) throw new Error('اختار روم الإدارة اللي بتوصله طلبات فك الحظر');
      return store.save('appealsConfig');
    }
    case 'khatma': {
      const conf = store.guild('khatmaConfig', id, { ...khatmaSys.DEFAULT });
      Object.assign(conf, { channelId: channelIn(guild, d.channelId) || '', roleId: roleIn(guild, d.roleId) || '', maxPerUser: int(d.maxPerUser, 1, 10, 2), holdHours: int(d.holdHours, 6, 336, 48) });
      store.save('khatmaConfig');
      return khatmaSys.refresh(guild).catch(() => {});
    }
    case 'radar': {
      const conf = store.guild('radarConfig', id, { ...radarSys.DEFAULT });
      Object.assign(conf, { enabled: bool(d.enabled), channelId: channelIn(guild, d.channelId) || '', roleId: roleIn(guild, d.roleId) || '', silentHours: int(d.silentHours, 2, 168, 24), mentionSponsor: bool(d.mentionSponsor) });
      if (conf.enabled && !conf.channelId) throw new Error('اختار روم تنبيهات الرادار');
      return store.save('radarConfig');
    }
    case 'backup': {
      const conf = store.guild('backupConfig', id, { ...backupSys.DEFAULT });
      conf.auto = bool(d.auto);
      return store.save('backupConfig');
    }
    case 'adhkar': {
      const conf = store.guild('adhkarConfig', id, {});
      const iv = int(d.interval, 0, 1440, 60);
      Object.assign(conf, {
        enabled: bool(d.enabled),
        channelId: channelIn(guild, d.channelId) || '',
        interval: iv === 0 ? 0 : Math.max(15, iv),
        sabahMasa: bool(d.sabahMasa),
        friday: bool(d.friday),
        roleId: roleIn(guild, d.roleId) || '',
      });
      if (conf.enabled && !conf.channelId) throw new Error('اختار قناة الأذكار');
      return store.save('adhkarConfig');
    }
    case 'wrapped': {
      const conf = store.guild('wrappedConfig', id, {});
      const plus = premium.has(id, 'wrappedPlus');
      Object.assign(conf, {
        enabled: bool(d.enabled),
        channelId: channelIn(guild, d.channelId) || '',
        tz: prayer.CITIES[d.city]?.tz || conf.tz || 'Asia/Amman',
        weekly: plus ? bool(d.weekly) : Boolean(conf.weekly),
        accent: plus && /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent : conf.accent || '#7950E8',
      });
      if (conf.enabled && !conf.channelId) throw new Error('اختار قناة الملخص');
      return store.save('wrappedConfig');
    }
    case 'automod': {
      const conf = store.guild('automodConfig', id, {});
      const D = automod.DEFAULT;
      const plus = premium.has(id, 'automodPlus');
      const act = (v, def) => oneOf(v, ['delete', 'timeout', 'kick', 'ban'], def);
      const anyCh = (cid) => channelIn(guild, cid, [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildForum]);
      const r = (k) => d[k] || {};
      Object.assign(conf, {
        enabled: bool(d.enabled),
        logChannelId: channelIn(guild, d.logChannelId) || '',
        timeoutMinutes: int(d.timeoutMinutes, 1, 1440, D.timeoutMinutes),
        ignoreChannels: (Array.isArray(d.ignoreChannels) ? d.ignoreChannels.map(anyCh).filter(Boolean) : []).slice(0, 50),
        ignoreRoles: (Array.isArray(d.ignoreRoles) ? d.ignoreRoles.map((x) => roleIn(guild, x)).filter(Boolean) : []).slice(0, 25),
        words: { on: bool(r('words').on), action: act(r('words').action, 'delete'), list: String(r('words').list || '').split(/[\n,،]/).map((w) => w.trim().slice(0, 60)).filter(Boolean).slice(0, 300) },
        links: { on: bool(r('links').on), action: act(r('links').action, 'delete'), allow: String(r('links').allow || '').split(/[\s,،]+/).map((w) => w.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean).slice(0, 100) },
        invites: { on: bool(r('invites').on), action: act(r('invites').action, 'delete') },
        spam: { on: bool(r('spam').on), action: act(r('spam').action, 'timeout'), messages: int(r('spam').messages, 3, 30, 6), seconds: int(r('spam').seconds, 2, 60, 5) },
        mentions: { on: bool(r('mentions').on), action: act(r('mentions').action, 'timeout'), max: int(r('mentions').max, 1, 50, 5) },
      });
      if (plus) {
        Object.assign(conf, {
          caps: { on: bool(r('caps').on), action: act(r('caps').action, 'delete'), percent: int(r('caps').percent, 30, 100, 70), min: int(r('caps').min, 5, 200, 12) },
          emoji: { on: bool(r('emoji').on), action: act(r('emoji').action, 'delete'), max: int(r('emoji').max, 1, 100, 10) },
          escalation: {
            on: bool(r('escalation').on),
            resetHours: int(r('escalation').resetHours, 1, 720, 24),
            steps: (Array.isArray(r('escalation').steps) ? r('escalation').steps : [])
              .map((x) => ({ strikes: int(x.strikes, 1, 100, 0), action: oneOf(x.action, ['timeout', 'kick', 'ban'], 'timeout'), minutes: int(x.minutes, 1, 40320, 10) }))
              .filter((x) => x.strikes)
              .slice(0, 5),
          },
          channelRules: Object.fromEntries(
            Object.entries(d.channelRules && typeof d.channelRules === 'object' ? d.channelRules : {})
              .filter(([cid]) => anyCh(cid))
              .slice(0, 50)
              .map(([cid, v]) => [cid, { off: (Array.isArray(v?.off) ? v.off : []).filter((x) => automod.RULES.includes(x)) }])
          ),
        });
      }
      return store.save('automodConfig');
    }
    case 'verify': {
      const conf = store.guild('verifyConfig', id, {});
      const plus = premium.has(id, 'captcha');
      Object.assign(conf, {
        enabled: bool(d.enabled),
        channelId: channelIn(guild, d.channelId) || '',
        roleId: roleIn(guild, d.roleId) || '',
        removeRoleId: roleIn(guild, d.removeRoleId) || '',
        title: str(d.title, 100).trim() || verify.DEFAULT.title,
        text: str(d.text, 1500).trim() || verify.DEFAULT.text,
        mode: plus ? oneOf(d.mode, ['button', 'captcha'], 'button') : conf.mode || 'button',
        minAccountDays: plus ? int(d.minAccountDays, 0, 365, 0) : conf.minAccountDays || 0,
      });
      if (conf.enabled && (!conf.channelId || !conf.roleId)) throw new Error('اختار قناة ورتبة التحقق');
      return store.save('verifyConfig');
    }
    case 'purge': {
      const max = premium.limit(id, 'purgeChannels');
      const list = (Array.isArray(d.list) ? d.list : []).map((x) => ({ channelId: channelIn(guild, x.channelId), hours: int(x.hours, 1, 24 * 30, 24), keepPinned: x.keepPinned !== false && x.keepPinned !== 'false' })).filter((x) => x.channelId);
      const old = purge.listOf(id);
      if (list.length > max && list.length > old.length) throw new Error(premium.limitText('purgeChannels', max));
      store.get('purgeConfig')[id] = list.map((x) => ({ ...x, last: old.find((o) => o.channelId === x.channelId)?.last || Date.now() }));
      return store.save('purgeConfig');
    }
    case 'levels': {
      const conf = store.guild('levelConfig', id, {});
      const D = levels.DEFAULT_CONFIG;
      const textMin = int(d.textMin, 1, 100, D.textMin);
      const rolesIn = (list) => (Array.isArray(list) ? list.map((r) => roleIn(guild, r)).filter(Boolean).slice(0, 25) : []);
      const anyChannel = (cid) => channelIn(guild, cid, [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildCategory, ChannelType.GuildForum]);
      Object.assign(conf, {
        enabled: bool(d.enabled),
        textMin,
        textMax: Math.max(textMin, int(d.textMax, 1, 200, D.textMax)),
        cooldown: int(d.cooldown, 0, 3600, D.cooldown),
        minLength: int(d.minLength, 0, 50, D.minLength),
        voicePerMin: int(d.voicePerMin, 0, 100, D.voicePerMin),
        voiceRequireOthers: bool(d.voiceRequireOthers),
        announce: oneOf(d.announce, ['current', 'channel', 'dm', 'off'], D.announce),
        announceChannelId: channelIn(guild, d.announceChannelId) || '',
        message: str(d.message, 1000).trim() || D.message,
        stackRewards: bool(d.stackRewards),
        noXpChannels: (Array.isArray(d.noXpChannels) ? d.noXpChannels.map(anyChannel).filter(Boolean) : []).slice(0, 50),
        noXpRoles: rolesIn(d.noXpRoles),
        rewards: (Array.isArray(d.rewards) ? d.rewards : [])
          .map((r) => ({ level: int(r.level, 1, 500, 0), roleId: roleIn(guild, r.roleId), type: r.type === 'voice' ? 'voice' : 'text' }))
          .filter((r) => r.level && r.roleId)
          .slice(0, 25),
        echo: {
          enabled: bool(d.echo?.enabled),
          reply: int(d.echo?.reply, 0, 100, D.echo.reply),
          reaction: int(d.echo?.reaction, 0, 100, D.echo.reaction),
          dailyCap: int(d.echo?.dailyCap, 0, 5000, D.echo.dailyCap),
        },
      });
      if (premium.has(id, 'rankCard')) {
        conf.card = { accent: /^#[0-9a-f]{6}$/i.test(d.card?.accent || '') ? d.card.accent : '#7950E8', background: d.card?.background && media.isLocal(d.card.background) ? d.card.background : /^https:\/\/\S+$/.test(d.card?.background || '') ? d.card.background : '' };
      }
      if (premium.has(id, 'xpBoost')) {
        const mult = (v) => Math.min(5, Math.max(1, Math.round((Number(v) || 1) * 10) / 10));
        conf.boosts = {
          roles: (Array.isArray(d.boosts?.roles) ? d.boosts.roles : []).map((r) => ({ roleId: roleIn(guild, r.roleId), multiplier: mult(r.multiplier) })).filter((r) => r.roleId).slice(0, 15),
          channels: (Array.isArray(d.boosts?.channels) ? d.boosts.channels : []).map((r) => ({ channelId: anyChannel(r.channelId), multiplier: mult(r.multiplier) })).filter((r) => r.channelId).slice(0, 15),
        };
      }
      if (conf.announce === 'channel' && !conf.announceChannelId) throw new Error('اختر قناة رسائل الترقية');
      return store.save('levelConfig');
    }
    case 'protection': {
      const conf = protection.config(id);
      const r = d.antiRaid || {};
      const n = d.antiNuke || {};
      if (premium.has(id, 'antiRaid')) {
        Object.assign(conf.antiRaid, {
          enabled: bool(r.enabled),
          joins: int(r.joins, 3, 100, 10),
          seconds: int(r.seconds, 3, 300, 10),
          action: oneOf(r.action, ['kick', 'ban', 'timeout'], 'kick'),
          newAccountDays: int(r.newAccountDays, 0, 365, 0),
          lockdown: bool(r.lockdown),
        });
      }
      if (premium.has(id, 'antiNuke')) {
        Object.assign(conf.antiNuke, {
          enabled: bool(n.enabled),
          limit: int(n.limit, 1, 50, 3),
          seconds: int(n.seconds, 5, 600, 60),
          punishment: oneOf(n.punishment, ['strip', 'kick', 'ban'], 'strip'),
          whitelist: (Array.isArray(n.whitelist) ? n.whitelist : []).map((x) => String(x).match(/\d{17,21}/)?.[0]).filter(Boolean).slice(0, 50),
          watch: Object.fromEntries(Object.keys(protection.NUKE_ACTIONS).map((k) => [k, bool(n.watch?.[k])])),
        });
      }
      conf.alertChannelId = channelIn(guild, d.alertChannelId) || '';
      if (premium.has(id, 'impersonation')) conf.impersonation = { enabled: bool(d.impersonation?.enabled), action: oneOf(d.impersonation?.action, ['alert', 'timeout', 'kick', 'ban'], 'alert') };
      if (premium.has(id, 'antiNuke')) {
        conf.antiBot = { enabled: bool(d.antiBot?.enabled), allowVerified: bool(d.antiBot?.allowVerified), punishAdder: bool(d.antiBot?.punishAdder) };
        conf.dangerousPerms = { enabled: bool(d.dangerousPerms?.enabled) };
        conf.serverLock = { enabled: bool(d.serverLock?.enabled) };
      }
      conf.antiScam = { enabled: bool(d.antiScam?.enabled), action: oneOf(d.antiScam?.action, ['delete', 'timeout', 'kick', 'ban'], 'timeout') };
      conf.dehoist = { enabled: bool(d.dehoist?.enabled) };
      return store.save('protectionConfig');
    }
    case 'warns': {
      const conf = store.guild('warnConfig', id, {});
      conf.expireDays = int(d.expireDays, 0, 365, 0);
      conf.dm = bool(d.dm);
      conf.steps = (Array.isArray(d.steps) ? d.steps : [])
        .map((x) => ({ count: int(x.count, 1, 50, 3), action: oneOf(x.action, ['timeout', 'kick', 'ban'], 'timeout'), minutes: int(x.minutes, 1, 40320, 60) }))
        .filter((x, i, a) => a.findIndex((y) => y.count === x.count) === i)
        .sort((a, b) => a.count - b.count)
        .slice(0, 6);
      return store.save('warnConfig');
    }
    default:
      throw new Error('وحدة غير معروفة');
  }
}

// ---------- app ----------
function start(client) {
  const cfg = env();
  const app = express();
  app.disable('x-powered-by');
  const jsonSmall = express.json({ limit: '256kb' });
  const jsonLarge = express.json({ limit: '12mb' }); // image uploads (sent as base64)
  app.use((req, res, next) => (/^\/api\/(upload|bot-profile)\//.test(req.path) ? jsonLarge : jsonSmall)(req, res, next));
  app.use((req, res, next) => {
    res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    next();
  });
  app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
  app.use('/media', express.static(media.UPLOADS, { maxAge: '7d', index: false, dotfiles: 'deny' }));
  app.use('/fonts', express.static(path.join(__dirname, '..', 'assets', 'fonts'), { maxAge: '30d' }));
  app.use('/art', express.static(path.join(__dirname, '..', 'assets', 'art', 'banner'), { maxAge: '7d', index: false }));

  // Every restart gets a new version stamp on /static links, so browsers never keep an old moderation.js / theme.css
  const BUILD = Date.now().toString(36);
  const pages = new Map();
  const sendView = (res, name, status = 200) => {
    let html = pages.get(name);
    if (!html) {
      html = fs.readFileSync(path.join(VIEWS, `${name}.html`), 'utf8').replace(/(["'])\/static\/([\w./-]+\.(?:js|css))\1/g, `$1/static/$2?v=${BUILD}$1`);
      pages.set(name, html);
    }
    res.status(status).set('Cache-Control', 'no-cache').type('html').send(html);
  };
  const view = (name) => (req, res) => sendView(res, name);
  const needLogin = (req, res, next) => {
    req.session = getSession(req);
    if (!req.session) {
      if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'سجّل الدخول أولاً' });
      return res.redirect('/login');
    }
    next();
  };
  const needGuild = async (req, res, next) => {
    const guild = await canManage(client, req.session, req.params.id);
    if (!guild) {
      if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا السيرفر' });
      return res.redirect('/unauthorized');
    }
    req.guild = guild;
    gctx.run(guild.id, next); // per-server emojis etc. apply to anything this request sends
  };
  const csrf = (req, res, next) => {
    if (req.get('x-csrf-token') !== req.session.csrf) return res.status(403).json({ error: 'رمز الحماية غير صالح، حدّث الصفحة' });
    next();
  };
  const ownerOnly = (req, res, next) => (isOwner(req.session.user.id) ? next() : res.status(403).json({ error: 'لمالك البوت فقط' }));

  // pages
  app.get('/', (req, res) => (getSession(req) ? res.redirect('/home') : sendView(res, 'login')));
  app.get('/home', needLogin, view('home'));
  app.get('/servers', needLogin, view('servers'));
  app.get('/dashboard/:id', needLogin, needGuild, view('moderation'));
  app.get('/dashboard/:id/commands', needLogin, needGuild, view('commands'));
  app.get('/dashboard/:id/overview', needLogin, needGuild, view('server_detail'));
  app.get('/unauthorized', view('unauthorized'));
  app.get('/invite', (req, res) => res.redirect(inviteUrl(/^\d{17,21}$/.test(req.query.guild || '') ? req.query.guild : null)));

  // auth
  app.get('/login', (req, res) => {
    if (!cfg.clientId || !cfg.clientSecret) return res.status(503).send('Dashboard login is not configured: set CLIENT_ID and CLIENT_SECRET in .env');
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, Date.now() + 600_000);
    const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirect, response_type: 'code', scope: 'identify guilds', state, prompt: 'none' });
    res.redirect(`https://discord.com/oauth2/authorize?${q}`);
  });

  app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state || !pendingStates.has(state)) return res.redirect('/?error=state');
    pendingStates.delete(state);
    try {
      const tokenRes = await fetch(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: 'authorization_code',
          code: String(code),
          redirect_uri: cfg.redirect,
        }),
      });
      if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
      const token = await tokenRes.json();
      const [user, guilds] = await Promise.all([discord('/users/@me', token.access_token), discord('/users/@me/guilds', token.access_token)]);
      const sid = crypto.randomBytes(32).toString('hex');
      sessions.set(sid, {
        user: { id: user.id, username: user.username, globalName: user.global_name, avatar: user.avatar },
        guilds: manageableGuilds(guilds),
        token: token.access_token,
        csrf: crypto.randomBytes(24).toString('hex'),
        created: Date.now(),
      });
      setCookie(res, 'mb_sid', sid, SESSION_TTL / 1000);
      res.redirect('/home');
    } catch (err) {
      console.error('[dashboard] oauth', err.message);
      res.redirect('/?error=oauth');
    }
  });

  app.get('/logout', (req, res) => {
    const sid = parseCookies(req).mb_sid;
    if (sid) sessions.delete(sid);
    setCookie(res, 'mb_sid', '', 0);
    res.redirect('/');
  });

  // api: public
  app.get('/api/stats', (req, res) => {
    const up = process.uptime();
    res.json({
      ready: Boolean(client.user),
      name: client.user?.username || 'MarkaBot',
      avatar: client.user?.displayAvatarURL({ size: 256 }) || null,
      servers: client.guilds.cache.size,
      users: client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
      commands: commandsRegistry.commands.size,
      ping: Math.round(client.ws.ping),
      uptime: `${Math.floor(up / 86400)}ي ${Math.floor((up % 86400) / 3600)}س ${Math.floor((up % 3600) / 60)}د`,
      invite: inviteUrl(),
      support: /^https:\/\/\S+$/.test(process.env.SUPPORT_URL || '') ? process.env.SUPPORT_URL : null,
      launch: premium.launchActive() ? { active: true, endsAt: premium.launch().endsAt, giftDays: premium.launch().giftDays } : null,
    });
  });

  // public command list for the landing page (names, descriptions, categories only)
  app.get('/api/public/commands', (req, res) => {
    const out = {};
    for (const c of commandsRegistry.commands.values()) {
      if (c.ownerOnly || c.hidden || c.category === 'owner') continue;
      (out[c.category] ||= []).push({ name: c.name, description: c.description || '' });
    }
    res.json(out);
  });

  // api: session
  app.use('/api', needLogin);

  app.get('/api/me', (req, res) => {
    const u = req.session.user;
    res.json({
      id: u.id,
      username: u.globalName || u.username,
      tag: u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png',
      isOwner: isOwner(u.id),
      csrf: req.session.csrf,
    });
  });

  app.get('/api/guilds', async (req, res) => {
    if (req.query.refresh) {
      try {
        req.session.guilds = manageableGuilds(await discord('/users/@me/guilds', req.session.token));
      } catch {}
    }
    const list = req.session.guilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: iconUrl(g),
      hasBot: client.guilds.cache.has(g.id),
      invite: inviteUrl(g.id),
    }));
    if (isOwner(req.session.user.id)) {
      for (const g of client.guilds.cache.values())
        if (!list.some((x) => x.id === g.id)) list.push({ id: g.id, name: g.name, icon: g.iconURL({ size: 128 }), hasBot: true, ownerView: true });
    }
    list.sort((a, b) => Number(b.hasBot) - Number(a.hasBot) || a.name.localeCompare(b.name));
    res.json(list);
  });

  app.get('/api/guild/:id', needGuild, (req, res) => {
    const g = req.guild;
    res.json({
      id: g.id,
      name: g.name,
      icon: g.iconURL({ size: 128 }),
      banner: g.bannerURL({ size: 1024 }),
      memberCount: g.memberCount,
      ownerId: g.ownerId,
      createdAt: g.createdTimestamp,
      boosts: g.premiumSubscriptionCount || 0,
      tier: g.premiumTier,
      vanity: g.vanityURLCode,
      channels: g.channels.cache.size,
      roles: g.roles.cache.size - 1,
      openTickets: Object.values(store.peek('tickets', g.id) || {}).filter((t) => t.status === 'open').length,
      jailed: Object.keys(store.peek('jail', g.id) || {}).length,
    });
  });

  app.get('/api/guild-metadata/:id', needGuild, (req, res) => {
    const g = req.guild;
    const sorted = [...g.channels.cache.values()].sort((a, b) => a.rawPosition - b.rawPosition);
    res.json({
      text: sorted.filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type)).map((c) => ({ id: c.id, name: c.name, parent: c.parent?.name || null })),
      voice: sorted.filter((c) => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(c.type)).map((c) => ({ id: c.id, name: c.name, parent: c.parent?.name || null })),
      categories: sorted.filter((c) => c.type === ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name })),
      roles: [...g.roles.cache.values()]
        .filter((r) => r.id !== g.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, managed: r.managed, editable: r.editable, members: r.members.size })),
      logTypes: Object.entries(LOG_TYPES).map(([key, t]) => ({ key, label: t.label, group: t.group })),
      logGroups: Object.fromEntries(Object.entries(require('../systems/logs').LOG_GROUPS).map(([k, g]) => [k, g.label])),
      auditLog: Boolean(g.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)),
    });
  });

  app.get('/api/settings/:id', needGuild, (req, res) => res.json(readSettings(req.guild)));

  app.post('/api/settings/:id', needGuild, csrf, (req, res) => {
    try {
      writeSettings(req.guild, String(req.body.module), req.body.data || {});
      botlog.log('dashboard', `عدّل إعدادات «${MODULE_NAMES[req.body.module] || req.body.module}»`, { user: who(req), guild: req.guild });
      res.json({ ok: true, settings: readSettings(req.guild) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/ticket-panel/:id', needGuild, csrf, async (req, res) => {
    const ch = req.guild.channels.cache.get(String(req.body.channelId));
    if (!ch?.isTextBased()) return res.status(400).json({ error: 'اختر قناة صالحة' });
    if (!tickets.config(req.guild.id).categoryId) return res.status(400).json({ error: 'حدد تصنيف التذاكر واحفظ الإعدادات أولاً' });
    try {
      await ch.send(tickets.buildPanel(req.guild));
      botlog.log('dashboard', `أرسل لوحة التذاكر في <#${ch.id}>`, { user: who(req), guild: req.guild });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: 'تعذر الإرسال، تحقق من صلاحيات البوت في القناة' });
    }
  });

  app.post('/api/logs/:id/auto', needGuild, csrf, async (req, res) => {
    try {
      const mode = ['single', 'grouped'].includes(req.body?.mode) ? req.body.mode : 'separate';
      const r = await require('../systems/logs').autoSetup(req.guild, { mode, overwrite: Boolean(req.body?.overwrite) });
      res.json({ ok: true, made: r.made.length, set: r.set, skipped: r.skipped, warn: r.warn });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/jail/:id/release', needGuild, csrf, async (req, res) => {
    const { release } = require('../systems/jail');
    const r = await release(req.guild, String(req.body.userId), { by: req.session.user.id, reason: 'تحرير من لوحة التحكم' }).catch((e) => ({ error: e.message }));
    if (r.error) return res.status(400).json({ error: r.error });
    botlog.log('dashboard', `حرّر <@${req.body.userId}> من السجن`, { user: who(req), guild: req.guild });
    res.json({ ok: true });
  });

  app.get('/api/staff/:id', needGuild, (req, res) => {
    const data = store.peek('staffRatings', req.guild.id) || {};
    const list = Object.entries(data)
      .map(([id, s]) => {
        const m = req.guild.members.cache.get(id);
        const count = s.ratings?.length || 0;
        return {
          id,
          name: m?.displayName || id,
          avatar: m?.displayAvatarURL({ size: 64 }) || null,
          claimed: s.claimed || 0,
          closed: s.closed || 0,
          ratings: count,
          average: count ? s.ratings.reduce((a, r) => a + r.stars, 0) / count : 0,
        };
      })
      .sort((a, b) => b.claimed - a.claimed)
      .slice(0, 25);
    res.json(list);
  });

  // ---------- overview (real data only) ----------
  app.get('/api/overview/:id', needGuild, (req, res) => {
    const g = req.guild;
    const id = g.id;
    const DAY = 86_400_000;
    const now = Date.now();
    const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const today = startOfDay(now);
    const name = (uid) => (uid ? g.members.cache.get(uid)?.displayName || client.users.cache.get(uid)?.username || null : null);

    const tickets = Object.values(store.peek('tickets', id) || {});
    const jail = Object.entries(store.peek('jail', id) || {});
    const invites = store.peek('invites', id) || {};
    const gws = giveaways.list().filter((x) => x.guildId === id);
    const joins = [];
    for (const [inviterId, e] of Object.entries(invites)) for (const r of e?.invited || []) if (r.joinedAt) joins.push({ ...r, inviterId });

    // 14-day series
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(today - i * DAY);
    const bucket = (ts) => days.findIndex((d) => ts >= d && ts < d + DAY);
    const series = days.map((d) => ({ day: d, joins: 0, tickets: 0 }));
    for (const j of joins) { const b = bucket(j.joinedAt); if (b >= 0) series[b].joins++; }
    for (const t of tickets) { const b = bucket(t.openedAt); if (b >= 0) series[b].tickets++; }

    // recent events from stored records
    const events = [];
    for (const t of tickets) {
      events.push({ type: 'ticket_open', at: t.openedAt, user: name(t.ownerId), dept: t.department || null, n: t.number || null });
      if (t.closedAt) events.push({ type: 'ticket_close', at: t.closedAt, user: name(t.ownerId), n: t.number || null });
    }
    for (const [uid, r] of jail) events.push({ type: 'jail', at: r.at, user: name(uid), by: name(r.by) });
    for (const x of gws) if (x.ended) events.push({ type: 'giveaway_end', at: x.endTime, prize: x.prize, winners: (x.winners || []).map(name).filter(Boolean) });
    for (const j of joins) events.push({ type: j.fake ? 'join_fake' : 'join', at: j.joinedAt, user: name(j.id), by: name(j.inviterId) });
    events.sort((a, b) => b.at - a.at);

    const set = (n) => store.peek(n, id) || {};
    const logsCount = Object.keys(set('logsConfig')).length;
    const prot = set('protectionConfig');
    res.json({
      bot: { ready: Boolean(client.user), ping: Math.round(client.ws.ping) },
      stats: {
        members: g.memberCount,
        boosts: g.premiumSubscriptionCount || 0,
        openTickets: tickets.filter((t) => t.status === 'open').length,
        ticketsWeek: tickets.filter((t) => t.openedAt > now - 7 * DAY).length,
        jailed: jail.length,
        activeGiveaways: gws.filter((x) => !x.ended).length,
        joinsToday: joins.filter((j) => j.joinedAt >= today).length,
        joinsWeek: joins.filter((j) => j.joinedAt > now - 7 * DAY).length,
      },
      series,
      events: events.slice(0, 12),
      modules: {
        welcome: Boolean(set('welcome').enabled),
        tickets: Boolean(set('ticketConfig').categoryId),
        giveaways: gws.length > 0,
        logs: logsCount > 0,
        jail: Boolean(set('jailConfig').roleId),
        protection: Boolean(prot.antiRaid?.enabled || prot.antiNuke?.enabled || set('linkProtection').vanityProtect),
        replies: Boolean(set('customReplies').enabled),
        invites: Boolean(set('inviteConfig').logChannelId),
        levels: levels.config(id).enabled,
        automod: automod.config(id).enabled,
        verify: verify.config(id).enabled,
        kafeel: kafeel.config(id).enabled,
        prayer: prayer.config(id).enabled,
      },
      logsCount,
    });
  });

  // ---------- giveaways management ----------
  const gwView = (g, x) => ({
    messageId: x.messageId,
    channelId: x.channelId,
    channel: g.channels.cache.get(x.channelId)?.name || null,
    prize: x.prize,
    winnersCount: x.winnersCount,
    endTime: x.endTime,
    ended: Boolean(x.ended),
    entrants: (x.entrants || []).length,
    winners: (x.winners || []).map((w) => ({ id: w, name: g.members.cache.get(w)?.displayName || client.users.cache.get(w)?.username || w })),
    host: g.members.cache.get(x.hostId)?.displayName || x.hostName || null,
    req: x.req || null,
    url: `https://discord.com/channels/${g.id}/${x.channelId}/${x.messageId}`,
  });

  // role menus: save + publish / delete
  app.post('/api/role-menus/:id', needGuild, csrf, async (req, res) => {
    const guild = req.guild;
    const d = req.body || {};
    const menus = roleMenus.menusOf(guild.id);
    try {
      if (d.action === 'delete') {
        const m = menus[d.menuId];
        if (m?.messageId) await guild.channels.cache.get(m.channelId)?.messages.delete(m.messageId).catch(() => {});
        delete menus[d.menuId];
        store.save('roleMenus');
        return res.json({ ok: true, menus: Object.values(menus) });
      }
      const plus = premium.has(guild.id, 'roleMenusPlus');
      const isNew = !d.menu?.id || !menus[d.menu.id];
      const max = premium.limit(guild.id, 'roleMenus');
      if (isNew && Object.keys(menus).length >= max) throw new Error(premium.limitText('roleMenus', max));
      const m = d.menu || {};
      const menuId = isNew ? Date.now().toString(36) : m.id;
      const roles = (Array.isArray(m.roles) ? m.roles : [])
        .map((r) => ({ roleId: roleIn(guild, r.roleId), label: str(r.label, 80).trim(), emoji: E.normalize(r.emoji) || '', style: oneOf(r.style, Object.keys(roleMenus.STYLES), 'secondary') }))
        .filter((r) => r.roleId)
        .slice(0, 25);
      menus[menuId] = {
        ...(menus[menuId] || {}),
        id: menuId,
        channelId: channelIn(guild, m.channelId) || '',
        title: str(m.title, 200).trim() || 'اختار رتبك',
        description: str(m.description, 2000),
        color: /^#?[0-9a-f]{6}$/i.test(m.color || '') ? m.color : '',
        image: /^https:\/\/\S+$/.test(m.image || '') ? m.image : '',
        mode: plus ? oneOf(m.mode, ['buttons', 'select'], 'buttons') : menus[menuId]?.mode || 'buttons',
        exclusive: bool(m.exclusive),
        tempMinutes: plus ? int(m.tempMinutes, 0, 60 * 24 * 90, 0) : menus[menuId]?.tempMinutes || 0,
        roles,
      };
      store.save('roleMenus');
      await roleMenus.publish(guild, menuId);
      botlog.log('dashboard', `نشر قائمة رتب «${menus[menuId].title}»`, { user: who(req), guild });
      res.json({ ok: true, menus: Object.values(menus) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // embed builder: send now / schedule (premium) / unschedule
  app.post('/api/embed/:id', needGuild, csrf, async (req, res) => {
    const guild = req.guild;
    const d = req.body || {};
    try {
      if (d.action === 'unschedule') {
        embeds.unschedule(guild.id, str(d.sid, 20));
      } else {
        const embed = embeds.clean(d.embed);
        const channelId = channelIn(guild, d.channelId);
        if (!channelId) throw new Error('اختار القناة');
        const sender = d.sender?.name ? { name: str(d.sender.name, 80), avatar: str(d.sender.avatar, 500) } : null;
        if (d.action === 'schedule') {
          needPremium(guild, 'embedSchedule');
          embeds.schedule(guild.id, { channelId, embed, sender, at: d.at, repeatHours: d.repeatHours });
        } else {
          if (sender) needPremium(guild, 'embedSchedule');
          await embeds.send(guild, channelId, embed, sender);
          botlog.log('dashboard', `أرسل رسالة إمبد في #${guild.channels.cache.get(channelId)?.name}`, { user: who(req), guild });
        }
      }
      res.json({ ok: true, scheduled: embeds.listOf(guild.id).map(({ id: sid, channelId, at, repeatHours, embed }) => ({ id: sid, channelId, at, repeatHours, title: embed.title || embed.content?.slice(0, 60) || '—' })) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/verify/:id/publish', needGuild, csrf, async (req, res) => {
    try {
      await verify.publish(req.guild);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/purge/:id/now', needGuild, csrf, async (req, res) => {
    const ch = req.guild.channels.cache.get(channelIn(req.guild, req.body.channelId));
    if (!ch) return res.status(400).json({ error: 'القناة مش موجودة' });
    const n = await purge.purgeChannel(ch, req.body.keepPinned !== false);
    botlog.log('dashboard', `مسح ${n} رسالة من #${ch.name}`, { user: who(req), guild: req.guild });
    res.json({ ok: true, deleted: n });
  });

  // staff performance report (free: once / 30 days)
  app.post('/api/staff-report/:id', needGuild, csrf, async (req, res) => {
    const can = staffSys.canReport(req.guild.id);
    if (!can.ok) return res.status(403).json({ error: `التقرير المجاني مرة بالشهر — الجاي ${new Date(can.nextAt).toLocaleDateString('ar')}. بالبريميوم 👑 وقت ما بدك.`, nextAt: can.nextAt });
    const rows = await staffSys.report(req.guild);
    staffSys.markReported(req.guild.id);
    const names = Object.fromEntries(rows.map((r) => [r.id, req.guild.members.cache.get(r.id)?.displayAvatarURL({ size: 64 }) || null]));
    res.json({ rows: rows.map((r) => ({ ...r, avatar: names[r.id] })), next: staffSys.canReport(req.guild.id) });
  });

  // post the server summary now (once an hour)
  const wrappedLast = new Map();
  app.post('/api/wrapped/:id/post', needGuild, csrf, async (req, res) => {
    if (Date.now() - (wrappedLast.get(req.guild.id) || 0) < 3_600_000) return res.status(429).json({ error: 'نشرت الملخص قبل شوي، جرّب بعد ساعة' });
    wrappedLast.set(req.guild.id, Date.now());
    const ok = await wrapped.post(req.guild, wrapped.monthKey());
    if (!ok) return res.status(400).json({ error: 'اختار قناة الملخص واحفظ أول' });
    res.json({ ok: true });
  });

  // temp voice: create the hub + category in one click
  app.post('/api/tempvoice/:id/setup', needGuild, csrf, async (req, res) => {
    try {
      const { hub } = await tempvoice.setup(req.guild);
      res.json({ ok: true, hubId: hub.id, config: tempvoice.config(req.guild.id) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // backup: take a snapshot now
  app.post('/api/backup/:id/create', needGuild, csrf, (req, res) => {
    try {
      const { snap } = backupSys.take(req.guild);
      botlog.log('dashboard', 'أخذ نسخة احتياطية للسيرفر', { user: who(req), guild: req.guild });
      res.json({ ok: true, snap: { at: snap.at, roles: snap.roles.length, channels: snap.channels.length } });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // youtube alerts
  app.post('/api/youtube/:id/add', needGuild, csrf, async (req, res) => {
    const b = req.body || {};
    const channelId = channelIn(req.guild, b.channelId);
    if (!channelId) return res.status(400).json({ error: 'اختار الروم اللي بينزل فيه التنبيه' });
    try {
      const { feed } = await ytSys.add(req.guild, { input: String(b.input || ''), discordChannelId: channelId, roleId: b.roleId === req.guild.id ? req.guild.id : roleIn(req.guild, b.roleId) || '', message: String(b.message || '') });
      res.json({ ok: true, feed: { ytId: feed.ytId, name: feed.name, channelId: feed.discordChannelId, roleId: feed.roleId, errors: 0 } });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post('/api/youtube/:id/remove', needGuild, csrf, (req, res) => {
    const f = ytSys.remove(req.guild.id, String(req.body?.ytId || ''));
    if (!f) return res.status(404).json({ error: 'ما لقيت القناة' });
    res.json({ ok: true });
  });

  // khatma: start a new one from the dashboard
  // ---------- AI assistant ----------
  app.post('/api/ai/:id/fact', needGuild, csrf, (req, res) => {
    try {
      const f = aiStaff.addFact(req.guild.id, str(req.body?.text, 500), { source: 'admin', by: who(req).id });
      res.json({ ok: true, fact: f });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post('/api/ai/:id/fact/delete', needGuild, csrf, (req, res) => {
    aiStaff.removeFact(req.guild.id, String(req.body?.id || ''));
    res.json({ ok: true });
  });
  app.post('/api/ai/:id/lesson', needGuild, csrf, (req, res) => {
    try {
      aiStaff.decidePending(req.guild.id, String(req.body?.id || ''), bool(req.body?.approve), who(req).id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post('/api/ai/:id/test', needGuild, csrf, async (req, res) => {
    const q = str(req.body?.text, 500).trim();
    if (!q) return res.status(400).json({ error: 'اكتب سؤال' });
    if (!aiCore.canUse(req.guild.id)) return res.status(400).json({ error: aiCore.available() ? 'وصل المساعد حده اليومي' : 'مفتاح الذكاء الاصطناعي مش مضاف بالبوت لسا' });
    try {
      const conf = { ...aiStaff.config(req.guild.id), ...(req.body?.draft ? { instructions: str(req.body.draft.instructions, 6000), dialect: oneOf(req.body.draft.dialect, ['auto', 'jordanian', 'gulf', 'egyptian', 'fusha'], 'auto'), name: str(req.body.draft.name, 32) || 'المساعد' } : {}) };
      const system = aiStaff.systemPrompt(req.guild, conf, { about: q });
      const r = await aiCore.chat({ guildId: req.guild.id, system, messages: [{ role: 'user', content: `عضو: ${q}` }], maxTokens: 500 });
      res.json({ ok: true, answer: r.text || '' });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---------- staff applications ----------
  app.post('/api/apply/:id/publish', needGuild, csrf, async (req, res) => {
    const chId = channelIn(req.guild, req.body?.channelId);
    if (!chId) return res.status(400).json({ error: 'اختار روم اللوحة' });
    const conf = applySys.config(req.guild.id);
    if (!conf.reviewChannelId) return res.status(400).json({ error: 'حدد روم المراجعة واحفظ أول' });
    if (!conf.positions.length) return res.status(400).json({ error: 'ضيف منصب واحد على الأقل واحفظ' });
    try {
      await applySys.publish(req.guild, req.guild.channels.cache.get(chId));
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/khatma/:id/start', needGuild, csrf, async (req, res) => {
    const conf = khatmaSys.config(req.guild.id);
    const ch = req.guild.channels.cache.get(conf.channelId);
    if (!ch) return res.status(400).json({ error: 'اختار روم الختمة واحفظ أول' });
    try {
      const w = who(req);
      await khatmaSys.start(req.guild, ch, { id: w.id, username: w.name }, { dedication: String(req.body?.dedication || '').slice(0, 200) });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // leaderboards for the Levels page
  app.get('/api/levels/:id', needGuild, async (req, res) => {
    const guild = req.guild;
    const type = ['text', 'voice', 'week', 'echo'].includes(req.query.type) ? req.query.type : 'text';
    const list = levels.board(guild.id, type).slice(0, 10);
    const missing = list.filter((e) => !guild.members.cache.has(e.userId)).map((e) => e.userId);
    if (missing.length) await guild.members.fetch({ user: missing }).catch(() => {});
    const all = store.peek('levels', guild.id) || {};
    res.json({
      type,
      members: Object.keys(all).length,
      top: list.map((e, i) => {
        const m = guild.members.cache.get(e.userId);
        return {
          rank: i + 1,
          userId: e.userId,
          name: m?.displayName || e.userId,
          avatar: m?.displayAvatarURL({ size: 64 }) || null,
          textLevel: levels.levelOf(e.tx || 0).level,
          voiceLevel: levels.levelOf(e.vx || 0).level,
          tx: e.tx || 0,
          vx: e.vx || 0,
          vmin: e.vmin || 0,
          echo: e.echo || 0,
          score: e.score,
        };
      }),
    });
  });

  app.get('/api/giveaways/:id', needGuild, (req, res) => {
    const all = giveaways.list().filter((x) => x.guildId === req.guild.id);
    res.json({
      active: all.filter((x) => !x.ended).sort((a, b) => a.endTime - b.endTime).map((x) => gwView(req.guild, x)),
      ended: all.filter((x) => x.ended).sort((a, b) => b.endTime - a.endTime).slice(0, 25).map((x) => gwView(req.guild, x)),
    });
  });

  app.post('/api/giveaways/:id', needGuild, csrf, async (req, res) => {
    const g = req.guild;
    const d = req.body || {};
    try {
      if (d.action === 'create') {
        const channel = g.channels.cache.get(channelIn(g, d.channelId));
        if (!channel) throw new Error('اختر قناة صحيحة');
        const prize = str(d.prize, 200).trim();
        if (!prize) throw new Error('اكتب الجائزة');
        const minutes = int(d.minutes, 1, 60 * 24 * 60, 0);
        if (!minutes) throw new Error('حدد مدة صحيحة');
        const me = g.members.me;
        if (!channel.permissionsFor(me)?.has(['SendMessages', 'AddReactions', 'EmbedLinks'])) throw new Error('البوت يحتاج صلاحيات الإرسال والتفاعل في هذه القناة');
        const u = req.session.user;
        await giveaways.start(channel, {
          prize,
          winnersCount: int(d.winners, 1, 20, 1),
          durationMs: minutes * 60_000,
          hostId: u.id,
          hostName: u.globalName || u.username,
          hostAvatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null,
        });
        botlog.log('dashboard', `بدأ قيفاواي «${prize}»`, { user: who(req), guild: g });
      } else {
        const x = giveaways.find(str(d.messageId, 30));
        if (!x || x.guildId !== g.id) throw new Error('القيفاواي غير موجود');
        if (d.action === 'end') {
          if (x.ended) throw new Error('القيفاواي منتهي بالفعل');
          await giveaways.end(client, x);
        } else if (d.action === 'reroll') {
          if (!x.ended) throw new Error('أنهِ القيفاواي أولاً');
          await giveaways.end(client, x, { reroll: true });
        } else throw new Error('إجراء غير معروف');
        botlog.log('dashboard', `${d.action === 'end' ? 'أنهى' : 'أعاد سحب'} قيفاواي «${x.prize}»`, { user: who(req), guild: g });
      }
      const all = giveaways.list().filter((x) => x.guildId === g.id);
      res.json({
        ok: true,
        active: all.filter((x) => !x.ended).sort((a, b) => a.endTime - b.endTime).map((x) => gwView(g, x)),
        ended: all.filter((x) => x.ended).sort((a, b) => b.endTime - a.endTime).slice(0, 25).map((x) => gwView(g, x)),
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ---------- premium ----------
  app.post('/api/premium/redeem/:id', needGuild, csrf, (req, res) => {
    const r = premium.redeem(str(req.body.code, 40), req.guild.id, req.session.user.id);
    if (!r.ok) return res.status(400).json({ error: r.error });
    botlog.log('dashboard', `فعّل كود بريميوم (${r.days ? `${r.days} يوم` : 'دائم'})`, { user: who(req), guild: req.guild });
    res.json({ ok: true, premium: premium.status(req.guild.id) });
  });

  // image uploads (welcome background)
  app.post('/api/upload/:id', needGuild, csrf, (req, res) => {
    try {
      if (req.body.kind === 'wheel') {
        if (!premium.has(req.guild.id, 'wheelImage')) throw new Error(premium.lockedText('wheelImage'));
        const wc = store.guild('wheelConfig', req.guild.id);
        wc.image = media.saveDataUri(req.body.data, `wheel-${req.guild.id}`);
        store.save('wheelConfig');
        return res.json({ ok: true, url: wc.image });
      }
      if (req.body.kind === 'game') {
        if (!premium.has(req.guild.id, 'gameArt')) throw new Error(premium.lockedText('gameArt'));
        const key = String(req.body.key || '');
        if (![...require('../utils/art').GAME_ART_KEYS, 'rouletteWheel'].includes(key)) throw new Error('لعبة غير معروفة');
        const ga = store.guild('gameArt', req.guild.id);
        ga[key] = media.saveDataUri(req.body.data, `game-${key}-${req.guild.id}`);
        store.save('gameArt');
        return res.json({ ok: true, url: ga[key] });
      }
      if (req.body.kind !== 'welcome') throw new Error('نوع غير معروف');
      const conf = store.guild('welcome', req.guild.id);
      conf.imageUrl = media.saveDataUri(req.body.data, `welcome-${req.guild.id}`);
      store.save('welcome');
      res.json({ ok: true, url: conf.imageUrl });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/welcome-test/:id', needGuild, csrf, async (req, res) => {
    const member = await req.guild.members.fetch(req.session.user.id).catch(() => null);
    if (!member) return res.status(400).json({ error: 'يجب أن تكون عضواً في السيرفر للتجربة' });
    const ok = await welcome.sendWelcome(member, null, { force: true }).catch((e) => ({ error: e.message }));
    if (ok?.error) return res.status(400).json({ error: ok.error });
    if (!ok) return res.status(400).json({ error: 'حدد قناة الترحيب واحفظ الإعدادات أولاً' });
    res.json({ ok: true });
  });

  // bot look in this server
  app.post('/api/bot-profile/:id', needGuild, csrf, async (req, res) => {
    try {
      if (req.body.reset) {
        await botProfile.reset(req.guild, { keep: false });
        botlog.log('dashboard', 'أعاد شكل البوت للافتراضي', { user: who(req), guild: req.guild });
        return res.json({ ok: true, profile: botProfile.get(req.guild.id) });
      }
      needPremium(req.guild, 'botProfile');
      const d = req.body || {};
      const data = { nick: d.nick, bio: d.bio };
      for (const key of ['avatar', 'banner']) {
        if (d[key] === undefined) continue;
        if (!d[key]) data[key] = null;
        else if (String(d[key]).startsWith('data:')) data[key] = d[key];
        else if (url(d[key])) data[key] = await media.fetchToDataUri(url(d[key]));
      }
      const profile = await botProfile.apply(req.guild, data);
      botlog.log('dashboard', 'عدّل شكل البوت في السيرفر', { user: who(req), guild: req.guild });
      res.json({ ok: true, profile });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // per-server emojis
  app.get('/api/guild-emojis/:id', needGuild, (req, res) => {
    const saved = store.peek('guildEmojis', req.guild.id) || {};
    const global = store.get('emojis');
    res.json({
      premium: premium.has(req.guild.id, 'guildEmojis'),
      groups: E.GROUPS,
      items: E.KEYS.map((key) => ({ key, fallback: global[key] || E.FALLBACK[key], value: saved[key] || '' })),
      serverEmojis: [...req.guild.emojis.cache.values()].slice(0, 200).map((e) => ({ id: e.id, name: e.name, animated: e.animated, value: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` })),
    });
  });

  app.post('/api/guild-emojis/:id', needGuild, csrf, (req, res) => {
    try {
      needPremium(req.guild, 'guildEmojis');
      const input = req.body.emojis || {};
      const out = {};
      const invalid = [];
      for (const key of E.KEYS) {
        const rawV = String(input[key] || '').trim();
        if (!rawV) continue;
        const v = E.normalize(rawV);
        if (v) out[key] = v;
        else invalid.push(key);
      }
      store.get('guildEmojis')[req.guild.id] = out;
      store.save('guildEmojis');
      botlog.log('dashboard', 'عدّل إيموجيات البوت في السيرفر', { user: who(req), guild: req.guild });
      res.json({ ok: true, invalid });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ticket analytics
  app.get('/api/ticket-stats/:id', needGuild, (req, res) => {
    if (!premium.has(req.guild.id, 'ticketStats')) return res.status(403).json({ error: premium.lockedText('ticketStats'), locked: true });
    res.json(tickets.analytics(req.guild.id));
  });

  app.get('/api/commands/:id', needGuild, (req, res) => {
    const disabled = new Set(store.get('disabledCommands')[req.guild.id] || []);
    const list = [...commandsRegistry.commands.values()]
      .filter((c) => c.category !== 'owner')
      .map((c) => ({
        name: c.name,
        description: c.description,
        category: c.category,
        categoryLabel: commandsRegistry.CATEGORIES[c.category] || c.category,
        aliases: c.aliases || [],
        enabled: !disabled.has(c.name),
        locked: ['help', 'command', 'setprefix'].includes(c.name),
      }));
    res.json({ prefix: store.get('prefixes')[req.guild.id] || null, commands: list });
  });

  app.post('/api/commands/:id', needGuild, csrf, (req, res) => {
    const all = store.get('disabledCommands');
    const set = new Set(all[req.guild.id] || []);
    const updates = Array.isArray(req.body.updates) ? req.body.updates : [{ name: req.body.name, enabled: req.body.enabled }];
    for (const u of updates) {
      const cmd = commandsRegistry.commands.get(String(u.name));
      if (!cmd || cmd.category === 'owner' || ['help', 'command', 'setprefix'].includes(cmd.name)) continue;
      if (bool(u.enabled)) set.delete(cmd.name);
      else set.add(cmd.name);
    }
    all[req.guild.id] = [...set];
    store.save('disabledCommands');
    const changed = updates.filter((u) => commandsRegistry.commands.has(String(u.name)));
    if (changed.length) {
      const text = changed.length === 1 ? `${bool(changed[0].enabled) ? 'فعّل' : 'عطّل'} الأمر /${changed[0].name}` : `${bool(changed[0].enabled) ? 'فعّل' : 'عطّل'} ${changed.length} أوامر`;
      botlog.log('dashboard', text, { user: who(req), guild: req.guild });
    }
    res.json({ ok: true });
  });

  // per-server command shortcuts
  require('./aliases')(app, { needGuild, csrf });

  // bot owner panel
  require('./owner')(app, { client, needLogin, csrf });

  // owner: global emojis + presence
  app.get('/api/emojis', (req, res) => {
    const saved = store.get('emojis');
    res.json({
      canEdit: isOwner(req.session.user.id),
      groups: E.GROUPS,
      items: E.KEYS.map((key) => ({ key, fallback: E.FALLBACK[key], value: saved[key] || '' })),
    });
  });

  app.post('/api/emojis', ownerOnly, csrf, (req, res) => {
    const input = req.body.emojis || {};
    const out = {};
    const invalid = [];
    for (const key of E.KEYS) {
      const raw = String(input[key] || '').trim();
      if (!raw) continue;
      const v = E.normalize(raw);
      if (v) out[key] = v;
      else invalid.push(key);
    }
    store.set('emojis', out);
    res.json({ ok: true, invalid });
  });

  app.post('/api/presence', ownerOnly, csrf, (req, res) => {
    const s = store.get('botSettings');
    s.status = str(req.body.status, 120) || s.status;
    if (['Playing', 'Watching', 'Listening', 'Competing', 'Custom'].includes(req.body.activityType)) s.activityType = req.body.activityType;
    if (['online', 'idle', 'dnd'].includes(req.body.presence)) s.presence = req.body.presence;
    store.save('botSettings');
    applyPresence(client);
    res.json({ ok: true });
  });

  app.use((req, res) => sendView(res, 'unauthorized', 404));

  app.listen(cfg.port, '0.0.0.0', () => {
    console.log(`[dashboard] listening on :${cfg.port} — ${cfg.base}`);
    if (!cfg.clientSecret) console.warn('[dashboard] CLIENT_SECRET is missing — Discord login is disabled until you set it.');
  });
}

module.exports = { start, writeSettings, readSettings };
