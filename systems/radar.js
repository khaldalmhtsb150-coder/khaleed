// New-member radar 📡: watches every newcomer's first days. If someone joins and stays silent
// for N hours, the staff get an alert (with their kafeel sponsor tagged) so a real person says hi
// before the member drifts away. /radar shows how many newcomers actually started talking and stayed.
const { Events, ActionRowBuilder, ButtonStyle } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const { canManageGuild } = require('../utils/perms');

const DEFAULT = { enabled: false, channelId: '', silentHours: 24, mentionSponsor: true, roleId: '' };
const config = (gid) => ({ ...DEFAULT, ...(store.peek('radarConfig', gid) || {}) });
const recs = (gid) => store.guild('radar', gid); // userId → { joinedAt, firstMsgAt, lastMsgAt, msgs, leftAt, alerted, greetedBy }
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const KEEP_DAYS = 45;
let dirty = false;

function onJoin(member) {
  if (member.user.bot) return;
  recs(member.guild.id)[member.id] = { joinedAt: Date.now(), firstMsgAt: 0, lastMsgAt: 0, msgs: 0, leftAt: 0, alerted: false, greetedBy: '' };
  store.save('radar');
}

function onLeave(member) {
  const r = store.peek('radar', member.guild.id)?.[member.id];
  if (r && !r.leftAt) {
    r.leftAt = Date.now();
    store.save('radar');
  }
}

function onMessage(message) {
  if (!message.guild || message.author.bot) return;
  const r = store.peek('radar', message.guild.id)?.[message.author.id];
  if (!r || r.leftAt) return;
  r.msgs += 1;
  r.lastMsgAt = Date.now();
  if (!r.firstMsgAt) {
    r.firstMsgAt = r.lastMsgAt;
    store.save('radar');
  } else dirty = true;
}

/** Numbers for the last `days` days of joins. */
function report(gid, days = 30) {
  const since = Date.now() - days * DAY;
  const list = Object.values(store.peek('radar', gid) || {}).filter((r) => r.joinedAt >= since);
  const joined = list.length;
  const spoke = list.filter((r) => r.firstMsgAt).length;
  const spoke24 = list.filter((r) => r.firstMsgAt && r.firstMsgAt - r.joinedAt <= DAY).length;
  const quickLeave = list.filter((r) => r.leftAt && r.leftAt - r.joinedAt <= DAY).length;
  const left = list.filter((r) => r.leftAt).length;
  // "stayed": joined 7+ days ago, still here, and wrote at least 5 messages
  const old = list.filter((r) => Date.now() - r.joinedAt >= 7 * DAY);
  const stayed = old.filter((r) => !r.leftAt && r.msgs >= 5).length;
  const silentNow = list.filter((r) => !r.leftAt && !r.firstMsgAt && Date.now() - r.joinedAt >= config(gid).silentHours * HOUR).length;
  const greeted = list.filter((r) => r.greetedBy).length;
  const firstGaps = list.filter((r) => r.firstMsgAt).map((r) => r.firstMsgAt - r.joinedAt).sort((a, b) => a - b);
  const medianFirst = firstGaps.length ? firstGaps[Math.floor(firstGaps.length / 2)] : 0;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  return { days, joined, spoke, spoke24, left, quickLeave, stayed, oldCount: old.length, silentNow, greeted, medianFirst, pct };
}

function fmtGap(ms) {
  if (!ms) return '—';
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))} دقيقة`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} ساعة`;
  return `${Math.round(ms / DAY)} يوم`;
}

function reportEmbed(guild, days = 30) {
  const R = report(guild.id, days);
  const e = ui
    .embed()
    .setTitle(`رادار الأعضاء الجداد · آخر ${days} يوم`)
    .addFields(
      { name: 'دخلوا', value: String(R.joined), inline: true },
      { name: 'كتبوا ولو رسالة', value: `${R.spoke} · ${R.pct(R.spoke, R.joined)}٪`, inline: true },
      { name: 'بأول 24 ساعة', value: String(R.spoke24), inline: true },
      { name: 'ثبتوا', value: `${R.stayed} من ${R.oldCount} · ${R.pct(R.stayed, R.oldCount)}٪`, inline: true },
      { name: 'طلعوا', value: `${R.left} · منهم ${R.quickLeave} بأول يوم`, inline: true },
      { name: 'أول رسالة (الوسيط)', value: fmtGap(R.medianFirst), inline: true },
      { name: 'صامتين هلأ', value: String(R.silentNow), inline: true },
      { name: 'رحّبت فيهم الإدارة', value: String(R.greeted), inline: true }
    )
    .setFooter({ text: 'ثبتوا = مرّ عليهم أسبوع، لسا موجودين، و5 رسائل أو أكثر' });
  if (!R.joined) e.setDescription(ui.hint('ما في بيانات لسا. الرادار بيبلش يحسب من أول عضو بيدخل بعد التحديث.'));
  else if (R.pct(R.spoke, R.joined) < 40) e.setDescription(ui.hint('أقل من نص الجداد بيحكوا. جرّب تفعّل الكفيل وتنبيهات الرادار عشان حدا يرحب فيهم بالاسم.'));
  return e;
}

