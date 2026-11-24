// صندوق الموت: the bot picks a player, who opens one of five boxes. Two are traps. Last one alive wins.
const { ActionRowBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  id: 'deathbox',
  name: 'صندوق الموت',
  emoji: '📦',
  min: 2,
  max: 20,
  desc: 'البوت بيختارك، وإنت بتفتح صندوق من خمسة. اتنين منهم فخ 💣',
  howto: 'لما يجي دورك افتح صندوق',
  async run(game) {
    const E = (t) => require('./index').embed().setDescription(t);
    let round = 0;
    while (game.alive.size > 1) {
      round++;
      const ids = game.aliveList();
      const p = ids[Math.floor(Math.random() * ids.length)];
      const traps = new Set();
      while (traps.size < 2) traps.add(Math.floor(Math.random() * 5));
      const token = `box${round}`;
      const msg = await game.send({
        content: `<@${p}>`,
        allowedMentions: { users: [p] },
        embeds: [E(`## 📦 الجولة ${round} • باقي ${ids.length}\nالدور على <@${p}>! افتح صندوق خلال **15 ثانية**.`)],
        components: [new ActionRowBuilder().addComponents([0, 1, 2, 3, 4].map((k) => game.button(token, String(k), `${k + 1}`, { emoji: 'box', style: ButtonStyle.Secondary })))],
      });
      const res = await game.waitFor(token, { who: p, timeout: 15_000, deny: 'مش دورك.' });
      const open = res ? Number(res.choice) : Math.floor(Math.random() * 5);
      const boom = traps.has(open);
      const reveal = [0, 1, 2, 3, 4].map((k) => (traps.has(k) ? '💣' : '🎁')).join(' ');
      if (res) await res.interaction.deferUpdate().catch(() => {});
      await msg.edit({ components: [] }).catch(() => {});
      if (boom) game.alive.delete(p);
      await game.send({ embeds: [E(`${res ? '' : '⏰ ما فتح، فاخترنا عنه…\n'}فتح الصندوق رقم **${open + 1}**: ${boom ? `💣 **فخ!** <@${p}> طلع.` : `🎁 **آمن!** <@${p}> نجا.`}\n${reveal}`)] });
      await game.sleep(2500);
    }
    return { winners: game.aliveList(), title: 'الناجي الأخير' };
  },
};
