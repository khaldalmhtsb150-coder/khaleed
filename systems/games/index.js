// Games engine: one game per channel, a lobby with join/leave buttons, then the game runs with
// buttons and menus routed through `gm:<gameId>:<token>:<choice>`. Wins give points + XP;
// points buy perks used inside games (no betting anywhere). Monthly champion role and game nights.
const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const store = require('../../utils/store');
const ui = require('../../utils/ui');
const art = require('../../utils/art');

const COLOR = 0x8b6dff;
const SCALE = Number(process.env.GAMES_TIME_SCALE || 1); // tests run games fast
const DEFAULT = {
  enabled: true,
  channels: [], // empty = any channel
  starterRoleId: '', // empty = anyone can start a game
  lobbySeconds: 30,
  winXp: 60,
  playXp: 10,
  perks: true,
  championRoleId: '',
  night: { enabled: false, day: 4, time: '21:00', channelId: '', roleId: '', games: ['roulette', 'chairs', 'spy', 'mafia'], tz: 'Asia/Amman' },
};
const PERKS = {
  life: { name: 'حياة إضافية', emoji: '❤️', cost: 40, desc: 'بترجع للعبة مرة وحدة بعد ما تطلع' },
  shield: { name: 'درع', emoji: '🛡️', cost: 60, desc: 'بالروليت: اللي بيطردك بيطلع هو بدالك' },
  double: { name: 'طرد مزدوج', emoji: '⚔️', cost: 50, desc: 'بالروليت: بتطرد اتنين بدل واحد' },
};
const POINTS = { win: 10, play: 2 };

const config = (gid) => {
  const c = store.peek('gamesConfig', gid) || {};
  return { ...DEFAULT, ...c, night: { ...DEFAULT.night, ...(c.night || {}) } };
};
const embed = () => ui.embed().setColor(COLOR);
const monthKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);

const TYPES = new Map();
const listeners = new Map(); // channelId → Set(fn) for games reading chat
const games = new Map(); // gameId → Game
const byChannel = new Map(); // channelId → gameId
let seq = 0;

class Stop extends Error {}

