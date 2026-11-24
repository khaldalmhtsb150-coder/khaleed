// Mafia: night (mafia kill, doctor save, detective check) and day (discussion + vote).
// Roles and night actions go through private (ephemeral) replies to buttons — no DMs needed.
const { ActionRowBuilder, ButtonStyle } = require('discord.js');

const ROLES = {
  mafia: { name: 'مافيا', emoji: '🔪', team: 'mafia', tip: 'كل ليلة إنتو والمافيا بتختاروا ضحية. بالنهار تظاهر إنك بريء.' },
  doctor: { name: 'دكتور', emoji: '💉', team: 'town', tip: 'كل ليلة بتختار شخص تحميه (بتقدر تحمي حالك).' },
  detective: { name: 'محقق', emoji: '🔍', team: 'town', tip: 'كل ليلة بتكشف هوية شخص واحد.' },
  citizen: { name: 'مواطن', emoji: '👤', team: 'town', tip: 'ركّز بالنقاش وصوّت صح عشان تطلعوا المافيا.' },
};

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

function deal(ids) {
  const n = ids.length;
  const mafia = Math.max(1, Math.floor(n / 4));
  const list = shuffle(ids);
  const roles = new Map();
  list.forEach((id, i) => roles.set(id, i < mafia ? 'mafia' : i === mafia ? 'doctor' : i === mafia + 1 && n >= 7 ? 'detective' : 'citizen'));
  return roles;
}

