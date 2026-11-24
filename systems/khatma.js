// Collective Quran khatma: 30 juz on one live board. Members reserve a juz from two menus
// (1–15 and 16–30, since a menu holds at most 25 options), mark it done, or release it.
// Stale reservations get a reminder and are released automatically. When all 30 are read: celebration.
const { Events, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const art = require('../utils/art');
const { AttachmentBuilder } = require('discord.js');
const { canManageGuild } = require('../utils/perms');

const COLOR = 0x2e9e6b;
const DEFAULT = { maxPerUser: 2, holdHours: 48, channelId: '', roleId: '' };
const config = (gid) => ({ ...DEFAULT, ...(store.peek('khatmaConfig', gid) || {}) });
const data = (gid) => store.guild('khatma', gid, { active: null, completed: 0, history: [] });
const HOUR = 3_600_000;
const AR = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

const JUZ = [
  'الم', 'سيقول', 'تلك الرسل', 'لن تنالوا', 'والمحصنات', 'لا يحب الله', 'وإذا سمعوا', 'ولو أننا', 'قال الملأ', 'واعلموا',
  'يعتذرون', 'وما من دابة', 'وما أبرئ', 'ربما', 'سبحان', 'قال ألم', 'اقترب', 'قد أفلح', 'وقال الذين', 'أمن خلق',
  'اتل ما أوحي', 'ومن يقنت', 'وما لي', 'فمن أظلم', 'إليه يرد', 'حم', 'قال فما خطبكم', 'قد سمع', 'تبارك', 'عم',
];

const stats = (k) => {
  const v = Object.values(k.juz);
  return { done: v.filter((j) => j.done).length, taken: v.filter((j) => j.uid && !j.done).length };
};

function boardEmbed(gid) {
  const k = data(gid).active;
  const { done, taken } = stats(k);
  const pct = Math.round((done / 30) * 100);
  const bar = '🟩'.repeat(Math.round(pct / 10)) + '⬜'.repeat(10 - Math.round(pct / 10));
  const line = (n) => {
    const j = k.juz[n];
    const mark = j.done ? '✅' : j.uid ? '📖' : '▫️';
    return `${mark} \`${String(n).padStart(2, '0')}\` ${JUZ[n - 1]}${j.uid ? ` — <@${j.uid}>` : ''}`;
  };
  const col = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => line(a + i)).join('\n');
  const e = ui
    .embed()
    .setColor(COLOR)
    .setDescription(
      [
        `### 📖 الختمة الجماعية رقم ${AR(data(gid).completed + 1)}`,
        k.dedication ? `🤍 ${k.dedication}` : null,
        `${bar} **${AR(pct)}٪** • ✅ ${AR(done)} مقروء • 📖 ${AR(taken)} محجوز • ▫️ ${AR(30 - done - taken)} فاضي`,
        ui.hint(`اختار جزء من القائمة، ولما تخلّصه اضغط "خلّصت". الجزء المحجوز بينفك لحاله بعد ${config(gid).holdHours} ساعة إذا ما خلص.`),
      ]
        .filter(Boolean)
        .join('\n')
    )
    .addFields({ name: 'الأجزاء ١ – ١٥', value: col(1, 15), inline: true }, { name: 'الأجزاء ١٦ – ٣٠', value: col(16, 30), inline: true })
    .setFooter({ text: `بدأها ${k.startedByName || ''} • ${new Date(k.startedAt).toLocaleDateString('ar-JO')}` });

  const menu = (half) => {
    const [a, b] = half === 1 ? [1, 15] : [16, 30];
    const free = [];
    for (let n = a; n <= b; n++) if (!k.juz[n].uid) free.push(n);
    const m = new StringSelectMenuBuilder().setCustomId(`kh:pick:${half}`).setPlaceholder(free.length ? `📖 احجز جزء من ${AR(a)} لـ ${AR(b)}` : `كل أجزاء ${AR(a)} – ${AR(b)} محجوزة`);
    if (!free.length) return m.addOptions({ label: 'لا يوجد', value: 'none' }).setDisabled(true);
    return m.addOptions(free.map((n) => ({ label: `الجزء ${n} — ${JUZ[n - 1]}`, value: String(n) })));
  };
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(menu(1)),
      new ActionRowBuilder().addComponents(menu(2)),
      new ActionRowBuilder().addComponents(
        ui.button('kh:done', '✅ خلّصت جزئي', { style: ButtonStyle.Success }),
        ui.button('kh:release', '↩️ تراجعت عن جزء'),
        ui.button('kh:mine', '📋 أجزائي')
      ),
    ],
  };
}

