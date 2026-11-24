// Adhkar: a reader with a counter (morning, evening, sleep, ...), an electronic tasbeeh,
// and automatic posts in a channel: a dhikr/verse/du'a every N minutes, morning & evening adhkar
// after Fajr and Asr (by the server's prayer city), and a Friday reminder.
const { Events, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const prayer = require('./prayer');
const { CATEGORIES, RANDOM, FRIDAY, TASBEEH } = require('../utils/adhkarData');

const COLOR = 0x2e8b6e; // calm green for everything religious
const DEFAULT = { enabled: false, channelId: '', interval: 60, skipIdle: true, sabahMasa: true, friday: true, roleId: '', city: '' };
const config = (gid) => ({ ...DEFAULT, ...(store.peek('adhkarConfig', gid) || {}) });
const state = (gid) => store.guild('adhkarState', gid, {});
const cityOf = (gid) => {
  const c = config(gid).city || prayer.config(gid).city || 'amman';
  return prayer.CITIES[c] ? c : 'amman';
};
const embed = () => ui.embed().setColor(COLOR);
const KIND_ICON = { ذكر: '🤍', آية: '📖', دعاء: '🤲' };

// ---------- reader ----------
const CAT_KEYS = Object.keys(CATEGORIES);

function catMenu(uid, current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`azk_cat:${uid}`)
      .setPlaceholder('اختر نوع الأذكار')
      .addOptions(
        CAT_KEYS.map((k) => ({ label: CATEGORIES[k].name, value: k, emoji: CATEGORIES[k].emoji, description: CATEGORIES[k].intro.slice(0, 90), default: k === current }))
      )
  );
}

/** One dhikr per page. n = how many times the reader has counted this one. */
function page(uid, cat, i, n = 0) {
  const c = CATEGORIES[cat] || CATEGORIES.sabah;
  i = Math.max(0, Math.min(c.items.length - 1, i));
  const it = c.items[i];
  const done = n >= it.count;
  const desc = [
    `### ${c.emoji} ${c.name}`,
    '',
    it.text
      .split('\n')
      .map((l) => (l.trim() ? `> **${l}**` : '>'))
      .join('\n'),
    '',
    it.virtue ? `✨ ${it.virtue}` : null,
    ui.hint(`${it.source} • التكرار: ${it.count === 1 ? 'مرة واحدة' : `${it.count} مرات`}`),
  ]
    .filter((x) => x !== null)
    .join('\n');
  const e = embed()
    .setDescription(ui.trim(desc, 4000))
    .setFooter({ text: `${i + 1} / ${c.items.length}${done ? '  •  ✓ تم' : ''}` });

  const last = i === c.items.length - 1;
  const row = new ActionRowBuilder().addComponents(
    ui.button(`azk_r:${uid}:${cat}:${i - 1}:0`, 'السابق', { disabled: i === 0 }),
    ui
      .button(`azk_r:${uid}:${cat}:${i}:${n + 1}:c`, it.count === 1 ? (done ? '✓ تم' : 'قرأته') : `📿 ${Math.min(n, it.count)} / ${it.count}`, {
        style: done ? ButtonStyle.Success : ButtonStyle.Primary,
        disabled: done && last,
      }),
    ui.button(`azk_r:${uid}:${cat}:${i + 1}:0`, last ? 'النهاية' : 'التالي', { disabled: last })
  );
  return { embeds: [e], components: [row, catMenu(uid, cat)] };
}

function finished(uid, cat) {
  const c = CATEGORIES[cat];
  return {
    embeds: [
      embed().setDescription(
        [`### ${c.emoji} تقبّل الله منك`, '', `خلّصت **${c.name}** كاملة 🤍`, '', '> **أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ**', ui.hint('الرعد: 28')].join('\n')
      ),
    ],
    components: [new ActionRowBuilder().addComponents(ui.button(`azk_r:${uid}:${cat}:0:0`, 'من الأول')), catMenu(uid, cat)],
  };
}

function menu(uid) {
  const lines = CAT_KEYS.map((k) => `${CATEGORIES[k].emoji} **${CATEGORIES[k].name}** — ${CATEGORIES[k].items.length} ${CATEGORIES[k].items.length > 10 ? 'ذكراً' : 'أذكار'}`);
  return {
    embeds: [
      embed().setDescription(
        [
          '### 📿 الأذكار',
          '> **فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ**',
          ui.hint('البقرة: 152'),
          '',
          ...lines,
          '',
          ui.hint('اختر من القائمة، وكل ذكر فيه عدّاد بتكبس عليه وإنت بتقرأ'),
        ].join('\n')
      ),
    ],
    components: [catMenu(uid)],
  };
}

