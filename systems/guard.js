// Extra protection layers on top of Anti-Raid / Anti-Nuke (systems/protection):
//  • Anti-Bot: bots added by anyone who isn't trusted get kicked (and the adder punished).
//  • Dangerous permissions: giving Administrator/Manage*/Ban/Kick to a role, or handing such a role to
//    a member, by someone untrusted is reverted on the spot.
//  • Server lock: renaming the server / changing its settings by someone untrusted is reverted.
//  • Anti-Scam: fake Nitro / Steam / Discord look-alike links are deleted and the sender silenced.
//  • Dehoist: names that start with symbols to sit on top of the member list get cleaned.
//  • Lockdown & panic mode, temp bans.
const { Events, AuditLogEvent, PermissionsBitField, PermissionFlagsBits, ChannelType, GuildVerificationLevel } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const art = require('../utils/art');
const premium = require('../utils/premium');
const protection = require('./protection');

const P = PermissionFlagsBits;
const DANGEROUS = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.BanMembers, P.KickMembers, P.ManageWebhooks];
const DANGER_NAMES = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'ManageWebhooks'];
const isDangerous = (bits) => DANGEROUS.some((d) => (BigInt(bits || 0) & d) === d);
const advanced = (gid) => premium.has(gid, 'antiNuke');

const say = (guild, lines) => protection.alert(guild, lines.filter(Boolean).join('\n'));

// ---------- anti-bot ----------
async function onBotJoin(member) {
  if (!member.user.bot) return;
  const guild = member.guild;
  const conf = protection.config(guild.id).antiBot;
  if (!conf.enabled || !advanced(guild.id)) return;
  if (conf.allowVerified && member.user.flags?.has?.('VerifiedBot')) return;
  let adder = null;
  for (let i = 0; i < 3 && !adder; i++) {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 }).catch(() => null);
    adder = logs?.entries.find((e) => e.targetId === member.id)?.executorId || null;
    if (!adder) await new Promise((r) => setTimeout(r, 1500));
  }
  if (protection.trusted(guild, adder)) return;
  await member.kick('Anti-Bot: بوت أضافه شخص غير موثوق').catch(() => {});
  let result = '';
  if (conf.punishAdder && adder) result = (await protection.punish(guild, adder, 'strip', 'Anti-Bot: إضافة بوت بدون إذن')).result;
  await say(guild, [`${art.i('shield', '🛡️')} **Anti-Bot — انطرد بوت**`, `البوت: ${member.user} \`${member.id}\``, adder ? `أضافه: <@${adder}> ${result ? `— ${result}` : ''}` : null, '-# أضف الشخص لقائمة الموثوقين إذا بدك تسمحله يضيف بوتات']);
}

