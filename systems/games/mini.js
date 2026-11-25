// Quick games: no lobby. Five questions; the first correct answer in chat takes each round.
// Most rounds wins. Typing race sentences are drawn as an image so they can't be copy-pasted.
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { FLAGS, CAPITALS, WORDS, SENTENCES } = require('./words');

let canvas = null;
for (const name of ['canvas', '@napi-rs/canvas']) {
  try {
    canvas = require(name);
    break;
  } catch {}
}
const FONT = 'MarkaGames';
if (canvas) {
  try {
    const f = path.join(__dirname, '..', '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');
    if (canvas.registerFont) canvas.registerFont(f, { family: FONT, weight: 'bold' });
    else if (canvas.GlobalFonts) canvas.GlobalFonts.registerFromPath(f, FONT);
  } catch {}
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
const noAl = (s) => s.replace(/^ال/, '');
const matches = (answer, accepted) => {
  const a = norm(answer);
  return accepted.some((x) => {
    const b = norm(x);
    return a === b || noAl(a) === noAl(b);
  });
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const scramble = (w) => {
  const chars = [...w];
  for (let k = 0; k < 10; k++) {
    const s = chars.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]).join('');
    if (s !== w) return s;
  }
  return chars.reverse().join('');
};

function textImage(text) {
  const art = require('../../utils/art');
  const lib = art.canvas();
  if (!lib) return null;
  const W = 1000;
  const H = 220;
  const c = lib.createCanvas(W, H);
  const ctx = c.getContext('2d');
  art.backdrop(ctx, W, H, art.accent('fasttype'), { glowX: W / 2, glowY: H / 2 });
  art.rr(ctx, 30, 30, W - 60, H - 60, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.strokeStyle = art.hexA(art.accent('fasttype'), 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(art.fitText(ctx, text, W - 120, 'ExtraBold', 52), W / 2, H / 2 + 4);
  return c.toBuffer('image/png');
}

/** question factories: return { prompt, answers, image? } */
const Q = {
  fasttype: () => {
    const s = pick(SENTENCES);
    return { prompt: '⌨️ أول واحد بيكتب الجملة صح بيفوز:', answers: [s], image: textImage(s), fallback: s };
  },
  flags: () => {
    const [flag, names] = pick(FLAGS);
    return { prompt: `🏳️ علم أي دولة هاد؟\n# ${flag}`, answers: names };
  },
  capitals: () => {
    const [country, caps] = pick(CAPITALS);
    return { prompt: `🏛️ شو عاصمة **${country}**؟`, answers: caps };
  },
  unscramble: () => {
    const w = pick(WORDS);
    return { prompt: `🔤 رتّب الحروف وطلّع الكلمة:\n# ${[...scramble(w)].join(' ')}`, answers: [w] };
  },
  math: () => {
    const op = pick(['+', '-', '×']);
    const a = 2 + Math.floor(Math.random() * (op === '×' ? 12 : 90));
    const b = 2 + Math.floor(Math.random() * (op === '×' ? 12 : 90));
    const r = op === '+' ? a + b : op === '-' ? a - b : a * b;
    return { prompt: `🧮 احسب بسرعة:\n# ${a} ${op} ${b} = ?`, answers: [String(r), r.toLocaleString('ar-EG')] };
  },
};

const META = {
  fasttype: { name: 'أسرع كاتب', emoji: '⌨️', desc: 'جملة بتطلع بصورة، وأول واحد بيكتبها صح بياخد النقطة.' },
  flags: { name: 'أعلام', emoji: '🏳️', desc: 'خمّن الدولة من علمها.' },
  capitals: { name: 'عواصم', emoji: '🏛️', desc: 'شو عاصمة الدولة؟' },
  unscramble: { name: 'فكك الكلمة', emoji: '🔤', desc: 'الحروف ملخبطة، رتبها وطلّع الكلمة.' },
  math: { name: 'حساب سريع', emoji: '🧮', desc: 'مسألة سريعة، أول جواب صح بيفوز.' },
};

const ROUNDS = 5;

function makeType(id) {
  return {
    id,
    ...META[id],
    min: 1,
    max: 100,
    instant: true,
    howto: 'جاوب بالشات',
    async run(game) {
      const E = (t) => require('./index').embed().setDescription(t);
      const score = new Map();
      const art = require('../../utils/art');
      const b = art.banner(id, game.guild.id);
      await game.send(b ? { content: `-# ${ROUNDS} أسئلة • 20 ثانية لكل سؤال • جاوبوا بالشات`, files: [b] } : { embeds: [E(`## ${META[id].emoji} ${META[id].name}\n${META[id].desc}\n**${ROUNDS} أسئلة**، كل سؤال إله 20 ثانية. جاوبوا بالشات!`)] });
      await game.sleep(3000);
      for (let r = 1; r <= ROUNDS; r++) {
        const q = Q[id]();
        const payload = { content: `${q.prompt}\n-# سؤال ${r} من ${ROUNDS}` };
        if (q.image) payload.files = [new AttachmentBuilder(q.image, { name: 'q.png' })];
        else if (q.fallback) payload.content += `\n> ${q.fallback}`;
        await game.send(payload);
        const t0 = Date.now();
        const winner = await game.waitMessage((m) => matches(m.content, q.answers), 20_000);
        if (winner) {
          const uid = winner.author.id;
          if (!game.players.has(uid)) game.players.set(uid, { id: uid, name: (winner.member?.displayName || winner.author.username).slice(0, 32) });
          score.set(uid, (score.get(uid) || 0) + 1);
          winner.react('✅').catch(() => {});
          await game.send(`${require('../../utils/art').i('check', '✅')} <@${uid}> جاوب صح — **${q.answers[0]}**\n-# بـ ${((Date.now() - t0) / 1000).toFixed(1)} ثانية`);
        } else await game.send(`${require('../../utils/art').i('timer', '⏰')} خلص الوقت — الجواب: **${q.answers[0]}**`);
        await game.sleep(2500);
      }
      const board = [...score].sort((a, b) => b[1] - a[1]);
      if (!board.length) return { winners: [], title: 'ما حدا جاوب 😅' };
      const best = board[0][1];
      return {
        winners: board.filter(([, s]) => s === best).map(([u]) => u),
        title: 'الأسرع جواباً',
        text: board.slice(0, 5).map(([u, s], i) => `${['🥇', '🥈', '🥉', '4.', '5.'][i]} <@${u}> — ${s}`).join('\n'),
      };
    },
  };
}

module.exports = Object.keys(META).map(makeType);
module.exports._norm = norm;
module.exports._matches = matches;