class Game {
  constructor(type, channel, host) {
    this.id = (++seq).toString(36) + Date.now().toString(36).slice(-3);
    this.type = type;
    this.channel = channel;
    this.guild = channel.guild;
    this.host = host;
    this.players = new Map(); // id → { id, name }
    this.alive = new Set();
    this.handlers = new Map();
    this.stopped = false;
    this.started = false;
    this.timers = new Set();
    this.extra = {};
  }
  name(id) {
    return this.players.get(id)?.name || 'لاعب';
  }
  mention(id) {
    return `<@${id}>`;
  }
  aliveList() {
    return [...this.alive];
  }
  async send(payload) {
    if (this.stopped) throw new Stop();
    const p = typeof payload === 'string' ? { content: payload } : payload;
    return this.channel.send({ allowedMentions: { parse: [] }, ...p });
  }
  sleep(ms) {
    return new Promise((resolve, reject) => {
      if (this.stopped) return reject(new Stop());
      const t = setTimeout(() => {
        this.timers.delete(t);
        this.stopped ? reject(new Stop()) : resolve();
      }, ms * SCALE);
      this.timers.add(t);
    });
  }
  check() {
    if (this.stopped) throw new Stop();
  }
  /** A button/menu id belonging to this game. */
  cid(token, choice = '_') {
    return `gm:${this.id}:${token}:${choice}`;
  }
  button(token, choice, label, opts = {}) {
    return ui.button(this.cid(token, choice), label, opts);
  }
  select(token, options, { placeholder = 'اختار', min = 1, max = 1, choice = 'sel' } = {}) {
    return new StringSelectMenuBuilder()
      .setCustomId(this.cid(token, choice))
      .setPlaceholder(placeholder)
      .setMinValues(min)
      .setMaxValues(Math.min(max, options.length))
      .addOptions(options.slice(0, 25));
  }
  on(token, fn) {
    this.handlers.set(token, fn);
  }
  off(token) {
    this.handlers.delete(token);
  }
  /** Members picker: one or more select menus (25 per menu) of the given players. */
  pickerRows(token, ids, { placeholder = 'اختار لاعب', max = 1 } = {}) {
    const rows = [];
    for (let i = 0; i < ids.length && rows.length < 4; i += 25) {
      const chunk = ids.slice(i, i + 25).map((id) => ({ label: this.name(id).slice(0, 100), value: id }));
      rows.push(new ActionRowBuilder().addComponents(this.select(token, chunk, { placeholder, max, choice: `sel${rows.length}` })));
    }
    return rows;
  }
  /**
   * Waits for one press by an allowed user (or anyone in `who` when null = any alive player).
   * resolves { userId, choice, values, interaction } or null on timeout. The handler acks the click.
   */
  waitFor(token, { who = null, timeout = 20_000, deny = 'مش دورك.' } = {}) {
    return new Promise((resolve, reject) => {
      if (this.stopped) return reject(new Stop());
      const t = setTimeout(() => {
        this.timers.delete(t);
        this.off(token);
        this.stopped ? reject(new Stop()) : resolve(null);
      }, timeout * SCALE);
      this.timers.add(t);
      this.on(token, async (i, choice) => {
        const allowed = who ? (Array.isArray(who) ? who.includes(i.user.id) : who === i.user.id) : this.alive.has(i.user.id);
        if (!allowed) return i.reply({ content: `• ${deny}`, ephemeral: true });
        clearTimeout(t);
        this.timers.delete(t);
        this.off(token);
        resolve({ userId: i.user.id, choice, values: i.values || [], interaction: i });
      });
    });
  }
  /** Resolves with the first message in this channel passing `filter`, or null on timeout. */
  waitMessage(filter, timeout = 20_000) {
    return new Promise((resolve, reject) => {
      if (this.stopped) return reject(new Stop());
      const done = (v) => {
        clearTimeout(t);
        this.timers.delete(t);
        listeners.get(this.channel.id)?.delete(fn);
        resolve(v);
      };
      const fn = (m) => {
        if (!m.author?.bot && filter(m)) done(m);
      };
      const t = setTimeout(() => (this.stopped ? reject(new Stop()) : done(null)), timeout * SCALE);
      this.timers.add(t);
      if (!listeners.has(this.channel.id)) listeners.set(this.channel.id, new Set());
      listeners.get(this.channel.id).add(fn);
    });
  }
  stop() {
    this.stopped = true;
    listeners.delete(this.channel.id);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.handlers.clear();
  }
}

