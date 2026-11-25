// Adhkar: a reader with a counter (morning, evening, sleep, ...), an electronic tasbeeh,
// and automatic posts in a channel: a dhikr/verse/du'a every N minutes, morning & evening adhkar
// after Fajr and Asr (by the server's prayer city), and a Friday reminder.
const { Events, ActionRowBuilder, AttachmentBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const prayer = require('./prayer');
const { CATEGORIES, RANDOM, FRIDAY, TASBEEH } = require('../utils/adhkarData');

const COLOR = 0xc9a24f; // the gold of the cards, for the reader and the menus
const DEFAULT = { enabled: false, channelId: '', interval: 60, sabahMasa: true, friday: true, roleId: '', city: '' };
const config = (gid) => ({ ...DEFAULT, ...(store.peek('adhkarConfig', gid) || {}) });
const state = (gid) => store.guild('adhkarState', gid, {});
const cityOf = (gid) => {
  const c = config(gid).city || prayer.config(gid).city || 'amman';
  return prayer.CITIES[c] ? c : 'amman';
};
const embed = () => ui.embed().setColor(COLOR);

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
// Each post is a drawn card (utils/adhkarCard) with the text in a Naskh face, plus a few quiet buttons:
// a shared "I said it / آمين" counter, the text as plain words, the tasbeeh and the full adhkar.
const card = require('../utils/adhkarCard');

const SABAH_TEXT = { text: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ', source: 'رواه مسلم' };
const MASA_TEXT = { text: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ', source: 'رواه مسلم' };
const FRIDAY_HINTS = 'سورة الكهف  ۞  الصلاة على النبي ﷺ  ۞  ساعة الإجابة';
// what the shared button says under each kind of post
const SAID = { ذكر: 'ذكرتُ الله', آية: 'قرأتُها', دعاء: 'آمين', friday: 'صلّيتُ على النبي ﷺ' };

const cache = new Map(); // drawn cards, so the same dhikr isn't drawn twice
async function drawn(key, opts) {
  if (cache.has(key)) return cache.get(key);
  const buf = await card.render(opts).catch((e) => (console.error('[adhkar card]', e.message), null));
  if (buf) {
    cache.set(key, buf);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
  }
  return buf;
}

function saidButton(kind, n = 0) {
  return ui.button(`azk_said:${kind}`, n ? `${SAID[kind] || 'ذكرتُ الله'} · ${n}` : SAID[kind] || 'ذكرتُ الله', { style: ButtonStyle.Success });
}

/** Builds the message: the card as an image when we can draw, otherwise a calm embed. */
function payload(buf, file, fallback, rows) {
  if (buf) return { files: [new AttachmentBuilder(buf, { name: file })], embeds: [], components: rows };
  return { embeds: [fallback], components: rows };
}

function plainEmbed(title, it) {
  return embed().setDescription(
    [`### ${title}`, '', `> **${it.text}**`, ui.hint(it.source), it.virtue ? `\n${it.virtue}` : null].filter((x) => x !== null).join('\n')
  );
}

function nextRandom(gid) {
  const st = state(gid);
  // go through the whole list in a shuffled order before repeating anything
  if (!Array.isArray(st.bag) || !st.bag.length) st.bag = RANDOM.map((_, i) => i).sort(() => Math.random() - 0.5);
  const idx = st.bag.pop();
  return RANDOM[idx] ? idx : 0;
}

async function randomCard(gid, idx = nextRandom(gid)) {
  const it = RANDOM[idx];
  const buf = await drawn(`r${idx}`, { theme: card.KIND_THEME[it.kind], text: it.text, source: it.source, virtue: it.virtue });
  const row = new ActionRowBuilder().addComponents(
    saidButton(it.kind),
    ui.button(`azk_txt:r:${idx}`, 'النص'),
    ui.button('azk_open:tsb', 'المسبحة', { emoji: 'sparkles' }),
    ui.button('azk_open:menu', 'الأذكار', { emoji: 'book' })
  );
  return payload(buf, 'dhikr.png', plainEmbed(it.kind, it), [row]);
}

async function sabahMasaCard(cat) {
  const c = CATEGORIES[cat];
  const morning = cat === 'sabah';
  const it = morning ? SABAH_TEXT : MASA_TEXT;
  const buf = await drawn(cat, { theme: cat, text: it.text, source: it.source });
  const row = new ActionRowBuilder().addComponents(
    ui.button(`azk_open:${cat}`, `اقرأ ${c.name}`, { style: ButtonStyle.Success }),
    ui.button(`azk_txt:${cat}`, 'النص'),
    ui.button('azk_open:tsb', 'المسبحة', { emoji: 'sparkles' })
  );
  return payload(buf, `${cat}.png`, plainEmbed(c.name, it), [row]);
}

async function fridayCard() {
  const buf = await drawn('friday', { theme: 'friday', text: FRIDAY.text, source: FRIDAY.source, virtue: FRIDAY_HINTS, virtueLabel: 'لَا تَنْسَ' });
  const row = new ActionRowBuilder().addComponents(
    saidButton('friday'),
    ui.button('azk_txt:friday', 'النص'),
    ui.button('azk_open:menu', 'الأذكار', { emoji: 'book' })
  );
  return payload(buf, 'jumuah.png', plainEmbed('جمعة مباركة', { ...FRIDAY, virtue: FRIDAY.points.map((p) => `• ${p}`).join('\n') }), [row]);
}

/** The shared counter: each person counts once per post. */
async function onSaid(interaction) {
  const kind = interaction.customId.split(':')[1];
  const st = state(interaction.guildId);
  st.said ||= {};
  const id = interaction.message?.id;
  const list = (st.said[id] ||= []);
  if (list.includes(interaction.user.id)) {
    return interaction.reply({ content: kind === 'دعاء' ? 'آمين، تقبّل الله منك 🤍' : 'تقبّل الله منك، سجّلناها لك قبل 🤍', ephemeral: true });
  }
  list.push(interaction.user.id);
  if (list.length > 5000) list.splice(0, list.length - 5000);
  const keys = Object.keys(st.said);
  if (keys.length > 40) for (const k of keys.slice(0, keys.length - 40)) delete st.said[k];
  store.save('adhkarState');
  const rows = (interaction.message?.components || []).map((r) => ActionRowBuilder.from(r));
  if (rows[0]?.components?.length) rows[0].components[0] = saidButton(kind, list.length);
  return interaction.update({ components: rows });
}

/** The words as plain text, for copying or for screen readers. */
async function onText(interaction) {
  const [, what, idx] = interaction.customId.split(':');
  let it;
  if (what === 'r') it = RANDOM[Number(idx)];
  else if (what === 'sabah') it = SABAH_TEXT;
  else if (what === 'masa') it = MASA_TEXT;
  else if (what === 'friday') it = { ...FRIDAY, virtue: FRIDAY.points.map((p) => `• ${p}`).join('\n') };
  if (!it) return interaction.reply({ content: 'ما لقيت النص.', ephemeral: true });
  return interaction.reply({ content: [it.text, ui.hint(it.source), it.virtue ? `\n${it.virtue}` : null].filter(Boolean).join('\n'), ephemeral: true });
}

async function post(guild, conf, payloadP) {
  const ch = guild.channels.cache.get(conf.channelId);
  if (!ch?.isTextBased()) return null;
  const payload = await payloadP;
  const msg = await ch
    .send({ ...payload, content: conf.roleId ? `<@&${conf.roleId}>` : undefined, allowedMentions: { roles: conf.roleId ? [conf.roleId] : [] } })
    .catch((e) => (console.error('[adhkar post]', e.message), null));
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
    // posts go out on time even if the channel was quiet; a dhikr channel is meant to be a stream
    await post(guild, conf, randomCard(guild.id));
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
    { prefix: 'azk_said:', type: 'button', handle: onSaid },
    { prefix: 'azk_txt:', type: 'button', handle: onText },
  ],
};
