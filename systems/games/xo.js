// XO knockout tournament: pairs play 3×3 boards with buttons; winners advance until one champion.
const { ActionRowBuilder, ButtonStyle } = require('discord.js');

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winnerOf = (b) => {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
};
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

async function match(game, p1, p2, tag) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const board = Array(9).fill(null);
    const sym = { [p1]: 'X', [p2]: 'O' };
    let turn = Math.random() < 0.5 ? p1 : p2;
    const token = `${tag}a${attempt}`;
    const view = (note) => ({
      content: `${note}\n❌ <@${p1}>  ضد  ⭕ <@${p2}>`,
      allowedMentions: { users: [turn] },
      components: [0, 1, 2].map((r) =>
        new ActionRowBuilder().addComponents(
          [0, 1, 2].map((c) => {
            const k = r * 3 + c;
            return game.button(token, String(k), board[k] === 'X' ? '❌' : board[k] === 'O' ? '⭕' : '·', { style: board[k] === 'X' ? ButtonStyle.Danger : board[k] === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary, disabled: Boolean(board[k]) });
          })
        )
      ),
    });
    const msg = await game.send(view(`🎮 دور <@${turn}> (${sym[turn] === 'X' ? '❌' : '⭕'})`));
    for (;;) {
      const res = await game.waitFor(token, { who: turn, timeout: 25_000, deny: 'مش دورك.' });
      if (!res) {
        await msg.edit({ content: `⏰ <@${turn}> تأخر وخسر.`, components: [] }).catch(() => {});
        return turn === p1 ? p2 : p1;
      }
      const k = Number(res.choice);
      if (board[k]) {
        await res.interaction.deferUpdate().catch(() => {});
        continue;
      }
      board[k] = sym[turn];
      const w = winnerOf(board);
      if (w === 'draw') {
        await res.interaction.update({ ...view('🤝 تعادل! بنعيدها…'), components: [] }).catch(() => {});
        break;
      }
      if (w) {
        await res.interaction.update({ ...view(`🏆 <@${turn}> فاز بالمباراة!`), components: [] }).catch(() => {});
        return turn;
      }
      turn = turn === p1 ? p2 : p1;
      await res.interaction.update(view(`🎮 دور <@${turn}> (${sym[turn] === 'X' ? '❌' : '⭕'})`)).catch(() => {});
    }
  }
  return Math.random() < 0.5 ? p1 : p2; // two draws in a row: coin toss
}

module.exports = {
  id: 'xo',
  name: 'بطولة XO',
  emoji: '❌',
  min: 2,
  max: 16,
  desc: 'بطولة إكس أو بخروج المغلوب. كل مباراة بتفوز فيها بتقرّبك من الكأس!',
  howto: 'لما يجي دورك اكبس على المربع',
  async run(game) {
    const E = (t) => require('./index').embed().setDescription(t);
    let round = 0;
    let players = shuffle(game.aliveList());
    while (players.length > 1) {
      round++;
      const next = [];
      if (players.length % 2) next.push(players.pop()); // bye
      await game.send({ embeds: [E(`## ❌ الدور ${round}\n${players.length / 2} مباريات${next.length ? `\n🎟️ <@${next[0]}> متأهل مباشرة` : ''}`)] });
      for (let i = 0; i < players.length; i += 2) {
        const w = await match(game, players[i], players[i + 1], `r${round}m${i}`);
        const l = w === players[i] ? players[i + 1] : players[i];
        game.alive.delete(l);
        next.push(w);
        await game.sleep(1500);
      }
      players = shuffle(next);
    }
    return { winners: players, title: 'بطل XO' };
  },
  _winnerOf: winnerOf,
};