module.exports = {
  id: 'mafia',
  name: 'مافيا',
  emoji: '🕵️',
  min: 5,
  max: 20,
  desc: 'المافيا بتقتل بالليل، والمدينة بتصوّت بالنهار. اكشفوهم قبل ما يخلصوا عليكم!',
  howto: 'اكبس «شوف دورك» بعد البداية',
  async run(game) {
    const E = (t) => require('./index').embed().setDescription(t);
    const roles = deal(game.aliveList());
    game.extra.roles = roles;
    const team = (id) => ROLES[roles.get(id)].team;
    const mafiaIds = () => game.aliveList().filter((id) => roles.get(id) === 'mafia');
    const townIds = () => game.aliveList().filter((id) => team(id) === 'town');
    const hasRole = (r) => game.aliveList().some((id) => roles.get(id) === r);
    const counts = { mafia: [...roles.values()].filter((r) => r === 'mafia').length };

    // role reveal (any time during the game)
    game.on('role', async (i) => {
      const r = roles.get(i.user.id);
      if (!r) return i.reply({ content: '• إنت مش باللعبة.', ephemeral: true });
      const role = ROLES[r];
      const mates = r === 'mafia' ? [...roles].filter(([id, x]) => x === 'mafia' && id !== i.user.id).map(([id]) => `<@${id}>`) : [];
      return i.reply({ content: `${role.emoji} دورك: **${role.name}**\n${role.tip}${mates.length ? `\nزملاءك بالمافيا: ${mates.join(' ')}` : ''}`, ephemeral: true });
    });
    const roleRow = () => new ActionRowBuilder().addComponents(game.button('role', 'x', 'شوف دورك', { style: ButtonStyle.Primary }));
    await game.send({
      embeds: [E([`## 🕵️ وزّعنا الأدوار!`, `بالمدينة **${counts.mafia}** مافيا، ودكتور${game.players.size >= 7 ? '، ومحقق' : ''}، والباقي مواطنين.`, '', 'اكبس **شوف دورك** (بيطلعلك إنت بس). الليلة الأولى بتبلش بعد 20 ثانية.'].join('\n'))],
      components: [roleRow()],
    });
    await game.sleep(20_000);

    let day = 0;
    for (;;) {
      day++;
      // ---------- night ----------
      const acts = { kill: new Map(), save: null, check: null };
      const night = `night${day}`;
      game.on(night, async (i, choice) => {
        const r = roles.get(i.user.id);
        if (!game.alive.has(i.user.id)) return i.reply({ content: '• إنت طالع من اللعبة 👻', ephemeral: true });
        const need = { kill: 'mafia', save: 'doctor', check: 'detective' }[choice];
        if (choice.startsWith('sel')) return;
        if (r !== need) return i.reply({ content: '• هاد مش دورك 🤫 (ولا تحكي لحدا شو دورك)', ephemeral: true });
        const targets = choice === 'kill' ? game.aliveList().filter((id) => roles.get(id) !== 'mafia') : game.aliveList().filter((id) => choice === 'save' || id !== i.user.id);
        const opts = targets.map((id) => ({ label: game.name(id), value: `${choice}|${id}` }));
        return i.reply({ content: { kill: '🔪 مين ضحيتكم الليلة؟', save: '💉 مين بدك تحمي؟', check: '🔍 مين بدك تكشف؟' }[choice], components: [new ActionRowBuilder().addComponents(game.select(`${night}pick`, opts, { placeholder: 'اختار' }))], ephemeral: true });
      });
      game.on(`${night}pick`, async (i) => {
        const [what, target] = (i.values[0] || '').split('|');
        const r = roles.get(i.user.id);
        if (!game.alive.has(i.user.id)) return i.update({ content: '• إنت طالع من اللعبة.', components: [] });
        if (what === 'kill' && r === 'mafia') {
          acts.kill.set(i.user.id, target);
          return i.update({ content: `🔪 اخترتوا <@${target}>. (آخر اختيار من المافيا هو اللي بيمشي)`, components: [] });
        }
        if (what === 'save' && r === 'doctor') {
          acts.save = target;
          return i.update({ content: `💉 رح تحمي <@${target}> الليلة.`, components: [] });
        }
        if (what === 'check' && r === 'detective') {
          acts.check = target;
          const isMafia = roles.get(target) === 'mafia';
          return i.update({ content: `🔍 <@${target}> ${isMafia ? 'هو **مافيا** 🔪' : 'مش مافيا ✅'}`, components: [] });
        }
        return i.update({ content: '• ما بتقدر.', components: [] });
      });
      const nightRow = new ActionRowBuilder().addComponents(
        game.button(night, 'kill', 'المافيا', { style: ButtonStyle.Danger }),
        game.button(night, 'save', 'الدكتور', { style: ButtonStyle.Success, disabled: !hasRole('doctor') }),
        game.button(night, 'check', 'المحقق', { style: ButtonStyle.Primary, disabled: !hasRole('detective') }),
        game.button('role', 'x', 'شوف دورك')
      );
      const nm = await game.send({ embeds: [E(`## 🌙 الليلة ${day}\nالمدينة نايمة… كل واحد عنده دور يكبس زرّه بسرية.\n⏳ الليل بيخلص <t:${Math.ceil((Date.now() + 35_000) / 1000)}:R>`)], components: [nightRow] });
      await game.sleep(35_000);
      game.off(night);
      game.off(`${night}pick`);
      await nm.edit({ components: [] }).catch(() => {});

      // resolve night
      const picks = [...acts.kill.values()];
      const victim = picks.length ? picks[picks.length - 1] : null;
      const lines = [`## ☀️ صباح اليوم ${day}`];
      if (victim && victim === acts.save) lines.push(`المافيا حاولت تقتل حدا… بس **الدكتور أنقذه** 💉`);
      else if (victim && game.alive.has(victim)) {
        game.alive.delete(victim);
        lines.push(`💀 لقينا <@${victim}> مقتول. كان **${ROLES[roles.get(victim)].name}** ${ROLES[roles.get(victim)].emoji}`);
      } else lines.push('الليلة مرّت بسلام، ما حدا مات 😮‍💨');
      await game.send({ embeds: [E(lines.join('\n'))] });
      if (!mafiaIds().length) return { winners: [...roles].filter(([, r]) => ROLES[r].team === 'town').map(([id]) => id), title: 'المدينة فازت!', text: 'تخلصتوا من كل المافيا 🎉' };
      if (mafiaIds().length >= townIds().length) return { winners: [...roles].filter(([, r]) => r === 'mafia').map(([id]) => id), title: 'المافيا فازت!', text: 'المافيا سيطرت على المدينة 🔪' };

      // ---------- day: discussion + vote ----------
      await game.send({ embeds: [E(`## 🗣️ وقت النقاش (45 ثانية)\nمين شاكين فيه؟ احكوا بالشات.\nالأحياء: ${game.aliveList().map((id) => `<@${id}>`).join(' ')}`)] });
      await game.sleep(45_000);
      const votes = new Map();
      const vote = `vote${day}`;
      const voteRows = game.pickerRows(vote, game.aliveList(), { placeholder: 'صوّت مين يطلع' });
      voteRows.push(new ActionRowBuilder().addComponents(game.button(vote, 'skip', 'ما بدي أصوّت')));
      game.on(vote, async (i, choice) => {
        if (!game.alive.has(i.user.id)) return i.reply({ content: '• بس الأحياء بيصوّتوا.', ephemeral: true });
        if (choice === 'skip') votes.set(i.user.id, null);
        else votes.set(i.user.id, i.values[0]);
        return i.reply({ content: choice === 'skip' ? '• امتنعت عن التصويت.' : `🗳️ صوّتت على <@${i.values[0]}> (بتقدر تغيّر)`, ephemeral: true });
      });
      const vm = await game.send({ embeds: [E(`## 🗳️ التصويت (30 ثانية)\nكل واحد حي يختار مين يطلع. التعادل = ما حدا بيطلع.`)], components: voteRows });
      await game.sleep(30_000);
      game.off(vote);
      await vm.edit({ components: [] }).catch(() => {});
      const tally = new Map();
      for (const v of votes.values()) if (v && game.alive.has(v)) tally.set(v, (tally.get(v) || 0) + 1);
      const sorted = [...tally].sort((a, b) => b[1] - a[1]);
      if (!sorted.length || (sorted[1] && sorted[1][1] === sorted[0][1])) {
        await game.send({ embeds: [E(`⚖️ ${sorted.length ? 'تعادل بالأصوات' : 'ما حدا صوّت'}، فما حدا طلع اليوم.`)] });
      } else {
        const [out, n] = sorted[0];
        game.alive.delete(out);
        await game.send({ embeds: [E(`🔨 المدينة طلّعت <@${out}> بـ **${n}** صوت. كان **${ROLES[roles.get(out)].name}** ${ROLES[roles.get(out)].emoji}`)] });
      }
      if (!mafiaIds().length) return { winners: [...roles].filter(([, r]) => ROLES[r].team === 'town').map(([id]) => id), title: 'المدينة فازت!', text: 'تخلصتوا من كل المافيا 🎉' };
      if (mafiaIds().length >= townIds().length) return { winners: [...roles].filter(([, r]) => r === 'mafia').map(([id]) => id), title: 'المافيا فازت!', text: 'المافيا سيطرت على المدينة 🔪' };
      await game.sleep(4000);
    }
  },
  _deal: deal,
};