// ---------- audit-driven guards ----------
async function onAudit(entry, guild) {
  if (!advanced(guild.id)) return;
  const conf = protection.config(guild.id);
  const by = entry.executorId;
  if (protection.trusted(guild, by)) return;

  if (conf.dangerousPerms.enabled) {
    // a role got dangerous permissions
    if (entry.action === AuditLogEvent.RoleUpdate || entry.action === AuditLogEvent.RoleCreate) {
      const ch = entry.changes?.find((c) => c.key === 'permissions');
      if (ch && isDangerous(ch.new) && !isDangerous(ch.old ?? 0)) {
        const role = guild.roles.cache.get(entry.targetId);
        const back = entry.action === AuditLogEvent.RoleCreate ? 0n : BigInt(ch.old || 0);
        if (role?.editable) await role.setPermissions(back, 'حماية: صلاحيات خطيرة بدون إذن').catch(() => {});
        const { result } = await protection.punish(guild, by, 'strip', 'حماية: إعطاء صلاحيات خطيرة');
        return say(guild, [`${art.i('lock', '🔒')} **صلاحيات خطيرة انسحبت**`, `الرتبة: ${role || `\`${entry.targetId}\``}`, `اللي عملها: <@${by}> — ${result}`, `-# ${new PermissionsBitField(BigInt(ch.new)).toArray().filter((p) => DANGER_NAMES.includes(p)).map((p) => ui.permName(p)).join('، ')}`]);
      }
    }
    // a member got a role that has dangerous permissions
    if (entry.action === AuditLogEvent.MemberRoleUpdate) {
      const added = entry.changes?.find((c) => c.key === '$add')?.new || [];
      const bad = added.map((r) => guild.roles.cache.get(r.id)).filter((r) => r && isDangerous(r.permissions.bitfield));
      if (bad.length) {
        const target = await guild.members.fetch(entry.targetId).catch(() => null);
        if (target) await target.roles.remove(bad.filter((r) => r.editable), 'حماية: رتبة خطيرة بدون إذن').catch(() => {});
        const { result } = await protection.punish(guild, by, 'strip', 'حماية: إعطاء رتبة خطيرة');
        return say(guild, [`${art.i('lock', '🔒')} **رتبة خطيرة انسحبت**`, `من: <@${entry.targetId}> • الرتب: ${bad.map((r) => `${r}`).join(' ')}`, `اللي أعطاها: <@${by}> — ${result}`]);
      }
    }
  }

  if (conf.serverLock.enabled && entry.action === AuditLogEvent.GuildUpdate) {
    const reverted = [];
    for (const c of entry.changes || []) {
      if (c.key === 'name' && c.old) {
        await guild.setName(c.old, 'حماية: قفل إعدادات السيرفر').catch(() => {});
        reverted.push('الاسم');
      } else if (c.key === 'verification_level' && c.old !== undefined) {
        await guild.setVerificationLevel(c.old, 'حماية: قفل إعدادات السيرفر').catch(() => {});
        reverted.push('مستوى التحقق');
      } else if (c.key === 'explicit_content_filter' && c.old !== undefined) {
        await guild.setExplicitContentFilter(c.old, 'حماية: قفل إعدادات السيرفر').catch(() => {});
        reverted.push('فلتر المحتوى');
      } else if (c.key === 'system_channel_id' || c.key === 'rules_channel_id' || c.key === 'afk_channel_id') {
        const fn = { system_channel_id: 'setSystemChannel', rules_channel_id: 'setRulesChannel', afk_channel_id: 'setAFKChannel' }[c.key];
        await guild[fn]?.(c.old || null, 'حماية: قفل إعدادات السيرفر').catch(() => {});
        reverted.push('الرومات الأساسية');
      }
    }
    const changed = (entry.changes || []).map((c) => c.key);
    if (!changed.length) return;
    const { result } = await protection.punish(guild, by, 'strip', 'حماية: تعديل إعدادات السيرفر');
    return say(guild, [`${art.i('repair', '⚙️')} **حدا عدّل إعدادات السيرفر**`, `اللي عملها: <@${by}> — ${result}`, reverted.length ? `رجعت: ${[...new Set(reverted)].join('، ')}` : '-# الصورة والبانر ما بنقدر نرجعهم، رجّعهم يدوياً'].filter(Boolean));
  }
}

// ---------- anti-scam ----------
const BRANDS = ['discord.com', 'discord.gg', 'discordapp.com', 'discord.gift', 'steamcommunity.com', 'steampowered.com'];
const SAFE = new Set([...BRANDS, 'discordapp.net', 'discord.media', 'discord.new', 'discord.co', 'cdn.discordapp.com', 'media.discordapp.net', 'store.steampowered.com', 'help.steampowered.com', 'tenor.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com', 'google.com', 'github.com']);
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Returns the scam host found in the text, or null. */
function scamHost(text) {
  const hosts = [...String(text || '').toLowerCase().matchAll(/(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/\S*)?/g)].map((m) => m[1].replace(/^www\./, ''));
  for (const h of hosts) {
    if (SAFE.has(h) || [...SAFE].some((s) => h.endsWith(`.${s}`))) continue;
    const base = h.split('.').slice(-2).join('.');
    const label = h.split('.').slice(-2)[0];
    if (BRANDS.some((b) => { const d = lev(base, b); return d > 0 && d <= 3; })) return h;
    if (/d[il1][s5]c[o0]r[dcl]|st[e3][a4]m(c[o0]mm|p[o0]wer)|n[i1]tr[o0]/.test(label) && !SAFE.has(base)) return h;
    if (/(free|gift|claim)[-.]?(nitro|steam|discord)/.test(h)) return h;
  }
  if (/@everyone|@here/.test(text) && /(free|gift|nitro|steam).{0,40}https?:\/\//i.test(text)) return 'nitro-scam';
  return null;
}

async function onMessage(message) {
  if (!message.guild || message.author.bot || !message.member) return;
  const conf = protection.config(message.guild.id).antiScam;
  if (!conf.enabled) return;
  if (message.member.permissions.has(P.ManageMessages)) return;
  const host = scamHost(message.content);
  if (!host) return;
  await message.delete().catch(() => {});
  let result = 'انحذفت الرسالة';
  if (conf.action === 'timeout') result += (await message.member.timeout(24 * 3_600_000, 'Anti-Scam: رابط احتيال').then(() => ' + تايم أوت 24 ساعة').catch(() => ''));
  else if (conf.action === 'kick') result += (await message.member.kick('Anti-Scam: رابط احتيال').then(() => ' + طرد').catch(() => ''));
  else if (conf.action === 'ban') result += (await message.guild.members.ban(message.author.id, { reason: 'Anti-Scam: رابط احتيال', deleteMessageSeconds: 3600 }).then(() => ' + حظر').catch(() => ''));
  await say(message.guild, [`${art.i('shield', '🛡️')} **Anti-Scam — رابط احتيال**`, `العضو: ${message.author} • القناة: ${message.channel}`, `الرابط: \`${host}\``, `النتيجة: ${result}`, '-# الحساب غالباً مخترق، نبّهوا صاحبه']);
}

// ---------- dehoist ----------
const HOIST = /^[!"#$%&'()*+,\-./0-9:;<=>?@[\\\]^_`{|}~\s]+/;
async function dehoist(member) {
  if (!protection.config(member.guild.id).dehoist.enabled || member.user.bot || !member.manageable) return;
  const name = member.displayName;
  if (!HOIST.test(name)) return;
  const clean = name.replace(HOIST, '').trim() || 'عضو';
  await member.setNickname(clean.slice(0, 32), 'إزالة الرموز من أول الاسم').catch(() => {});
}

// ---------- lockdown / panic ----------
const LOCKABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const VOICE = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

/** Locks (or restores) every channel the @everyone role can see. Old states are remembered. */
async function lockdown(guild, on, reason = 'Lockdown') {
  const state = store.guild('lockdownState', guild.id, { channels: {} });
  const everyone = guild.roles.everyone;
  let n = 0;
  if (on) {
    for (const ch of guild.channels.cache.values()) {
      if (!LOCKABLE.includes(ch.type) || !ch.manageable) continue;
      if (!ch.permissionsFor(everyone)?.has(P.ViewChannel)) continue;
      const ow = ch.permissionOverwrites.cache.get(everyone.id);
      const get = (flag) => (ow?.allow.has(flag) ? true : ow?.deny.has(flag) ? false : null);
      if (state.channels[ch.id]) continue;
      state.channels[ch.id] = { send: get(P.SendMessages), connect: get(P.Connect), threads: get(P.SendMessagesInThreads), react: get(P.AddReactions) };
      const edit = VOICE.includes(ch.type) ? { Connect: false, SendMessages: false } : { SendMessages: false, SendMessagesInThreads: false, AddReactions: false, CreatePublicThreads: false };
      await ch.permissionOverwrites.edit(everyone, edit, { reason }).then(() => n++).catch(() => {});
    }
    state.on = true;
    state.at = Date.now();
  } else {
    for (const [id, old] of Object.entries(state.channels)) {
      const ch = guild.channels.cache.get(id);
      if (!ch) continue;
      const edit = VOICE.includes(ch.type) ? { Connect: old.connect, SendMessages: old.send } : { SendMessages: old.send, SendMessagesInThreads: old.threads, AddReactions: old.react, CreatePublicThreads: null };
      await ch.permissionOverwrites.edit(everyone, edit, { reason }).then(() => n++).catch(() => {});
    }
    state.channels = {};
    state.on = false;
  }
  store.save('lockdownState');
  return n;
}

async function panic(guild, on, by) {
  const st = store.guild('lockdownState', guild.id, { channels: {} });
  const n = await lockdown(guild, on, on ? 'وضع الطوارئ' : 'انتهاء وضع الطوارئ');
  if (on) {
    st.panicVerification = guild.verificationLevel;
    await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'وضع الطوارئ').catch(() => {});
    await guild.disableInvites?.(true).catch(() => {});
    st.panic = true;
  } else {
    if (st.panicVerification !== undefined) await guild.setVerificationLevel(st.panicVerification, 'انتهاء وضع الطوارئ').catch(() => {});
    await guild.disableInvites?.(false).catch(() => {});
    st.panic = false;
  }
  store.save('lockdownState');
  await say(guild, [on ? `${art.i('bell', '🚨')} **وضع الطوارئ اشتغل**` : `${art.i('unlock', '🔓')} **وضع الطوارئ انتهى**`, `${n} قناة ${on ? 'انقفلت' : 'رجعت زي ما كانت'}${on ? ' • التحقق صار أعلى مستوى • الدعوات موقفة' : ''}`, by ? `بواسطة: <@${by}>` : null]);
  return n;
}

// ---------- temp bans ----------
async function tempBan(guild, userId, ms, reason) {
  await guild.members.ban(userId, { reason, deleteMessageSeconds: 0 });
  store.guild('tempBans', guild.id)[userId] = Date.now() + ms;
  store.save('tempBans');
}
async function sweepBans(client) {
  let changed = false;
  for (const [gid, map] of Object.entries(store.get('tempBans'))) {
    const guild = client.guilds.cache.get(gid);
    for (const [uid, until] of Object.entries(map || {})) {
      if (until > Date.now()) continue;
      if (guild) await guild.bans.remove(uid, 'انتهى الحظر المؤقت').catch(() => {});
      delete map[uid];
      changed = true;
    }
  }
  if (changed) store.save('tempBans');
}

function init(client) {
  client.on(Events.GuildMemberAdd, (m) => {
    onBotJoin(m).catch((e) => console.error('[guard:bot]', e.message));
    dehoist(m).catch(() => {});
  });
  client.on(Events.GuildMemberUpdate, (o, n) => {
    if (o.displayName !== n.displayName) dehoist(n).catch(() => {});
  });
  client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => onAudit(entry, guild).catch((e) => console.error('[guard]', e.message)));
  client.on(Events.MessageCreate, (m) => onMessage(m).catch(() => {}));
  client.once(Events.ClientReady, () => setInterval(() => sweepBans(client).catch(() => {}), 60_000).unref());
}

module.exports = { init, scamHost, isDangerous, lockdown, panic, tempBan, sweepBans, dehoist, HOIST, onAudit, onBotJoin, onMessage };
