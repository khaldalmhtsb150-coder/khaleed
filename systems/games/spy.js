// برا السالفة: everyone gets the same secret word except the outsider(s), who only know the category.
// Players question each other, then vote. If the outsider survives — or is caught but guesses the word — they win.
const { ActionRowBuilder, ButtonStyle } = require('discord.js');
const { SPY } = require('./words');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

module.exports = {
  id: 'spy',
  name: 'برا السالفة',
  emoji: '🤫',
  min: 3,
  max: 15,
  desc: 'الكل بيعرف الكلمة إلا واحد! اسألوا بعض واكتشفوا مين برا السالفة.',
  howto: 'اكبس «شوف كلمتك» بعد البداية',
  async run(game) {
    const E = (t) => require('./index').embed().setDescription(t);
    const category = pick(Object.keys(SPY));
    const word = pick(SPY[category]);
    const ids = game.aliveList();
    const spyCount = ids.length >= 9 ? 2 : 1;
    const spies = new Set(shuffle(ids).slice(0, spyCount));
    game.on('word', async (i) => {
      if (!game.players.has(i.user.id)) return i.reply({ content: '• إنت مش باللعبة.', ephemeral: true });
      return i.reply({ content: spies.has(i.user.id) ? `🤫 **إنت برا السالفة!**\nالفئة: **${category}**. حاول تفهم الكلمة من أسئلتهم بدون ما تنكشف.` : `🔑 الكلمة: **${word}**\n(الفئة: ${category}) ولا تفضحها!`, ephemeral: true });
    });
    await game.send({
      embeds: [E(`## 🤫 برا السالفة\nالفئة: **${category}**\nفي **${spyCount}** برا السالفة بيناتكم. اكبسوا **شوف كلمتك**.\n\nبعد شوي رح أبلّش أختار مين يسأل مين. الأسئلة والأجوبة بالشات.`)],
      components: [new ActionRowBuilder().addComponents(game.button('word', 'x', 'شوف كلمتك', { emoji: 'show', style: ButtonStyle.Primary }))],
    });
    await game.sleep(15_000);
    // question rounds: random pairs, every 12s, ~90s total
    const order = shuffle(ids);
    for (let k = 0; k < Math.min(order.length, 7); k++) {
      const a = order[k];
      const b = order[(k + 1) % order.length];
      await game.send({ content: `❓ <@${a}> اسأل <@${b}> سؤال عن الكلمة`, allowedMentions: { users: [a, b] } });
      await game.sleep(12_000);
    }
    // vote
    const votes = new Map();
    game.on('vote', async (i) => {
      if (!game.players.has(i.user.id)) return i.reply({ content: '• إنت مش باللعبة.', ephemeral: true });
      votes.set(i.user.id, i.values[0]);
      return i.reply({ content: `🗳️ صوّتت على <@${i.values[0]}> (بتقدر تغيّر)`, ephemeral: true });
    });
    const vm = await game.send({ embeds: [E('## 🗳️ مين برا السالفة؟\nصوّتوا خلال **25 ثانية**.')], components: game.pickerRows('vote', ids, { placeholder: 'مين برا السالفة؟' }) });
    await game.sleep(25_000);
    game.off('vote');
    await vm.edit({ components: [] }).catch(() => {});
    const tally = new Map();
    for (const v of votes.values()) tally.set(v, (tally.get(v) || 0) + 1);
    const sorted = [...tally].sort((x, y) => y[1] - x[1]);
    const accused = sorted.length && !(sorted[1] && sorted[1][1] === sorted[0][1]) ? sorted[0][0] : null;
    const town = ids.filter((id) => !spies.has(id));
    const reveal = `الكلمة كانت **${word}**، واللي برا السالفة: ${[...spies].map((s) => `<@${s}>`).join(' ')}`;
    if (!accused || !spies.has(accused)) {
      return { winners: [...spies], title: 'برا السالفة فاز!', text: `${accused ? `طلّعتوا <@${accused}> وهو كان معكم بالسالفة 😅` : 'ما اتفقتوا على حدا.'}\n${reveal}` };
    }
    // caught — last chance to guess the word
    const options = shuffle([word, ...shuffle(SPY[category].filter((w) => w !== word)).slice(0, 5)]);
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    options.forEach((w, n) => (n < 3 ? row1 : row2).addComponents(game.button('guess', String(n), w)));
    const gm = await game.send({ content: `<@${accused}>`, allowedMentions: { users: [accused] }, embeds: [E(`🎯 كشفتوا <@${accused}>! بس عنده فرصة أخيرة: إذا عرف الكلمة بيفوز هو.\n⏳ 15 ثانية`)], components: [row1, row2] });
    const res = await game.waitFor('guess', { who: accused, timeout: 15_000, deny: 'بس اللي انكشف بيجاوب.' });
    await gm.edit({ components: [] }).catch(() => {});
    if (res) await res.interaction.deferUpdate().catch(() => {});
    if (res && options[Number(res.choice)] === word) return { winners: [...spies], title: 'برا السالفة عرف الكلمة!', text: reveal };
    return { winners: town, title: 'كشفتوه! 🎉', text: reveal };
  },
};
