// Rock-paper-scissors knockout: everyone picks secretly; the losing sign drops out each round.
const { ActionRowBuilder, ButtonStyle } = require('discord.js');

const SIGNS = { r: '🪨 حجرة', p: '📄 ورقة', s: '✂️ مقص' };
const BEATS = { r: 's', p: 'r', s: 'p' };

/** Given choices Map(uid → sign), returns the uids that lose this round ([] = replay). */
function losers(choices) {
  const kinds = new Set(choices.values());
  if (kinds.size !== 2) return [];
  const [a, b] = [...kinds];
  const lose = BEATS[a] === b ? b : a;
  return [...choices].filter(([, k]) => k === lose).map(([u]) => u);
}

module.exports = {
  id: 'rps',
  name: 'حجرة ورقة مقص',
  emoji: '✂️',
  min: 2,
  max: 25,
  desc: 'كل جولة الكل بيختار بالسر، والإشارة الخسرانة بتطلع. آخر واحد بيفوز!',
  howto: 'اكبس إشارتك قبل ما يخلص الوقت',
  async run(game) {
    const E = (t) => require('./index').embed().setDescription(t);
    let round = 0;
    let replays = 0;
    while (game.alive.size > 1) {
      round++;
      const choices = new Map();
      const token = `rps${round}`;
      game.on(token, async (i, choice) => {
        if (!game.alive.has(i.user.id)) return i.reply({ content: '• إنت مش باللعبة.', ephemeral: true });
        choices.set(i.user.id, choice);
        return i.reply({ content: `اخترت ${SIGNS[choice]} 🤫`, ephemeral: true });
      });
      const m = await game.send({
        embeds: [E(`## ✂️ الجولة ${round} • باقي ${game.alive.size}\nاختاروا خلال **12 ثانية**! اللي ما بيختار بيطلع.`)],
        components: [new ActionRowBuilder().addComponents(...Object.entries(SIGNS).map(([k, l]) => game.button(token, k, l.split(' ')[1], { emoji: { r: 'rock', p: 'paper', s: 'scissors' }[k], style: ButtonStyle.Secondary })))],
      });
      await game.sleep(12_000);
      game.off(token);
      await m.edit({ components: [] }).catch(() => {});
      const idle = game.aliveList().filter((u) => !choices.has(u));
      let out = losers(choices);
      if (!out.length && choices.size > 1 && ++replays >= 3) {
        out = [...choices.keys()].sort(() => Math.random() - 0.5).slice(0, Math.max(1, Math.floor(choices.size / 2)));
        replays = 0;
      } else if (out.length) replays = 0;
      if (idle.length === game.alive.size) {
        game.alive.clear();
        return { winners: [], title: 'ما حدا لعب 😅' };
      }
      const summary = Object.keys(SIGNS)
        .map((k) => [k, [...choices].filter(([, c]) => c === k).map(([u]) => `<@${u}>`)])
        .filter(([, l]) => l.length)
        .map(([k, l]) => `${SIGNS[k]}: ${l.join(' ')}`)
        .join('\n');
      for (const u of [...idle, ...out]) game.alive.delete(u);
      if (game.alive.size === 0) {
        // everyone lost at once: the round's choosers survive instead
        for (const u of choices.keys()) game.alive.add(u);
      }
      await game.sleep(500);
      await game.send({ embeds: [E(`${summary || 'ما حدا اختار'}\n${out.length ? `❌ طلعوا: ${out.map((u) => `<@${u}>`).join(' ')}` : '🔁 ما حدا طلع، بنعيد!'}${idle.length ? `\n💤 ما اختاروا: ${idle.map((u) => `<@${u}>`).join(' ')}` : ''}`)] });
      await game.sleep(2000);
    }
    return { winners: game.aliveList(), title: 'بطل حجرة ورقة مقص' };
  },
  _losers: losers,
};