/** The board as a picture: 30 tiles (read / reserved / free), a progress ring and the dedication. */
async function boardImage(guild) {
  const lib = art.canvas();
  const d = data(guild.id);
  const k = d.active;
  if (!lib || !k) return null;
  const W = 1200;
  const H = 800;
  const c = lib.createCanvas(W, H);
  const ctx = c.getContext('2d');
  const acc = '#34d399';
  art.backdrop(ctx, W, H, acc, { glowX: W * 0.75, glowY: 90, waves: false });
  const { done, taken } = stats(k);
  // header (right side)
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = art.hexA(acc, 1);
  ctx.font = art.font('Bold', 24);
  ctx.fillText(`الختمة رقم ${AR(d.completed + 1)}`, W - 60, 72);
  ctx.fillStyle = '#ffffff';
  ctx.font = art.font('Black', 64);
  ctx.fillText('الختمة الجماعية', W - 60, 140);
  if (k.dedication) {
    ctx.fillStyle = 'rgba(230,226,255,0.78)';
    ctx.fillText(art.fitText(ctx, k.dedication, 700, 'Medium', 28), W - 60, 186);
  }
  // progress ring (left)
  const cx = 130;
  const cy = 120;
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, 70, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.stroke();
  if (done) {
    ctx.beginPath();
    ctx.arc(cx, cy, 70, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * done) / 30);
    ctx.strokeStyle = acc;
    ctx.shadowColor = acc;
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.textAlign = 'center';
  ctx.direction = 'ltr';
  ctx.fillStyle = '#ffffff';
  ctx.font = art.font('Black', 44);
  ctx.fillText(`${Math.round((done / 30) * 100)}%`, cx, cy + 8);
  ctx.font = art.font('Bold', 20);
  ctx.fillStyle = 'rgba(230,226,255,0.7)';
  ctx.fillText(`${done} / 30`, cx, cy + 38);
  // legend
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = art.font('Bold', 22);
  let lx = W - 60;
  for (const [label, col, n] of [['مقروء', acc, done], ['محجوز', '#ffc24a', taken], ['فاضي', 'rgba(255,255,255,0.35)', 30 - done - taken]]) {
    const t = `${label} ${n}`;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(lx - 8, 226, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,238,255,0.85)';
    ctx.fillText(t, lx - 24, 234);
    lx -= ctx.measureText(t).width + 60;
  }
  // tiles: 6 × 5, juz 1 at the top right
  const cols = 6;
  const gx = 60;
  const gy = 270;
  const gap = 14;
  const tw = (W - gx * 2 - gap * (cols - 1)) / cols;
  const th = 88;
  const check = await art.glyph('check', '#0b2e22');
  for (let n = 1; n <= 30; n++) {
    const j = k.juz[n];
    const col = (n - 1) % cols;
    const row = Math.floor((n - 1) / cols);
    const x = W - gx - (col + 1) * tw - col * gap;
    const y = gy + row * (th + gap);
    art.rr(ctx, x, y, tw, th, 18);
    if (j.done) {
      const g = ctx.createLinearGradient(0, y, 0, y + th);
      g.addColorStop(0, '#4fe0ad');
      g.addColorStop(1, '#16a874');
      ctx.fillStyle = g;
      ctx.fill();
    } else if (j.uid) {
      ctx.fillStyle = 'rgba(255,194,74,0.14)';
      ctx.fill();
      ctx.strokeStyle = '#ffc24a';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const dark = j.done;
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.font = art.font('Black', 34);
    ctx.fillStyle = dark ? '#0b2e22' : '#ffffff';
    ctx.fillText(AR(n), x + tw - 16, y + 44);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    const who = j.uid ? guild.members.cache.get(j.uid)?.displayName || '' : '';
    ctx.fillStyle = dark ? 'rgba(11,46,34,0.8)' : j.uid ? '#ffd98a' : 'rgba(230,226,255,0.6)';
    ctx.fillText(art.fitText(ctx, who || JUZ[n - 1], tw - 30, 'Bold', 20, 14), x + tw - 16, y + 74);
    if (j.done && check) ctx.drawImage(check, x + 12, y + 12, 30, 30);
  }
  return new AttachmentBuilder(c.toBuffer('image/png'), { name: 'khatma.png' });
}

/** Board message: picture + menus + buttons (falls back to the text board without canvas). */
async function board(guild, { edit = false } = {}) {
  const gid = guild.id;
  const base = boardEmbed(gid);
  const file = await boardImage(guild).catch(() => null);
  if (!file) return base;
  const conf = config(gid);
  const comps = [
    base.components[0],
    base.components[1],
    new ActionRowBuilder().addComponents(
      ui.button('kh:done', 'خلّصت جزئي', { emoji: 'check', style: ButtonStyle.Success }),
      ui.button('kh:release', 'تراجعت', { emoji: 'release' }),
      ui.button('kh:mine', 'أجزائي', { emoji: 'list' })
    ),
  ];
  const out = {
    content: `-# اختار جزء من القائمة، ولما تخلّصه اضغط خلّصت • الجزء المحجوز بينفك بعد ${conf.holdHours} ساعة`,
    embeds: [],
    files: [file],
    components: comps,
  };
  if (edit) out.attachments = [];
  return out;
}

async function refresh(guild) {
  const k = data(guild.id).active;
  if (!k) return;
  const ch = guild.channels.cache.get(k.channelId);
  const msg = ch && (await ch.messages.fetch(k.messageId).catch(() => null));
  if (msg) await msg.edit(await board(guild, { edit: true })).catch(() => {});
}

async function start(guild, channel, user, { dedication = '' } = {}) {
  const d = data(guild.id);
  if (d.active) throw new Error('في ختمة شغالة. خلّصوها أو أنهوها أول.');
  const juz = {};
  for (let n = 1; n <= 30; n++) juz[n] = { uid: '', at: 0, done: false, reminded: false };
  d.active = { channelId: channel.id, messageId: '', startedBy: user.id, startedByName: user.username, startedAt: Date.now(), dedication: String(dedication || '').slice(0, 200), juz };
  const role = config(guild.id).roleId;
  const view = await board(guild);
  if (role) view.content = `<@&${role}>\n${view.content || ''}`;
  const msg = await channel.send({ ...view, allowedMentions: { roles: role ? [role] : [] } });
  d.active.messageId = msg.id;
  store.save('khatma');
  return msg;
}

async function finish(guild, { cancelled = false } = {}) {
  const d = data(guild.id);
  const k = d.active;
  if (!k) return null;
  const readers = [...new Set(Object.values(k.juz).filter((j) => j.done).map((j) => j.uid))];
  d.active = null;
  if (!cancelled) {
    d.completed += 1;
    d.history.unshift({ at: Date.now(), startedAt: k.startedAt, readers: readers.length, dedication: k.dedication });
    d.history = d.history.slice(0, 20);
  }
  store.save('khatma');
  const ch = guild.channels.cache.get(k.channelId);
  const msg = ch && (await ch.messages.fetch(k.messageId).catch(() => null));
  if (msg) await msg.edit({ components: [] }).catch(() => {});
  if (!cancelled && ch) {
    const days = Math.max(1, Math.round((Date.now() - k.startedAt) / 86_400_000));
    await ch
      .send({
        content: [
          `## ختمنا القرآن الكريم ${art.i('party', '🎉')}`,
          `الحمد لله، هاي الختمة رقم **${AR(d.completed)}** بالسيرفر${k.dedication ? `\n🤍 ${k.dedication}` : ''}`,
          `${art.i('book', '📖')} قرأها **${AR(readers.length)}** عضو خلال **${AR(days)}** يوم`,
          `-# ${ui.trim(readers.map((u) => `<@${u}>`).join(' '), 1400)}`,
          'تقبّل الله منا ومنكم، وجعل القرآن ربيع قلوبنا 🤍',
        ].join('\n'),
        files: [art.banner('khatma')].filter(Boolean),
        allowedMentions: { users: readers.slice(0, 50) },
      })
      .catch(() => {});
  }
  return { readers: readers.length };
}

async function onComponent(i) {
  const [, action, arg] = i.customId.split(':');
  const gid = i.guild?.id;
  const d = gid && data(gid);
  if (action === 'new') {
    if (!canManageGuild(i.member)) return i.reply({ content: '• بس الإدارة بتبدأ ختمة.', ephemeral: true });
    await start(i.guild, i.channel, i.user).catch((e) => i.reply({ content: `• ${e.message}`, ephemeral: true }));
    if (!i.replied) await i.update({ components: [] }).catch(() => {});
    return;
  }
  const k = d?.active;
  if (!k || i.message?.id !== k.messageId) return i.reply({ content: '• هالختمة خلصت. شوف آخر لوحة.', ephemeral: true });
  const mine = Object.entries(k.juz).filter(([, j]) => j.uid === i.user.id && !j.done).map(([n]) => Number(n));
  const conf = config(gid);

  if (action === 'pick') {
    const n = Number(i.values[0]);
    if (!n) return i.deferUpdate();
    if (k.juz[n].uid) return i.reply({ content: `• الجزء ${n} انحجز قبلك بثواني 😅 اختار غيره.`, ephemeral: true });
    if (mine.length >= conf.maxPerUser) return i.reply({ content: `• معك ${mine.length} أجزاء لسا ما خلصت (${mine.join('، ')}). خلّص وحد أول.`, ephemeral: true });
    Object.assign(k.juz[n], { uid: i.user.id, at: Date.now(), reminded: false });
    store.save('khatma');
    await i.update(await board(i.guild, { edit: true }));
    return i.followUp({ content: `📖 الجزء **${n}** (${JUZ[n - 1]}) صار إلك. بالتوفيق، ولما تخلّص اضغط **✅ خلّصت جزئي**.`, ephemeral: true });
  }
  if (action === 'done' || action === 'release') {
    if (!mine.length) return i.reply({ content: '• ما معك ولا جزء محجوز. اختار من القائمة.', ephemeral: true });
    if (mine.length > 1 && !arg) {
      const m = new StringSelectMenuBuilder().setCustomId(`kh:${action}Pick`).setPlaceholder(action === 'done' ? 'أي جزء خلّصت؟' : 'أي جزء بدك تتركه؟').addOptions(mine.map((n) => ({ label: `الجزء ${n} — ${JUZ[n - 1]}`, value: String(n) })));
      return i.reply({ components: [new ActionRowBuilder().addComponents(m)], ephemeral: true });
    }
    return apply(i, action, mine[0], false);
  }
  if (action === 'donePick' || action === 'releasePick') return apply(i, action.replace('Pick', ''), Number(i.values[0]), true);
  if (action === 'mine') {
    const all = Object.entries(k.juz).filter(([, j]) => j.uid === i.user.id);
    if (!all.length) return i.reply({ content: '• لسا ما حجزت ولا جزء بهالختمة.', ephemeral: true });
    return i.reply({ content: all.map(([n, j]) => `${j.done ? '✅' : '📖'} الجزء ${n} — ${JUZ[n - 1]}${j.done ? '' : ` (بينفك <t:${Math.round((j.at + conf.holdHours * HOUR) / 1000)}:R>)`}`).join('\n'), ephemeral: true });
  }
  return i.reply({ content: '• غير معروف.', ephemeral: true });
}

async function apply(i, action, n, fromEphemeral) {
  const gid = i.guild.id;
  const k = data(gid).active;
  const j = k?.juz[n];
  if (!j || j.uid !== i.user.id || j.done) return i.reply({ content: '• هالجزء مش معك.', ephemeral: true });
  if (action === 'done') j.done = true;
  else Object.assign(j, { uid: '', at: 0, reminded: false });
  store.save('khatma');
  const text = action === 'done' ? `✅ تقبّل الله! سجلت إنك خلّصت الجزء **${n}**.` : `↩️ تركت الجزء **${n}** وصار فاضي لغيرك.`;
  if (fromEphemeral) {
    await i.update({ content: text, components: [] });
    await refresh(i.guild);
  } else {
    await i.update(await board(i.guild, { edit: true }));
    await i.followUp({ content: text, ephemeral: true });
  }
  if (stats(k).done === 30) await finish(i.guild);
}

// reminders + auto release of stale reservations
async function tick(client) {
  for (const [gid, d] of Object.entries(store.get('khatma'))) {
    const k = d?.active;
    const guild = client.guilds.cache.get(gid);
    if (!k || !guild) continue;
    const hold = config(gid).holdHours * HOUR;
    let changed = false;
    for (const [n, j] of Object.entries(k.juz)) {
      if (!j.uid || j.done) continue;
      const age = Date.now() - j.at;
      if (age >= hold) {
        const uid = j.uid;
        Object.assign(j, { uid: '', at: 0, reminded: false });
        changed = true;
        client.users.fetch(uid).then((u) => u.send(`↩️ الجزء **${n}** من ختمة **${guild.name}** انفك عنك لأنه مرّ وقته. إذا لسا بدك تقرأ، احجزه من جديد 🤍`)).catch(() => {});
      } else if (!j.reminded && age >= hold * 0.75) {
        j.reminded = true;
        changed = true;
        client.users.fetch(j.uid).then((u) => u.send(`📖 تذكير لطيف: الجزء **${n}** (${JUZ[n - 1]}) من ختمة **${guild.name}** معك، وبينفك <t:${Math.round((j.at + hold) / 1000)}:R>. ضغطة "خلّصت" لما تخلص 🤍`)).catch(() => {});
      }
    }
    if (changed) {
      store.save('khatma');
      await refresh(guild);
    }
  }
}

function init(client) {
  client.once(Events.ClientReady, () => setInterval(() => tick(client).catch((e) => console.error('[khatma]', e.message)), 10 * 60_000).unref());
}

module.exports = { init, config, DEFAULT, data, board, start, finish, tick, refresh, JUZ, components: [{ prefix: 'kh:', handle: onComponent }] };
