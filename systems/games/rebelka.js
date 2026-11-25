// ريبلكا: إنسان، حيوان، نبات، جماد، بلاد.
// Each round the bot draws a letter; everyone fills the five answers in a form. The first player
// to fill all five shouts "ستوب" and the rest get 10 more seconds. Answers are checked against
// the dictionary; words the dictionary doesn't know go to a quick vote and, if approved, are
// learned by the server for next time. Unique correct answer = 10, shared = 5, wrong/empty = 0.
const { ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const store = require('../../utils/store');
const ui = require('../../utils/ui');
const art = require('../../utils/art');
const DICT = require('./rebelka-dict');
const { COUNTRIES } = require('./content');

const LETTERS = 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'.split(' ');
const CATS = [
  { key: 'name', label: 'اسم', full: 'اسم إنسان' },
  { key: 'animal', label: 'حيوان', full: 'حيوان' },
  { key: 'plant', label: 'نبات', full: 'نبات' },
  { key: 'object', label: 'جماد', full: 'جماد' },
  { key: 'place', label: 'بلاد', full: 'بلاد (دولة أو مدينة)' },
];
const SCALE = Number(process.env.GAMES_TIME_SCALE) || 1;
const ROUND_MS = 75_000 * SCALE;
const STOP_MS = 10_000 * SCALE;
const VOTE_MS = 20_000;

/** Arabic normaliser: strips diacritics/tatweel, unifies hamza forms, ة→ه, ى→ي, drops a leading ال. */
function norm(s) {
  let t = String(s || '')
    .trim()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^؀-ۿ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  t = t
    .split(' ')
    .map((w, i) => (i === 0 && w.startsWith('ال') && w.length > 3 ? w.slice(2) : w))
    .join(' ');
  return t;
}
const firstLetter = (s) => {
  const n = norm(s);
  return n ? n[0] : '';
};
const letterNorm = (l) => norm(l)[0];

function parseList(text) {
  return text
    .split(/[،,\n]/)
    .map((w) => w.trim())
    .filter(Boolean);
}
const BASE = {
  name: new Set(parseList(DICT.NAMES).map(norm)),
  animal: new Set(parseList(DICT.ANIMALS).map(norm)),
  plant: new Set(parseList(DICT.PLANTS).map(norm)),
  object: new Set(parseList(DICT.OBJECTS).map(norm)),
  place: new Set([...parseList(DICT.PLACES), ...Object.values(COUNTRIES).flat()].map(norm)),
};

const learned = (gid) => store.guild('rebelkaLearned', gid, {});
function known(gid, cat, word) {
  const n = norm(word);
  if (BASE[cat].has(n)) return true;
  return (learned(gid)[cat] || []).includes(n);
}
function learn(gid, cat, word) {
  const l = learned(gid);
  const n = norm(word);
  l[cat] = l[cat] || [];
  if (!l[cat].includes(n) && !BASE[cat].has(n)) {
    l[cat].push(n);
    l[cat] = l[cat].slice(-2000);
    store.save('rebelkaLearned');
  }
}

/** How many dictionary words start with each letter, per category (used to show coverage). */
function coverage() {
  const out = {};
  for (const L of LETTERS) out[L] = Object.fromEntries(CATS.map((c) => [c.key, [...BASE[c.key]].filter((w) => w[0] === letterNorm(L)).length]));
  return out;
}

// ---------- the letter card ----------
async function letterCard(letter, round, total) {
  const lib = art.canvas();
  if (!lib) return null;
  const W = 1000;
  const H = 420;
  const c = lib.createCanvas(W, H);
  const ctx = c.getContext('2d');
  const acc = '#4fd1c5';
  art.backdrop(ctx, W, H, acc, { glowX: 230, glowY: H / 2, waves: false });
  // letter disc (left)
  const cx = 230;
  const cy = H / 2;
  ctx.save();
  ctx.shadowColor = art.hexA(acc, 0.9);
  ctx.shadowBlur = 50;
  ctx.beginPath();
  ctx.arc(cx, cy, 140, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(cx, cy - 140, cx, cy + 140);
  g.addColorStop(0, '#5ee6d6');
  g.addColorStop(1, '#16998b');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.font = art.font('Black', 190);
  ctx.fillText(letter, cx, cy + 18);
  // text (right)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = art.hexA(acc, 1);
  ctx.font = art.font('Bold', 26);
  ctx.fillText(`الجولة ${round} من ${total}`, W - 60, 92);
  ctx.fillStyle = '#ffffff';
  ctx.font = art.font('Black', 64);
  ctx.fillText(`حرف ${letter}`, W - 60, 168);
  // category chips
  let x = W - 60;
  const y = 214;
  ctx.font = art.font('Bold', 28);
  for (const cat of CATS) {
    const w = ctx.measureText(cat.label).width + 44;
    art.rr(ctx, x - w, y, w, 56, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = art.hexA(acc, 0.5);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#f1fffd';
    ctx.textBaseline = 'middle';
    ctx.fillText(cat.label, x - 22, y + 30);
    ctx.textBaseline = 'alphabetic';
    x -= w + 12;
  }
  ctx.fillStyle = 'rgba(225,245,242,0.7)';
  ctx.font = art.font('Medium', 24);
  ctx.fillText('اضغط «جاوب» وعبّي الخمسة. أول واحد بيخلّص بيوقف الجولة!', W - 60, 340);
  return new AttachmentBuilder(c.toBuffer('image/png'), { name: `letter-${round}.png` });
}

// ---------- scoring ----------
function score(game, letter, answers) {
  // answers: Map(uid → {name, animal, ...})
  const L = letterNorm(letter);
  const res = new Map(); // uid → { cat → { word, status: 'ok'|'dup'|'bad'|'empty'|'unknown', pts } }
  const counts = {};
  for (const cat of CATS) counts[cat.key] = new Map();
  for (const [uid, a] of answers) {
    const r = {};
    for (const cat of CATS) {
      const word = (a?.[cat.key] || '').trim();
      if (!word) r[cat.key] = { word, status: 'empty', pts: 0 };
      else if (firstLetter(word) !== L) r[cat.key] = { word, status: 'bad', pts: 0, why: 'الحرف غلط' };
      else if (known(game.guild.id, cat.key, word)) r[cat.key] = { word, status: 'ok', pts: 10 };
      else r[cat.key] = { word, status: 'unknown', pts: 0 };
      if (r[cat.key].status === 'ok' || r[cat.key].status === 'unknown') {
        const n = norm(word);
        counts[cat.key].set(n, (counts[cat.key].get(n) || 0) + 1);
      }
    }
    res.set(uid, r);
  }
  return { res, counts };
}
function finalize(res, counts) {
  for (const r of res.values()) {
    for (const cat of CATS) {
      const x = r[cat.key];
      if (x.status !== 'ok') continue;
      if ((counts[cat.key].get(norm(x.word)) || 0) > 1) {
        x.status = 'dup';
        x.pts = 5;
      }
    }
  }
}

const MARK = { ok: '✅', dup: '🔁', bad: '❌', empty: '▫️', unknown: '❌' };

module.exports = {
  id: 'rebelka',
  name: 'ريبلكا',
  emoji: '🔤',
  min: 2,
  max: 20,
  desc: 'إنسان، حيوان، نبات، جماد، بلاد — كله بنفس الحرف',
  howto: 'كل جولة حرف. اضغط «جاوب» وعبّي الخمسة. صح ولحالك = 10، صح ومكرر = 5. أول واحد بيخلّص بيعطي الباقين 10 ثواني بس.',
  norm,
  known,
  learn,
  coverage,
  LETTERS,
  CATS,
  BASE,
  async run(game) {
    const rounds = Math.min(10, Math.max(3, Number(game.extra.rounds) || 5));
    const total = new Map([...game.players.keys()].map((id) => [id, 0]));
    const used = new Set();
    for (let round = 1; round <= rounds; round++) {
      game.check();
      let letter;
      do letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      while (used.has(letter) && used.size < LETTERS.length);
      used.add(letter);
      const answers = new Map();
      const token = `rb${round}`;
      let deadline = Date.now() + ROUND_MS;
      let stopper = null;
      let wake = null;
      const card = await letterCard(letter, round, rounds).catch(() => null);
      const row = () =>
        new ActionRowBuilder().addComponents(
          game.button(token, 'open', 'جاوب', { emoji: 'rename', style: ButtonStyle.Success }),
          game.button(token, 'mine', 'إجاباتي', { emoji: 'list' })
        );
      const msg = await game.send({
        content: [`**حرف «${letter}»** · الجولة ${round}/${rounds}`, `-# بتخلص <t:${Math.ceil(deadline / 1000)}:R>`].join('\n'),
        files: card ? [card] : [],
        components: [row()],
      });
      game.on(token, async (i, choice) => {
        if (!game.players.has(i.user.id)) return i.reply({ content: 'إنت مش مشارك بهاللعبة.', ephemeral: true });
        if (Date.now() > deadline) return i.reply({ content: 'خلص وقت الجولة.', ephemeral: true });
        if (choice === 'mine') {
          const a = answers.get(i.user.id);
          return i.reply({ content: a ? CATS.map((c) => `**${c.label}:** ${a[c.key] || '—'}`).join('\n') : 'لسا ما جاوبت.', ephemeral: true });
        }
        if (choice === 'open') {
          const prev = answers.get(i.user.id) || {};
          const modal = new ModalBuilder().setCustomId(game.cid(token, 'submit')).setTitle(`حرف «${letter}»`);
          for (const c of CATS) {
            const input = new TextInputBuilder().setCustomId(c.key).setLabel(c.full).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40).setPlaceholder(`كلمة بتبلش بحرف ${letter}`);
            if (prev[c.key]) input.setValue(prev[c.key]);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
          }
          return i.showModal(modal);
        }
        if (choice === 'submit') {
          const a = Object.fromEntries(CATS.map((c) => [c.key, (i.fields.getTextInputValue(c.key) || '').trim().slice(0, 40)]));
          answers.set(i.user.id, a);
          const full = CATS.every((c) => a[c.key]);
          await i.reply({ content: `${art.i('check', '✅')} انحفظت إجاباتك${full ? '' : ` (ناقصك ${CATS.filter((c) => !a[c.key]).map((c) => c.label).join('، ')})`}. بتقدر تعدّل لحد ما تخلص الجولة.`, ephemeral: true });
          if (full && !stopper) {
            stopper = i.user.id;
            const left = Math.min(deadline - Date.now(), STOP_MS);
            deadline = Date.now() + left;
            await game.send({ content: `${art.i('bell', '🛑')} **ستوب!** <@${stopper}> خلّص الخمسة — ضايل **${Math.round(left / 1000 / SCALE)} ثواني**` }).catch(() => {});
            wake?.();
          }
          if (answers.size === game.players.size && [...answers.values()].every((x) => CATS.every((c) => x[c.key]))) {
            deadline = Date.now();
            wake?.();
          }
        }
      });
      // wait until the deadline (it can move earlier when someone stops the round)
      while (Date.now() < deadline) {
        await Promise.race([game.sleep(Math.min(1000, Math.max(50, deadline - Date.now())) / SCALE), new Promise((r) => (wake = r))]);
        game.check();
      }
      game.off(token);
      await msg.edit({ components: [] }).catch(() => {});

      // ---- scoring + vote on unknown words ----
      const { res, counts } = score(game, letter, answers);
      const unknowns = [];
      for (const [uid, r] of res) for (const c of CATS) if (r[c.key].status === 'unknown') unknowns.push({ uid, cat: c.key, word: r[c.key].word });
      // same word by several players → one vote
      const uniq = [];
      for (const u of unknowns) if (!uniq.some((x) => x.cat === u.cat && norm(x.word) === norm(u.word))) uniq.push({ ...u, voters: new Set(), authors: new Set(unknowns.filter((y) => y.cat === u.cat && norm(y.word) === norm(u.word)).map((y) => y.uid)) });
      if (uniq.length) {
        const vt = `vote${round}`;
        const list = uniq.slice(0, 20);
        const need = (u) => Math.max(1, Math.ceil((game.players.size - u.authors.size) / 2));
        const rows = () => {
          const out = [];
          for (let k = 0; k < list.length; k += 5) {
            out.push(
              new ActionRowBuilder().addComponents(
                list.slice(k, k + 5).map((u, j) => {
                  const ok = u.voters.size >= need(u);
                  return game.button(vt, String(k + j), `${CATS.find((c) => c.key === u.cat).label}: ${u.word} · ${u.voters.size}/${need(u)}`.slice(0, 80), { style: ok ? ButtonStyle.Success : ButtonStyle.Secondary });
                })
              )
            );
          }
          return out;
        };
        const vmsg = await game.send({
          content: [`**كلمات مش بالقاموس** — صوّتوا على الصحيحة`, `-# صوت اللاعبين الثانيين بيكفي (مش صاحب الكلمة). الكلمة اللي بتنقبل بتنحفظ للسيرفر · ${Math.round(VOTE_MS / 1000)} ثانية`].join('\n'),
          components: rows(),
        });
        let editT = null;
        game.on(vt, async (i, choice) => {
          const u = list[Number(choice)];
          if (!u || !game.players.has(i.user.id)) return i.reply({ content: 'التصويت للاعبين بس.', ephemeral: true });
          if (u.authors.has(i.user.id)) return i.reply({ content: 'ما بتقدر تصوّت لكلمتك 😄', ephemeral: true });
          u.voters.has(i.user.id) ? u.voters.delete(i.user.id) : u.voters.add(i.user.id);
          await i.deferUpdate().catch(() => {});
          clearTimeout(editT);
          editT = setTimeout(() => vmsg.edit({ components: rows() }).catch(() => {}), 500);
        });
        await game.sleep(VOTE_MS);
        game.off(vt);
        clearTimeout(editT);
        await vmsg.edit({ components: [] }).catch(() => {});
        for (const u of list) {
          if (u.voters.size < need(u)) continue;
          learn(game.guild.id, u.cat, u.word);
          for (const [, r] of res) {
            const x = r[u.cat];
            if (x.status === 'unknown' && norm(x.word) === norm(u.word)) {
              x.status = 'ok';
              x.pts = 10;
            }
          }
        }
      }
      finalize(res, counts);

      // ---- round results ----
      const lines = [];
      const roundPts = [];
      for (const [uid, r] of res) {
        const pts = CATS.reduce((s, c) => s + r[c.key].pts, 0);
        total.set(uid, (total.get(uid) || 0) + pts);
        roundPts.push([uid, pts]);
        lines.push(`**${game.name(uid)}** · +${pts}\n-# ${CATS.map((c) => `${MARK[r[c.key].status]} ${r[c.key].word || '—'}`).join('  ')}`);
      }
      const missing = [...game.players.keys()].filter((id) => !res.has(id));
      if (missing.length) lines.push(`-# ما جاوبوا: ${missing.map((id) => game.name(id)).join('، ')}`);
      const board = [...total.entries()].sort((a, b) => b[1] - a[1]);
      await game.send({
        embeds: [
          require('./index')
            .embed()
            .setDescription(ui.trim([`### نتائج حرف «${letter}»`, `-# ${CATS.map((c) => c.label).join(' · ')}   |   ✅ 10 · 🔁 5 · ❌ 0`, '', lines.join('\n') || 'ما حدا جاوب 😅', '', `**الترتيب:** ${board.slice(0, 8).map(([id, p], k) => `${['🥇', '🥈', '🥉'][k] || `${k + 1}.`} ${game.name(id)} ${p}`).join('  ')}`].join('\n'), 4000)),
        ],
      });
      if (!answers.size && round >= 2) break; // nobody is playing anymore
      if (round < rounds) await game.sleep(4000);
    }
    const board = [...total.entries()].sort((a, b) => b[1] - a[1]);
    const top = board[0]?.[1] || 0;
    return { winners: top > 0 ? board.filter(([, p]) => p === top).map(([id]) => id) : [], title: 'بطل الريبلكا', text: board.length ? `-# ${board.slice(0, 5).map(([id, p]) => `${game.name(id)} ${p}`).join(' · ')}` : '' };
  },
};