async function alert(guild, uid, r) {
  const conf = config(guild.id);
  const ch = guild.channels.cache.get(conf.channelId);
  if (!ch) return;
  const member = await guild.members.fetch(uid).catch(() => null);
  if (!member) return;
  const pair = store.peek('kafeelPairs', guild.id)?.[uid];
  const sponsor = conf.mentionSponsor && pair?.sponsorId && pair.status === 'open' ? pair.sponsorId : '';
  const ping = [conf.roleId ? `<@&${conf.roleId}>` : '', sponsor ? `<@${sponsor}>` : ''].filter(Boolean).join(' ');
  await ch.send({
    content: ping || undefined,
    allowedMentions: { roles: conf.roleId ? [conf.roleId] : [], users: sponsor ? [sponsor] : [] },
    embeds: [
      ui
        .embed()
        .setThumbnail(member.displayAvatarURL?.() || null)
        .setTitle('عضو جديد ما حكى ولا كلمة')
        .setDescription(`${member} دخل <t:${Math.round(r.joinedAt / 1000)}:R> ولسا ما كتب شي.`)
        .addFields(...(sponsor ? [{ name: 'كفيله', value: `<@${sponsor}>`, inline: true }] : []))
        .setFooter({ text: 'رحّبوا فيه بالاسم بالشات العام، الترحيب الشخصي أكثر شي بيخلي العضو الجديد يثبت.' }),
    ],
    components: [new ActionRowBuilder().addComponents(ui.button(`rd:greet:${uid}`, 'رحّبت فيه', { emoji: 'greet', style: ButtonStyle.Success }), ui.button(`rd:dm:${uid}`, 'رسالة خاصة', { emoji: 'mail' }))],
  });
}

async function tick(client) {
  const cutoff = Date.now() - KEEP_DAYS * DAY;
  for (const [gid, map] of Object.entries(store.get('radar'))) {
    for (const [uid, r] of Object.entries(map)) {
      if (r.joinedAt < cutoff) {
        delete map[uid];
        dirty = true;
      }
    }
    const conf = config(gid);
    const guild = client.guilds.cache.get(gid);
    if (!conf.enabled || !conf.channelId || !guild) continue;
    const due = Object.entries(map).filter(([, r]) => !r.alerted && !r.firstMsgAt && !r.leftAt && Date.now() - r.joinedAt >= conf.silentHours * HOUR && Date.now() - r.joinedAt < 7 * DAY);
    for (const [uid, r] of due.slice(0, 10)) {
      r.alerted = true;
      dirty = true;
      await alert(guild, uid, r).catch((e) => console.error('[radar]', e.message));
    }
  }
  if (dirty) {
    dirty = false;
    store.save('radar');
  }
}

async function onComponent(i) {
  const [, action, uid] = i.customId.split(':');
  if (!canManageGuild(i.member) && !i.member?.permissions?.has?.('ManageMessages')) {
    const pair = store.peek('kafeelPairs', i.guild.id)?.[uid];
    if (pair?.sponsorId !== i.user.id) return i.reply({ content: '• هاي للإدارة أو كفيل العضو.', ephemeral: true });
  }
  const r = recs(i.guild.id)[uid];
  if (!r) return i.reply({ content: '• ما عاد في بيانات لهالعضو.', ephemeral: true });
  if (action === 'greet') {
    r.greetedBy = i.user.id;
    store.save('radar');
    const row = ActionRowBuilder.from(i.message.components[0]);
    row.components[0].setDisabled(true).setLabel(`رحّب فيه ${i.member?.displayName || i.user.username}`.slice(0, 80));
    return i.update({ components: [row] });
  }
  if (action === 'dm') {
    if (r.dmBy) return i.reply({ content: `• <@${r.dmBy}> بعتله رسالة قبل.`, ephemeral: true, allowedMentions: { parse: [] } });
    const user = await i.client.users.fetch(uid).catch(() => null);
    const ok = await user
      ?.send(`هلا فيك بـ **${i.guild.name}**! لاحظنا إنك جديد عنا، وحابين نسمع صوتك. عرّف عن حالك بالشات، وإذا احتجت أي إشي إحنا موجودين.\n— ${i.member?.displayName || i.user.username} من الإدارة`)
      .then(() => true)
      .catch(() => false);
    if (!ok) return i.reply({ content: '• الخاص عنده مسكّر، رحّب فيه بالشات العام.', ephemeral: true });
    r.dmBy = i.user.id;
    r.greetedBy ||= i.user.id;
    store.save('radar');
    return i.reply({ content: '✅ وصلته رسالة الترحيب.', ephemeral: true });
  }
  return i.reply({ content: '• غير معروف.', ephemeral: true });
}

function init(client) {
  client.on(Events.GuildMemberAdd, onJoin);
  client.on(Events.GuildMemberRemove, onLeave);
  client.on(Events.MessageCreate, onMessage);
  client.once(Events.ClientReady, () => setInterval(() => tick(client).catch((e) => console.error('[radar]', e.message)), 5 * 60_000).unref());
}

module.exports = { init, config, DEFAULT, report, reportEmbed, tick, onJoin, onLeave, onMessage, components: [{ prefix: 'rd:', handle: onComponent }] };