async function onReader(interaction) {
  const [, uid, cat, iRaw, nRaw, act] = interaction.customId.split(':');
  if (interaction.user.id !== uid) {
    return interaction.reply({ ...page(interaction.user.id, cat, 0), ephemeral: true });
  }
  const c = CATEGORIES[cat];
  const i = Number(iRaw);
  let n = Number(nRaw) || 0;
  if (act === 'c' && n >= c.items[i].count) {
    // counted enough → move on by itself
    if (i === c.items.length - 1) return interaction.update(finished(uid, cat));
    return interaction.update(page(uid, cat, i + 1, 0));
  }
  return interaction.update(page(uid, cat, i, n));
}

async function onCat(interaction) {
  const uid = interaction.customId.split(':')[1];
  const cat = interaction.values[0];
  if (interaction.user.id !== uid) return interaction.reply({ ...page(interaction.user.id, cat, 0), ephemeral: true });
  return interaction.update(page(uid, cat, 0));
}

/** "Read" buttons under automatic posts: everyone gets their own private reader. */
async function onOpen(interaction) {
  const what = interaction.customId.split(':')[1];
  if (what === 'tsb') return interaction.reply({ ...tasbeeh(interaction.user.id, interaction.guildId, 0, 0), ephemeral: true });
  if (what === 'menu') return interaction.reply({ ...menu(interaction.user.id), ephemeral: true });
  return interaction.reply({ ...page(interaction.user.id, CATEGORIES[what] ? what : 'sabah', 0), ephemeral: true });
}

// ---------- tasbeeh ----------
const totals = () => store.get('tasbeeh'); // gid → uid → total
let saveTimer = null;
const saveSoon = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    store.save('tasbeeh');
  }, 5000);
};
const totalOf = (gid, uid) => totals()[gid]?.[uid] || 0;

function tasbeeh(uid, gid, phrase = 0, session = 0) {
  phrase = ((phrase % TASBEEH.length) + TASBEEH.length) % TASBEEH.length;
  const round = session % 33 === 0 && session > 0 ? '  ✨ أتممت 33' : '';
  const e = embed().setDescription(
    [
      '### 📿 المسبحة',
      '',
      `## ${TASBEEH[phrase]}`,
      '',
      `**${session}**${round}`,
      ui.hint(`مجموع تسبيحك بهالسيرفر: ${totalOf(gid, uid).toLocaleString('en')}`),
    ].join('\n')
  );
  const row = new ActionRowBuilder().addComponents(
    ui.button(`tsb:${uid}:${phrase}:${session + 1}:add`, 'سبّح', { style: ButtonStyle.Success }),
    ui.button(`tsb:${uid}:${phrase + 1}:0:next`, 'الذكر التالي'),
    ui.button(`tsb:${uid}:${phrase}:0:reset`, 'تصفير', { style: ButtonStyle.Danger })
  );
  return { embeds: [e], components: [row] };
}

async function onTasbeeh(interaction) {
  const [, uid, phrase, session, act] = interaction.customId.split(':');
  if (interaction.user.id !== uid) return interaction.reply({ ...tasbeeh(interaction.user.id, interaction.guildId, 0, 0), ephemeral: true });
  if (act === 'add' && interaction.guildId) {
    const t = totals();
    t[interaction.guildId] = t[interaction.guildId] || {};
    t[interaction.guildId][uid] = (t[interaction.guildId][uid] || 0) + 1;
    saveSoon();
  }
  return interaction.update(tasbeeh(uid, interaction.guildId, Number(phrase), Number(session)));
}

