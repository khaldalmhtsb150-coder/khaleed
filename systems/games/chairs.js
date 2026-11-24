// Chairs: each round there's one chair fewer than players (some are traps). Grab one fast!
const { ActionRowBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  id: 'chairs',
  name: 'كراسي',
  emoji: '🪑',
  min: 3,
  max: 25,
  desc: 'كل جولة الكراسي أقل من اللاعبين بواحد، وفي كراسي فخ. اللي ما بيقعد بيطلع!',
  howto: 'لما تطلع الكراسي اكبس على وحدة بسرعة',
  async run(game) {
    const E = (t) => require('./index').embed().setDescription(t);
    let round = 0;
    while (game.alive.size > 1) {
      round++;
      const players = game.aliveList();
      const seats = players.length - 1;
      const traps = players.length > 4 ? 1 : 0;
      const total = seats + traps;
      const trapSet = new Set();
      while (trapSet.size < traps) trapSet.add(Math.floor(Math.random() * total));
      const taken = new Map(); // seat → userId
      const sat = new Set();
      const out = [];
      await game.send({ embeds: [E(`## 🪑 الجولة ${round}\nباقي **${players.length}** لاعب و**${seats}** كرسي${traps ? ' + كرسي فخ 💣' : ''}\nاستعدوا…`)] });
      await game.sleep(2000 + Math.floor(Math.random() * 3000));
      const render = () => {
        const rows = [];
        for (let i = 0; i < total; i += 5) {
          const row = new ActionRowBuilder();
          for (let j = i; j < Math.min(i + 5, total); j++) {
            const who = taken.get(j);
            row.addComponents(game.button(`seat${round}`, String(j), who ? game.name(who).slice(0, 20) : `${j + 1}`, { emoji: who ? undefined : 'chair', style: who ? ButtonStyle.Success : ButtonStyle.Secondary, disabled: Boolean(who) }));
          }
          rows.push(row);
        }
        return rows;
      };
      const msg = await game.send({ content: '## يلااا اقعدوا! 🏃', components: render() });
      let finish;
      const done = new Promise((r) => (finish = r));
      game.on(`seat${round}`, async (i, choice) => {
        const uid = i.user.id;
        const seat = Number(choice);
        if (!game.alive.has(uid)) return i.reply({ content: '• إنت مش باللعبة.', ephemeral: true });
        if (sat.has(uid)) return i.reply({ content: '• إنت قاعد أصلاً 😄', ephemeral: true });
        if (taken.has(seat)) return i.reply({ content: '• سبقك حدا على هالكرسي!', ephemeral: true });
        sat.add(uid);
        if (trapSet.has(seat)) {
          out.push(uid);
          await i.reply({ content: '💣 هاد كرسي فخ! طلعت من اللعبة.', ephemeral: true });
        } else {
          taken.set(seat, uid);
          await i.update({ components: render() }).catch(() => {});
        }
        if (taken.size >= seats || sat.size >= players.length) finish();
      });
      await Promise.race([done, game.sleep(10_000)]);
      game.off(`seat${round}`);
      await msg.edit({ components: [] }).catch(() => {});
      const standing = players.filter((p) => ![...taken.values()].includes(p));
      for (const p of standing) game.alive.delete(p);
      const lines = [];
      if (out.length) lines.push(`💣 قعدوا على الفخ: ${out.map((p) => `<@${p}>`).join(' ')}`);
      const slow = standing.filter((p) => !out.includes(p));
      if (slow.length) lines.push(`🧍 ضلّوا واقفين: ${slow.map((p) => `<@${p}>`).join(' ')}`);
      if (!lines.length) lines.push('ما حدا طلع هالجولة!');
      await game.send({ embeds: [E(`${lines.join('\n')}\n✅ باقي **${game.alive.size}**`)] });
      if (game.alive.size === 0) return { winners: [], title: 'ما ضل حدا! 😅' };
      await game.sleep(2500);
    }
    return { winners: game.aliveList(), title: 'ملك الكراسي' };
  },
};
