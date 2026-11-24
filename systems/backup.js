// Server backup & smart repair.
// A snapshot of roles, channels (with categories, order, topics, slowmode, permission overwrites) is taken
// automatically every day and on demand. After a nuke, "repair" compares the server with a snapshot and:
//   • recreates deleted roles and channels (mapping old role ids → new ones inside overwrites),
//   • (full mode) renames channels/roles back, restores role permissions and channel overwrites,
//   • (full mode) deletes spam channels created after the snapshot (3+ new channels with the same name).
// Messages can't be restored — Discord doesn't let any bot do that.
const fs = require('fs');
const path = require('path');
const { Events, ActionRowBuilder, ButtonStyle, ChannelType, PermissionsBitField, OverwriteType } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const premium = require('../utils/premium');
const { isOwner } = require('../utils/perms');

const DIR = path.join(__dirname, '..', 'data', 'server-backups');
const DEFAULT = { auto: true, lastAt: 0, lastNukeAt: 0 };
const config = (gid) => ({ ...DEFAULT, ...(store.peek('backupConfig', gid) || {}) });
const keep = (gid) => (premium.has(gid, 'backupPlus') ? 7 : 3);
const DAY = 86_400_000;
const running = new Set(); // guild ids with a repair in progress

const file = (gid) => path.join(DIR, `${gid}.json`);
function list(gid) {
  try {
    return JSON.parse(fs.readFileSync(file(gid), 'utf8'));
  } catch {
    return [];
  }
}
function write(gid, snaps) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${file(gid)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snaps));
  fs.renameSync(tmp, file(gid));
}

const TEXTISH = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia];
const VOICEISH = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const SUPPORTED = [ChannelType.GuildCategory, ...TEXTISH, ...VOICEISH];

function snapshot(guild) {
  const roles = guild.roles.cache
    .filter((r) => !r.managed)
    .map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position, everyone: r.id === guild.id, unicodeEmoji: r.unicodeEmoji || null }))
    .sort((a, b) => b.position - a.position);
  const channels = guild.channels.cache
    .filter((c) => SUPPORTED.includes(c.type))
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parentId || null,
      position: c.rawPosition ?? c.position ?? 0,
      topic: c.topic || null,
      nsfw: Boolean(c.nsfw),
      rateLimitPerUser: c.rateLimitPerUser || 0,
      bitrate: c.bitrate || null,
      userLimit: c.userLimit || 0,
      overwrites: [...(c.permissionOverwrites?.cache?.values() || [])].map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })),
    }))
    .sort((a, b) => (a.type === ChannelType.GuildCategory ? -1 : 0) - (b.type === ChannelType.GuildCategory ? -1 : 0) || a.position - b.position);
  return { at: Date.now(), name: guild.name, roles, channels };
}

/** Saves a snapshot. Skips automatic ones that look like they were taken mid-attack. */
function take(guild, { auto = false } = {}) {
  const snaps = list(guild.id);
  const snap = snapshot(guild);
  const conf = store.guild('backupConfig', guild.id, { ...DEFAULT });
  if (auto) {
    if (Date.now() - (conf.lastNukeAt || 0) < 12 * 3600_000) return { skipped: 'nuke' };
    const prev = snaps[0];
    // a big drop since the last snapshot usually means damage — keep the old good copy instead of overwriting it
    if (prev && (snap.channels.length < prev.channels.length * 0.7 || snap.roles.length < prev.roles.length * 0.7)) return { skipped: 'drop' };
  }
  snaps.unshift(snap);
  write(guild.id, snaps.slice(0, keep(guild.id)));
  conf.lastAt = snap.at;
  store.save('backupConfig');
  return { snap };
}

