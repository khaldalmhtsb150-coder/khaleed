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
  if (!canvas) return null;
  const c = canvas.createCanvas(900, 170);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 900, 170);
  g.addColorStop(0, '#1d1640');
  g.addColorStop(1, '#141a2e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 900, 170);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 40px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 450, 88, 860);
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
      await game.send({ embeds: [E(`## ${META[id].emoji} ${META[id].name}\n${META[id].desc}\n**${ROUNDS} أسئلة**، كل سؤال إله 20 ثانية. جاوبوا بالشات!`)] });
      await game.sleep(3000);
      for (let r = 1; r <= ROUNDS; r++) {
        const q = Q[id]();
        const payload = { content: `**سؤال ${r}/${ROUNDS}** • ${q.prompt}` };
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
          await game.send(`✅ <@${uid}> جاوب صح بـ **${((Date.now() - t0) / 1000).toFixed(1)}** ثانية! الجواب: **${q.answers[0]}**`);
        } else await game.send(`⏰ خلص الوقت! الجواب كان: **${q.answers[0]}**`);
        await game.sleep(2500);
      }
      const board = [...score].sort((a, b) => b[1] - a[1]);
      if (!board.length) return { winners: [], title: 'ما حدا جاوب 😅' };
      const best = board[0][1];
      return {
        winners: board.filter(([, s]) => s === best).map(([u]) => u),
        title: META[id].name,
        text: board.slice(0, 5).map(([u, s], i) => `${['🥇', '🥈', '🥉', '4.', '5.'][i]} <@${u}> — ${s}`).join('\n'),
      };
    },
  };
}

module.exports = Object.keys(META).map(makeType);
module.exports._norm = norm;
module.exports._matches = matches;