// ---------- stats, points, perks ----------
function statOf(gid, uid) {
  const all = store.get('gameStats');
  all[gid] = all[gid] || {};
  const s = (all[gid][uid] = all[gid][uid] || { wins: 0, played: 0, points: 0, month: '', mpoints: 0, byGame: {} });
  if (s.month !== monthKey()) {
    s.month = monthKey();
    s.mpoints = 0;
  }
  return s;
}
function perksOf(gid, uid) {
  const all = store.get('gamePerks');
  all[gid] = all[gid] || {};
  return (all[gid][uid] = all[gid][uid] || { life: 0, shield: 0, double: 0 });
}
function usePerk(gid, uid, perk) {
  if (!config(gid).perks) return false;
  const p = perksOf(gid, uid);
  if (!(p[perk] > 0)) return false;
  p[perk]--;
  store.save('gamePerks');
  return true;
}
function hasPerk(gid, uid, perk) {
  return config(gid).perks && (store.get('gamePerks')[gid]?.[uid]?.[perk] || 0) > 0;
}
function buyPerk(gid, uid, perk) {
  const def = PERKS[perk];
  if (!def) throw new Error('ميزة غير معروفة');
  const s = statOf(gid, uid);
  if (s.points < def.cost) throw new Error(`بدك ${def.cost} نقطة، ومعك ${s.points}. العب واربح عشان تجمع نقاط.`);
  s.points -= def.cost;
  perksOf(gid, uid)[perk]++;
  store.save('gameStats');
  store.save('gamePerks');
  return perksOf(gid, uid);
}
function top(gid, { month = false, n = 10 } = {}) {
  const mk = monthKey();
  return Object.entries(store.get('gameStats')[gid] || {})
    .map(([uid, s]) => [uid, month ? (s.month === mk ? s.mpoints : 0) : s.wins, s])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

async function award(game, winners) {
  const conf = config(game.guild.id);
  const levels = require('../levels');
  const night = nights.get(game.guild.id);
  for (const uid of game.players.keys()) {
    const s = statOf(game.guild.id, uid);
    const won = winners.includes(uid);
    s.played++;
    const pts = won ? POINTS.win : POINTS.play;
    s.points += pts;
    s.mpoints += pts;
    s.byGame[game.type.id] = s.byGame[game.type.id] || { w: 0, p: 0 };
    s.byGame[game.type.id].p++;
    if (won) {
      s.wins++;
      s.byGame[game.type.id].w++;
    }
    if (night) night.points[uid] = (night.points[uid] || 0) + pts;
    const member = game.guild.members.cache.get(uid);
    const xp = won ? conf.winXp : conf.playXp;
    if (member && xp) await levels.addXp(member, xp, 'text', game.channel).catch(() => {});
  }
  store.save('gameStats');
}

// ---------- lobby ----------
/** Icon-only button when the bot's icon is there, otherwise a short text label. */
function iconButton(game, token, choice, key, fallback, style = ButtonStyle.Secondary, disabled = false) {
  const em = art.icon(key);
  if (!em) return game.button(token, choice, fallback, { style, disabled });
  return new ButtonBuilder().setCustomId(game.cid(token, choice)).setEmoji(em).setStyle(style).setDisabled(disabled);
}

function playersLine(ids, max = 15) {
  if (!ids.length) return '';
  return ids.slice(0, max).map((id) => `<@${id}>`).join(' ') + (ids.length > max ? `  +${ids.length - max}` : '');
}

function lobbyView(game, left, { first = false, state = 'open' } = {}) {
  const t = game.type;
  const ids = [...game.players.keys()];
  const count = `**( ${ids.length} / ${t.max} )**`;
  let head;
  if (state === 'open') head = `${count} • ${art.i('hourglass', '⏳')} <t:${Math.ceil((Date.now() + left) / 1000)}:R>`;
  else if (state === 'started') head = `${count} • ${art.i('start', '▶️')} بلشت اللعبة`;
  else head = `${count} • ${art.i('cancel', '✕')} ${state}`;
  const lines = [head];
  if (ids.length) lines.push(`-# ${playersLine(ids)}`);
  else if (state === 'open') lines.push(`-# بدها ${t.min} لاعبين على الأقل`);
  const payload = { content: lines.join('\n'), components: [], allowedMentions: { parse: [] } };
  if (state === 'open') {
    payload.components = [
      new ActionRowBuilder().addComponents(
        game.button('lobby', 'join', 'دخول', { emoji: 'join', style: ButtonStyle.Success }),
        game.button('lobby', 'leave', 'خروج', { emoji: 'leave', style: ButtonStyle.Danger }),
        game.button('lobby', 'start', 'ابدأ', { emoji: 'start', style: ButtonStyle.Primary, disabled: ids.length < t.min })
      ),
      new ActionRowBuilder().addComponents(iconButton(game, 'lobby', 'players', 'players', 'اللاعبين'), iconButton(game, 'lobby', 'help', 'help', 'الشرح'), iconButton(game, 'lobby', 'cancel', 'cancel', 'إلغاء')),
    ];
  }
  if (first) {
    const b = art.banner(t.id);
    if (b) payload.files = [b];
    else payload.embeds = [embed().setDescription(`## ${t.emoji} ${t.name}\n${t.desc}`)];
  }
  return payload;
}

const isManager = (member) => member?.permissions?.has('ManageGuild') || require('../../utils/perms').canManageGuild(member);

async function runLobby(game) {
  const conf = config(game.guild.id);
  const wait = Math.max(10, Math.min(120, Number(conf.lobbySeconds) || 30)) * 1000 * SCALE;
  const endAt = Date.now() + wait;
  let msg;
  let editTimer = null;
  const refresh = () => {
    if (editTimer || !msg) return;
    editTimer = setTimeout(() => {
      editTimer = null;
      if (!game.started && !game.stopped) msg.edit(lobbyView(game, endAt - Date.now())).catch(() => {});
    }, 700);
  };
  let startNow;
  const early = new Promise((r) => (startNow = r));
  game.on('lobby', async (i, choice) => {
    const uid = i.user.id;
    if (choice === 'players') {
      const ids = [...game.players.keys()];
      return i.reply({ content: ids.length ? ids.map((id, n) => `\`${String(n + 1).padStart(2, '0')}\` <@${id}>`).join('\n') : 'لسا ما حدا دخل.', ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (choice === 'help') {
      const t = game.type;
      return i.reply({ content: [`### ${t.emoji} ${t.name}`, t.desc, t.howto ? `-# ${t.howto}` : null, `-# من ${t.min} لـ ${t.max} لاعب • الفوز +${POINTS.win} نقاط و XP`].filter(Boolean).join('\n'), ephemeral: true });
    }
    if (choice === 'join') {
      if (i.user.bot) return i.deferUpdate();
      if (game.players.has(uid)) return i.reply({ content: '• إنت داخل أصلاً.', ephemeral: true });
      if (game.players.size >= game.type.max) return i.reply({ content: '• اللعبة مليانة.', ephemeral: true });
      game.players.set(uid, { id: uid, name: (i.member?.displayName || i.user.username).slice(0, 32) });
      await i.deferUpdate();
      return refresh();
    }
    if (choice === 'leave') {
      if (!game.players.delete(uid)) return i.reply({ content: '• إنت مش داخل.', ephemeral: true });
      await i.deferUpdate();
      return refresh();
    }
    const allowed = uid === game.host || isManager(i.member);
    if (!allowed) return i.reply({ content: '• بس صاحب اللعبة أو الإدارة.', ephemeral: true });
    if (choice === 'start') {
      if (game.players.size < game.type.min) return i.reply({ content: `• لازم ${game.type.min} لاعبين على الأقل.`, ephemeral: true });
      await i.deferUpdate();
      return startNow();
    }
    if (choice === 'cancel') {
      await i.deferUpdate();
      game.cancelled = true;
      return startNow();
    }
  });
  msg = await game.send(lobbyView(game, wait, { first: true }));
  await Promise.race([new Promise((r) => game.timers.add(setTimeout(r, wait))), early]);
  game.off('lobby');
  clearTimeout(editTimer);
  game.started = true;
  const ok = !game.cancelled && game.players.size >= game.type.min;
  const view = lobbyView(game, 0, { state: ok ? 'started' : game.cancelled ? 'انلغت اللعبة' : `انلغت، ما اكتمل العدد (بدها ${game.type.min})` });
  await msg.edit({ content: view.content, components: [] }).catch(() => {});
  return ok;
}

/** The end-of-game post: a winner card (avatars + crown) and one short line. */
async function announce(game, result) {
  const winners = result.winners || [];
  const conf = config(game.guild.id);
  const reward = `+${POINTS.win} نقاط • +${conf.winXp} XP للفائز • +${POINTS.play} للمشاركة`;
  const head = winners.length ? `${art.i('trophy', '🏆')} **${result.title || 'انتهت اللعبة'}** — مبروك ${winners.map((id) => `<@${id}>`).join(' ')}` : `${art.i('cancel', '✕')} **${result.title || 'انتهت اللعبة'}** — ما في فائز هالمرة`;
  const content = [head, result.text ? result.text : null, `-# ${reward}`].filter(Boolean).join('\n');
  let card = null;
  if (winners.length) {
    const list = [];
    for (const id of winners.slice(0, 5)) {
      const m = game.guild.members.cache.get(id) || (await game.guild.members.fetch?.(id).catch(() => null));
      list.push({ name: m?.displayName || game.name(id), avatar: m?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null });
    }
    card = await art.winnerCard({ gameKey: game.type.id, gameTitle: game.type.name, title: result.title || 'الفائز', winners: list, reward: '' }).catch(() => null);
  }
  const { AttachmentBuilder } = require('discord.js');
  await game.send({ content: ui.trim(content, 1900), files: card ? [new AttachmentBuilder(card, { name: 'winner.png' })] : [], allowedMentions: { users: winners } });
}

/** Starts a game in a channel; resolves when it ends. */
async function start(typeId, channel, hostId, { quiet = false } = {}) {
  const type = TYPES.get(typeId);
  if (!type) throw new Error('لعبة غير معروفة');
  const conf = config(channel.guild.id);
  if (!conf.enabled) throw new Error('الألعاب موقفة بهالسيرفر.');
  if (conf.channels.length && !conf.channels.includes(channel.id)) throw new Error(`الألعاب مسموحة بس بـ ${conf.channels.map((c) => `<#${c}>`).join(' ')}`);
  if (byChannel.has(channel.id)) throw new Error('في لعبة شغالة بهالروم. استنى تخلص، أو وقفها بـ /games action:stop');
  const game = new Game(type, channel, hostId);
  const hostMember = channel.guild.members.cache.get(hostId);
  game.players.set(hostId, { id: hostId, name: (hostMember?.displayName || 'صاحب اللعبة').slice(0, 32) });
  if (quiet || type.instant) game.players.clear();
  games.set(game.id, game);
  byChannel.set(channel.id, game.id);
  const done = (async () => {
    try {
      if (type.instant) game.started = true;
      else if (!(await runLobby(game))) return null;
      for (const id of game.players.keys()) game.alive.add(id);
      const result = (await type.run(game)) || { winners: [] };
      if (!game.stopped) {
        await award(game, result.winners || []);
        await announce(game, result);
      }
      return result;
    } catch (e) {
      if (!(e instanceof Stop)) {
        console.error(`[games:${type.id}]`, e);
        channel.send({ content: '• صار خطأ وانلغت اللعبة.' }).catch(() => {});
      }
      return null;
    } finally {
      game.stop();
      games.delete(game.id);
      if (byChannel.get(channel.id) === game.id) byChannel.delete(channel.id);
    }
  })();
  game.done = done;
  return { game, done };
}

function stopIn(channelId) {
  const id = byChannel.get(channelId);
  const game = id && games.get(id);
  if (!game) return false;
  game.stop();
  games.delete(id);
  byChannel.delete(channelId);
  return true;
}

async function onComponent(interaction) {
  const [, gameId, token, choice] = interaction.customId.split(':');
  const game = games.get(gameId);
  const handler = game?.handlers.get(token);
  if (!handler) return interaction.reply({ content: '• هاي اللعبة أو الجولة خلصت.', ephemeral: true });
  try {
    await handler(interaction, choice);
  } catch (e) {
    console.error('[games:component]', e.message);
    if (!interaction.replied && !interaction.deferred) interaction.reply({ content: '• ما زبطت، جرّب كمان مرة.', ephemeral: true }).catch(() => {});
  }
}

// ---------- monthly champion ----------
async function championTick(client) {
  const st = store.get('gamesState');
  const mk = monthKey();
  for (const guild of client.guilds.cache.values()) {
    const conf = config(guild.id);
    if (!conf.championRoleId) continue;
    const gs = (st[guild.id] = st[guild.id] || {});
    if (!gs.month) {
      gs.month = mk;
      continue;
    }
    if (gs.month === mk) continue;
    // the month just ended: crown last month's top player
    const prevBest = Object.entries(store.get('gameStats')[guild.id] || {})
      .filter(([, s]) => s.month === gs.month && s.mpoints > 0)
      .sort((a, b) => b[1].mpoints - a[1].mpoints)[0];
    gs.month = mk;
    const role = guild.roles.cache.get(conf.championRoleId);
    if (!role) continue;
    for (const m of role.members?.values?.() || []) await m.roles.remove(role).catch(() => {});
    if (prevBest) {
      const m = await guild.members.fetch(prevBest[0]).catch(() => null);
      if (m) await m.roles.add(role, 'بطل ألعاب الشهر').catch(() => {});
      gs.champion = prevBest[0];
    }
  }
  store.save('gamesState');
}

// ---------- game nights ----------
const nights = new Map(); // guildId → { points }
const localParts = (tz, d = new Date()) => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false }).formatToParts(d);
  const g = (t) => f.find((x) => x.type === t)?.value;
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), hm: `${g('hour')}:${g('minute')}`, date: `${g('year')}-${g('month')}-${g('day')}` };
};
const minusMinutes = (hm, m) => {
  const [h, mi] = hm.split(':').map(Number);
  const t = (h * 60 + mi - m + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

async function runNight(guild, conf, client) {
  const ch = guild.channels.cache.get(conf.night.channelId);
  if (!ch || nights.has(guild.id)) return false;
  const night = { points: {} };
  nights.set(guild.id, night);
  try {
    const list = conf.night.games.filter((g) => TYPES.has(g));
    await ch.send({
      allowedMentions: { roles: conf.night.roleId ? [conf.night.roleId] : [] },
      content: [conf.night.roleId ? `<@&${conf.night.roleId}>` : null, `**سهرة الألعاب بلشت** ${art.i('party', '🎉')}`, `-# الليلة: ${list.map((g) => TYPES.get(g).name).join('  ←  ')}`].filter(Boolean).join('\n'),
      files: [art.banner('night')].filter(Boolean),
    });
    for (const id of list) {
      if (byChannel.has(ch.id)) break;
      const { done } = await start(id, ch, client.user.id, { quiet: true });
      await done;
      await new Promise((r) => setTimeout(r, 15_000 * SCALE));
    }
    const podium = Object.entries(night.points)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    let card = null;
    if (podium.length) {
      const list = [];
      for (const [u] of podium) {
        const m = guild.members.cache.get(u) || (await guild.members.fetch(u).catch(() => null));
        list.push({ name: m?.displayName || 'لاعب', avatar: m?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null });
      }
      card = await art.winnerCard({ gameKey: 'night', gameTitle: 'سهرة الألعاب', title: 'أبطال السهرة', winners: list }).catch(() => null);
    }
    const { AttachmentBuilder } = require('discord.js');
    await ch.send({
      content: [`${art.i('trophy', '🏆')} **أبطال السهرة**`, podium.length ? podium.map(([u, p], i) => `${medals[i]} <@${u}> — ${p} نقطة`).join('\n') : 'ما حدا لعب الليلة.', '-# شكراً لكل اللي شاركوا، نشوفكم بالسهرة الجاي'].join('\n'),
      files: card ? [new AttachmentBuilder(card, { name: 'night.png' })] : [],
      allowedMentions: { users: podium.map(([u]) => u) },
    });
    return true;
  } finally {
    nights.delete(guild.id);
  }
}

async function nightTick(client) {
  const st = store.get('gamesState');
  for (const guild of client.guilds.cache.values()) {
    const conf = config(guild.id);
    if (!conf.night.enabled || !conf.night.channelId) continue;
    const now = localParts(conf.night.tz || 'Asia/Amman');
    const gs = (st[guild.id] = st[guild.id] || {});
    if (now.day !== Number(conf.night.day)) continue;
    const ch = guild.channels.cache.get(conf.night.channelId);
    if (!ch) continue;
    if (now.hm === minusMinutes(conf.night.time, 30) && gs.nightReminded !== now.date) {
      gs.nightReminded = now.date;
      store.save('gamesState');
      ch.send({
        allowedMentions: { roles: conf.night.roleId ? [conf.night.roleId] : [] },
        content: [conf.night.roleId ? `<@&${conf.night.roleId}>` : null, `${art.i('bell', '⏰')} **سهرة الألعاب بعد نص ساعة**`, `-# الساعة ${conf.night.time} بنبلّش، جهّزوا حالكم`].filter(Boolean).join('\n'),
      }).catch(() => {});
    }
    if (now.hm === conf.night.time && gs.nightRan !== now.date) {
      gs.nightRan = now.date;
      store.save('gamesState');
      runNight(guild, conf, client).catch((e) => console.error('[games:night]', e.message));
    }
  }
}

function register(type) {
  TYPES.set(type.id, type);
}

function init(client) {
  for (const f of ['roulette', 'mafia', 'chairs', 'spy', 'xo', 'rps', 'deathbox', 'mini']) {
    const mod = require(`./${f}`);
    (Array.isArray(mod) ? mod : [mod]).forEach(register);
  }
  client.on(Events.MessageCreate, (m) => {
    const set = listeners.get(m.channelId);
    if (set) for (const fn of [...set]) fn(m);
  });
  client.once(Events.ClientReady, () => {
    setInterval(() => {
      nightTick(client).catch(() => {});
      championTick(client).catch(() => {});
    }, 30_000).unref();
  });
}

module.exports = {
  iconButton,
  announce,
  init,
  config,
  DEFAULT,
  PERKS,
  POINTS,
  TYPES,
  Game,
  Stop,
  start,
  stopIn,
  statOf,
  perksOf,
  usePerk,
  hasPerk,
  buyPerk,
  top,
  embed,
  register,
  runNight,
  nightTick,
  championTick,
  _games: games,
  _listeners: listeners,
  _byChannel: byChannel,
  components: [{ prefix: 'gm:', type: 'button', handle: onComponent }],
};