/** What a repair would change. mode: 'missing' | 'full' */
function plan(guild, snap, mode = 'missing') {
  const P = { roles: [], channels: [], renameChannels: [], renameRoles: [], rolePerms: [], overwrites: [], spam: [] };
  for (const r of snap.roles) {
    const cur = guild.roles.cache.get(r.id);
    if (!cur) {
      if (!r.everyone) P.roles.push(r);
      continue;
    }
    if (mode !== 'full' || cur.managed) continue;
    if (!r.everyone && cur.name !== r.name) P.renameRoles.push(r);
    if (cur.permissions.bitfield.toString() !== r.permissions) P.rolePerms.push(r);
  }
  for (const c of snap.channels) {
    const cur = guild.channels.cache.get(c.id);
    if (!cur) {
      P.channels.push(c);
      continue;
    }
    if (mode !== 'full') continue;
    if (cur.name !== c.name) P.renameChannels.push(c);
    const now = [...(cur.permissionOverwrites?.cache?.values() || [])].map((o) => `${o.id}:${o.allow.bitfield}:${o.deny.bitfield}`).sort().join('|');
    const was = c.overwrites.filter((o) => guild.roles.cache.has(o.id) || o.type === OverwriteType.Member).map((o) => `${o.id}:${o.allow}:${o.deny}`).sort().join('|');
    if (now !== was) P.overwrites.push(c);
  }
  if (mode === 'full') {
    const known = new Set(snap.channels.map((c) => c.id));
    const fresh = guild.channels.cache.filter((c) => !known.has(c.id) && c.createdTimestamp > snap.at);
    const counts = {};
    for (const c of fresh.values()) counts[c.name] = (counts[c.name] || 0) + 1;
    P.spam = [...fresh.values()].filter((c) => counts[c.name] >= 3).map((c) => ({ id: c.id, name: c.name }));
  }
  P.total = P.roles.length + P.channels.length + P.renameChannels.length + P.renameRoles.length + P.rolePerms.length + P.overwrites.length + P.spam.length;
  return P;
}

function planText(P) {
  const L = [];
  if (P.roles.length) L.push(`🎭 رتب محذوفة بترجع: **${P.roles.length}**`);
  if (P.channels.length) L.push(`💬 رومات محذوفة بترجع: **${P.channels.length}** (${P.channels.filter((c) => c.type === ChannelType.GuildCategory).length} كاتيقوري)`);
  if (P.renameChannels.length) L.push(`✏️ رومات انغيّر اسمها بيرجع: **${P.renameChannels.length}**`);
  if (P.renameRoles.length) L.push(`✏️ رتب انغيّر اسمها بيرجع: **${P.renameRoles.length}**`);
  if (P.rolePerms.length) L.push(`🔐 صلاحيات رتب بترجع زي ما كانت: **${P.rolePerms.length}**`);
  if (P.overwrites.length) L.push(`🔐 صلاحيات رومات بترجع: **${P.overwrites.length}**`);
  if (P.spam.length) L.push(`🗑️ رومات سبام انعملت بعد النسخة بتنحذف: **${P.spam.length}**`);
  return L.length ? L.join('\n') : '✅ السيرفر مطابق للنسخة، ما في إشي يتصلح.';
}

const mapOverwrites = (overwrites, roleMap, guild) =>
  overwrites
    .map((o) => ({ id: roleMap.get(o.id) || o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) }))
    .filter((o) => o.type === OverwriteType.Member || guild.roles.cache.has(o.id));