function topTasbeeh(gid, n = 10) {
  return Object.entries(totals()[gid] || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// ---------- automatic posts ----------
function randomCard(gid) {
  const st = state(gid);
  // go through the whole list in a shuffled order before repeating anything
  if (!Array.isArray(st.bag) || !st.bag.length) st.bag = RANDOM.map((_, i) => i).sort(() => Math.random() - 0.5);
  const it = RANDOM[st.bag.pop()] || RANDOM[0];
  const e = embed().setDescription(
    [`### ${KIND_ICON[it.kind] || '🤍'} ${it.kind}`, '', `> **${it.text}**`, '', it.virtue ? `✨ ${it.virtue}` : null, ui.hint(it.source)].filter((x) => x !== null).join('\n')
  );
  const row = new ActionRowBuilder().addComponents(ui.button('azk_open:tsb', 'المسبحة', { emoji: 'sparkles' }), ui.button('azk_open:menu', 'الأذكار', { emoji: 'book' }));
  return { embeds: [e], components: [row] };
}

function sabahMasaCard(cat) {
  const c = CATEGORIES[cat];
  const morning = cat === 'sabah';
  const e = embed().setDescription(
    [
      `### ${c.emoji} حان وقت ${c.name}`,
      '',
      '> **فَسُبْحَانَ اللَّهِ حِينَ تُمْسُونَ وَحِينَ تُصْبِحُونَ**',
      ui.hint('الروم: 17'),
      '',
      morning ? 'ابدأ يومك بذكر الله، وخلّي الأذكار حصنك لآخر النهار 🤍' : 'اختم نهارك بذكر الله، وخلّي الأذكار حصنك لحد الصبح 🤍',
      '',
      `اكبس الزر تحت، وبتفتحلك **${c.name}** (${c.items.length} ذكراً) مع عدّاد لكل ذكر.`,
    ].join('\n')
  );
  const row = new ActionRowBuilder().addComponents(ui.button(`azk_open:${cat}`, `اقرأ ${c.name}`, { style: ButtonStyle.Success }), ui.button('azk_open:tsb', 'المسبحة', { emoji: 'sparkles' }));
  return { embeds: [e], components: [row] };
}

function fridayCard() {
  const e = embed().setDescription(
    ['### 🕌 جمعة مباركة', '', `> **${FRIDAY.text}**`, ui.hint(FRIDAY.source), '', '**لا تنسى بهاليوم:**', ...FRIDAY.points.map((p) => `• ${p}`)].join('\n')
  );
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(ui.button('azk_open:menu', 'الأذكار', { emoji: 'book' }), ui.button('azk_open:tsb', 'المسبحة', { emoji: 'sparkles' }))] };
}

async function post(guild, conf, payload) {
  const ch = guild.channels.cache.get(conf.channelId);
  if (!ch?.isTextBased()) return null;
  const msg = await ch
    .send({ ...payload, content: conf.roleId ? `<@&${conf.roleId}>` : undefined, allowedMentions: { roles: conf.roleId ? [conf.roleId] : [] } })
    .catch(() => null);
  if (msg) state(guild.id).lastMsgId = msg.id;
  return msg;
}

const localDay = (tz, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
const weekday = (tz, d = new Date()) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);

async function tickGuild(guild, now = new Date()) {
  const conf = config(guild.id);
  if (!conf.enabled || !conf.channelId) return;
  const st = state(guild.id);
  const city = cityOf(guild.id);
  const tz = prayer.CITIES[city].tz;
  const today = localDay(tz, now);
  const t = prayer.times(city, now);
  const ms = now.getTime();
  let changed = false;

  if (conf.sabahMasa) {
    // 20 minutes after Fajr / Asr, as long as it's still that part of the day
    if (st.sabah !== today && ms >= t.fajr.getTime() + 20 * 60_000 && ms < t.dhuhr.getTime()) {
      st.sabah = today;
      changed = true;
      await post(guild, conf, sabahMasaCard('sabah'));
    } else if (st.masa !== today && ms >= t.asr.getTime() + 20 * 60_000 && ms < t.isha.getTime() + 2 * 3_600_000) {
      st.masa = today;
      changed = true;
      await post(guild, conf, sabahMasaCard('masa'));
    }
  }

  if (conf.friday && weekday(tz, now) === 'Fri' && st.friday !== today && ms >= t.sunrise.getTime() + 3_600_000) {
    st.friday = today;
    changed = true;
    await post(guild, conf, fridayCard());
  }

  const every = Math.max(15, Number(conf.interval) || 60) * 60_000;
  if (conf.interval > 0 && ms - (st.lastRandom || 0) >= every) {
    st.lastRandom = ms;
    changed = true;
    const ch = guild.channels.cache.get(conf.channelId);
    // nobody wrote since our last post → don't stack posts in a quiet channel
    const idle = conf.skipIdle && st.lastMsgId && ch?.lastMessageId === st.lastMsgId;
    if (!idle) await post(guild, conf, randomCard(guild.id));
  }

  if (changed) store.save('adhkarState');
}

function init(client) {
  client.once(Events.ClientReady, () => {
    setInterval(() => {
      for (const g of client.guilds.cache.values()) tickGuild(g).catch((e) => console.error('[adhkar]', e.message));
    }, 60_000).unref();
  });
}

module.exports = {
  init,
  config,
  DEFAULT,
  page,
  menu,
  tasbeeh,
  topTasbeeh,
  randomCard,
  sabahMasaCard,
  fridayCard,
  tickGuild,
  CAT_KEYS,
  components: [
    { prefix: 'azk_r:', type: 'button', handle: onReader },
    { prefix: 'azk_cat:', type: 'select', handle: onCat },
    { prefix: 'azk_open:', type: 'button', handle: onOpen },
    { prefix: 'tsb:', type: 'button', handle: onTasbeeh },
  ],
};