/** Runs the repair. onProgress(text) is called every few steps. */
async function repair(guild, snap, mode = 'missing', onProgress = () => {}) {
  if (running.has(guild.id)) throw new Error('في إصلاح شغال هلأ، استنى يخلص.');
  running.add(guild.id);
  const P = plan(guild, snap, mode);
  const done = { roles: 0, channels: 0, fixed: 0, deleted: 0, failed: 0 };
  const roleMap = new Map(); // old id → new id
  const chanMap = new Map();
  const step = async (fn) => {
    try {
      await fn();
      return true;
    } catch (e) {
      done.failed++;
      return false;
    }
  };
  let n = 0;
  const tick = () => ++n % 5 === 0 && onProgress(done);
  try {
    // 1) spam channels first (frees the channel limit)
    for (const s of P.spam) {
      if (await step(() => guild.channels.cache.get(s.id)?.delete('MarkaBot: إصلاح بعد تخريب (روم سبام)'))) done.deleted++;
      tick();
    }
    // 2) roles, from the highest down, so positions come out close to the original
    const myTop = guild.members.me.roles.highest.position;
    for (const r of P.roles) {
      await step(async () => {
        const role = await guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: BigInt(r.permissions) & guild.members.me.permissions.bitfield, reason: 'MarkaBot: إصلاح بعد تخريب' });
        roleMap.set(r.id, role.id);
        done.roles++;
      });
      tick();
    }
    if (roleMap.size) {
      const pos = P.roles.filter((r) => roleMap.has(r.id) && r.position < myTop).map((r) => ({ role: roleMap.get(r.id), position: r.position }));
      if (pos.length) await guild.roles.setPositions(pos).catch(() => {});
    }
    // 3) channels: categories first, then the rest under their (possibly recreated) parents
    const cats = P.channels.filter((c) => c.type === ChannelType.GuildCategory);
    const rest = P.channels.filter((c) => c.type !== ChannelType.GuildCategory);
    for (const c of [...cats, ...rest]) {
      await step(async () => {
        const parent = c.parentId ? chanMap.get(c.parentId) || (guild.channels.cache.has(c.parentId) ? c.parentId : null) : null;
        const opts = { name: c.name, type: c.type, permissionOverwrites: mapOverwrites(c.overwrites, roleMap, guild), reason: 'MarkaBot: إصلاح بعد تخريب' };
        if (c.type !== ChannelType.GuildCategory) opts.parent = parent || undefined;
        if (TEXTISH.includes(c.type)) Object.assign(opts, { topic: c.topic || undefined, nsfw: c.nsfw, rateLimitPerUser: c.rateLimitPerUser || 0 });
        if (VOICEISH.includes(c.type)) Object.assign(opts, { userLimit: c.userLimit || 0 });
        const ch = await guild.channels.create(opts);
        chanMap.set(c.id, ch.id);
        done.channels++;
      });
      tick();
    }
    if (chanMap.size) {
      const pos = P.channels.filter((c) => chanMap.has(c.id)).map((c) => ({ channel: chanMap.get(c.id), position: c.position }));
      await guild.channels.setPositions(pos).catch(() => {});
    }
    // 4) full mode: names and permissions back
    for (const c of P.renameChannels) {
      if (await step(() => guild.channels.cache.get(c.id).setName(c.name, 'MarkaBot: إصلاح بعد تخريب'))) done.fixed++;
      tick();
    }
    for (const c of P.overwrites) {
      if (await step(() => guild.channels.cache.get(c.id).permissionOverwrites.set(mapOverwrites(c.overwrites, roleMap, guild), 'MarkaBot: إصلاح بعد تخريب'))) done.fixed++;
      tick();
    }
    for (const r of P.renameRoles) {
      if (await step(() => guild.roles.cache.get(r.id).setName(r.name, 'MarkaBot: إصلاح بعد تخريب'))) done.fixed++;
      tick();
    }
    for (const r of P.rolePerms) {
      if (await step(() => guild.roles.cache.get(r.id).setPermissions(BigInt(r.permissions) & guild.members.me.permissions.bitfield, 'MarkaBot: إصلاح بعد تخريب'))) done.fixed++;
      tick();
    }
  } finally {
    running.delete(guild.id);
    if (roleMap.size || chanMap.size) remap(guild.id, roleMap, chanMap);
  }
  return { plan: P, done, roleMap, chanMap };
}

/** Recreated items get new ids: point every stored snapshot at them, so a second repair doesn't duplicate anything. */
function remap(gid, roleMap, chanMap) {
  const m = (id) => roleMap.get(id) || chanMap.get(id) || id;
  const snaps = list(gid);
  for (const s of snaps) {
    for (const r of s.roles) r.id = m(r.id);
    for (const c of s.channels) {
      c.id = m(c.id);
      c.parentId = c.parentId ? m(c.parentId) : null;
      for (const o of c.overwrites) o.id = m(o.id);
    }
  }
  write(gid, snaps);
}

// ---------- buttons ----------
const canRepair = (member, guild) => member && (member.id === guild.ownerId || member.permissions?.has?.(PermissionsBitField.Flags.Administrator) || isOwner(member.id));

function previewPayload(guild, idx = 0) {
  const snaps = list(guild.id);
  const snap = snaps[idx];
  if (!snap) return { content: '• ما في نسخ احتياطية لهالسيرفر لسا. اعمل وحدة بـ `/backup action:نسخة هسا`.' };
  const miss = plan(guild, snap, 'missing');
  const full = plan(guild, snap, 'full');
  return {
    embeds: [
      ui
        .embed()
        .setDescription(
          [
            `### 🛠️ إصلاح السيرفر من نسخة <t:${Math.round(snap.at / 1000)}:f>`,
            `بالنسخة: ${snap.roles.length} رتبة • ${snap.channels.length} روم`,
            '',
            '**🔁 رجّع المحذوف بس:**',
            planText(miss),
            '',
            '**♻️ الإصلاح الكامل** (المحذوف + الأسماء والصلاحيات + حذف السبام):',
            planText(full),
            '',
            ui.hint('الرسائل القديمة ما بترجع، ديسكورد ما بيسمح لأي بوت يرجّعها. البوت بيرجع اللي تحت رتبته بس.'),
          ].join('\n')
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        ui.button(`bk:run:${snap.at}:missing`, 'رجّع المحذوف', { emoji: 'restore', style: ButtonStyle.Primary, disabled: !miss.total }),
        ui.button(`bk:run:${snap.at}:full`, 'إصلاح كامل', { emoji: 'repair', style: ButtonStyle.Danger, disabled: !full.total }),
        ui.button('bk:cancel', 'إلغاء', { emoji: 'cancel' })
      ),
    ],
  };
}

async function onComponent(i) {
  const [, action, at, mode] = i.customId.split(':');
  if (!canRepair(i.member, i.guild)) return i.reply({ content: '• الإصلاح لمالك السيرفر أو الأدمن بس.', ephemeral: true });
  if (action === 'cancel') return i.update({ components: [] });
  if (action === 'preview') return i.reply({ ...previewPayload(i.guild, 0), ephemeral: true });
  if (action === 'run') {
    const snap = list(i.guild.id).find((s) => String(s.at) === at);
    if (!snap) return i.reply({ content: '• هالنسخة ما عادت موجودة.', ephemeral: true });
    if (running.has(i.guild.id)) return i.reply({ content: '• في إصلاح شغال هلأ.', ephemeral: true });
    await i.update({ components: [], embeds: [ui.embed().setDescription(`### ⏳ بصلّح السيرفر...\nممكن ياخد كم دقيقة حسب العدد، ديسكورد بيحدد سرعة إنشاء الرومات.`)] });
    const progress = (d) => i.editReply({ embeds: [ui.embed().setDescription(`### ⏳ بصلّح السيرفر...\n🎭 ${d.roles} رتبة • 💬 ${d.channels} روم • ✏️ ${d.fixed} تعديل • 🗑️ ${d.deleted} محذوف`)] }).catch(() => {});
    try {
      const { done } = await repair(i.guild, snap, mode === 'full' ? 'full' : 'missing', progress);
      const text = [`### ✅ خلص الإصلاح`, `🎭 رجعت **${done.roles}** رتبة • 💬 **${done.channels}** روم • ✏️ **${done.fixed}** تعديل • 🗑️ **${done.deleted}** سبام`, done.failed ? `⚠️ **${done.failed}** إشي ما زبط (غالباً لأنه فوق رتبة البوت).` : null, ui.hint('الرتب اللي رجعت فاضية: لازم ترجع توزعها على الأعضاء.')].filter(Boolean).join('\n');
      await i.editReply({ embeds: [ui.embed().setDescription(text)] }).catch(() => i.channel?.send({ embeds: [ui.embed().setDescription(text)] }).catch(() => {}));
    } catch (e) {
      await i.editReply({ embeds: [ui.embed().setDescription(`• ${e.message}`)] }).catch(() => {});
    }
  }
}

/** Called by anti-nuke after it stops an attacker: offers a one-click repair in the alert channel. */
async function offerRepair(guild, channel) {
  const conf = store.guild('backupConfig', guild.id, { ...DEFAULT });
  conf.lastNukeAt = Date.now();
  store.save('backupConfig');
  if (!channel || !list(guild.id).length) return;
  // give the attacker's last requests a moment to land before comparing
  setTimeout(() => {
    channel.send(previewPayload(guild, 0)).catch(() => {});
  }, 8_000).unref?.();
}

async function autoTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const conf = config(guild.id);
    if (!conf.auto || Date.now() - (conf.lastAt || 0) < DAY) continue;
    try {
      take(guild, { auto: true });
    } catch (e) {
      console.error('[backup]', guild.id, e.message);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

function init(client) {
  client.once(Events.ClientReady, () => {
    setTimeout(() => autoTick(client).catch(() => {}), 60_000).unref?.();
    setInterval(() => autoTick(client).catch(() => {}), 3600_000).unref();
  });
}

module.exports = { init, config, DEFAULT, list, take, snapshot, plan, planText, repair, remap, previewPayload, offerRepair, keep, components: [{ prefix: 'bk:', handle: onComponent }] };
