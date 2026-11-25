// Roulette (the Arab-Discord classic): the wheel picks a player, who kicks someone out (or withdraws).
// Two left → one last spin crowns the winner. Perks: shield (kick bounces back), extra life, double kick.
const { ActionRowBuilder, AttachmentBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/ui');
const wheelImage = require('../wheelImage');
const premium = require('../../utils/premium');
const art = require('../../utils/art');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function spin(game, ids, title, { scale = 0.8 } = {}) {
  const chosen = pick(ids);
  const seen = new Map();
  const labels = ids.map((id) => {
    const n = game.name(id).slice(0, 16);
    const k = (seen.get(n) || 0) + 1;
    seen.set(n, k);
    return k > 1 ? `${n} ${k}` : n;
  });
  const winLabel = labels[ids.indexOf(chosen)];
  const st = require('../../utils/store');
  const bg = (premium.has(game.guild.id, 'gameArt') && st.peek('gameArt', game.guild.id)?.rouletteWheel) || (premium.has(game.guild.id, 'wheelImage') ? st.peek('wheelConfig', game.guild.id)?.image || '' : '');
  const pic = await wheelImage.render(labels, winLabel, { maxSlices: 30, frames: 32, background: bg, scale: ids.length > 14 ? 1 : scale }).catch(() => null);
  if (pic) {
    const m = await game.send({ content: title, files: [new AttachmentBuilder(pic.gif, { name: 'roulette.gif' })] });
    await game.sleep(pic.duration + 400);
    await m.edit({ content: title, files: [new AttachmentBuilder(pic.png, { name: 'roulette.png' })], attachments: [] }).catch(() => {});
  } else {
    await game.send({ content: `${title}\n-# العجلة بتدور…` });
    await game.sleep(1500);
  }
  return chosen;
}

function eliminate(game, target, by) {
  const gid = game.guild.id;
  const { usePerk, hasPerk } = require('./index');
  // shield: the kick bounces back to whoever tried it
  if (by && by !== target && hasPerk(gid, target, 'shield') && usePerk(gid, target, 'shield')) {
    return { out: eliminate(game, by, null).out, note: `${art.i('shield', '🛡️')} <@${target}> كان معه درع، والطرد رجع على <@${by}>` };
  }
  if (!game.extra.lives?.has(target) && hasPerk(gid, target, 'life') && usePerk(gid, target, 'life')) {
    game.extra.lives.add(target);
    return { out: null, note: `${art.i('life', '❤️')} <@${target}> استخدم حياة إضافية وضل باللعبة` };
  }
  game.alive.delete(target);
  return { out: target, note: null };
}

module.exports = {
  id: 'roulette',
  name: 'روليت',
  emoji: '🎡',
  min: 4,
  max: 30,
  desc: 'العجلة بتختار لاعب، وهو بيقرر مين يطلع. آخر واحد بيضل هو البطل!',
  howto: 'اللي بتوقف عليه العجلة عنده 20 ثانية يطرد حدا',
  async run(game) {
    game.embedBase = (t) => require('./index').embed().setDescription(t);
    game.extra.lives = new Set(); // who already used their extra life
    let round = 0;
    while (game.alive.size > 2) {
      round++;
      const ids = game.aliveList();
      const chosen = await spin(game, ids, `**الجولة ${round}** • باقي ${ids.length} لاعب`);
      const others = ids.filter((id) => id !== chosen);
      const { hasPerk, usePerk } = require('./index');
      const canDouble = hasPerk(game.guild.id, chosen, 'double') && others.length >= 3;
      const rows = game.pickerRows(`kick${round}`, others, { placeholder: canDouble ? 'اختار واحد (أو اتنين بالطرد المزدوج)' : 'اختار مين يطلع', max: canDouble ? 2 : 1 });
      rows.push(
        new ActionRowBuilder().addComponents(
          game.button(`kick${round}`, 'random', 'خلّي العجلة تختار', { emoji: 'random', style: ButtonStyle.Primary }),
          game.button(`kick${round}`, 'withdraw', 'انسحاب', { emoji: 'withdraw', style: ButtonStyle.Danger })
        )
      );
      const ask = await game.send({
        allowedMentions: { users: [chosen] },
        content: [`<@${chosen}> العجلة وقفت عليك! اختار مين يطلع، أو خلّي العجلة تختار عنك`, `-# عندك <t:${Math.ceil(Date.now() / 1000) + 20}:R>${canDouble ? ' • معك طرد مزدوج، بتقدر تختار اتنين' : ''}`].join('\n'),
        components: rows,
      });
      const res = await game.waitFor(`kick${round}`, { who: chosen, timeout: 20_000, deny: 'مش إنت اللي عليك الدور.' });
      await ask.edit({ components: [] }).catch(() => {});
      let targets = [];
      let lead = '';
      if (!res) {
        targets = [chosen];
        lead = `${art.i('timer', '⏰')} <@${chosen}> ما قرر بالوقت، فطلع هو`;
      } else {
        await res.interaction.deferUpdate().catch(() => {});
        if (res.choice === 'withdraw') {
          targets = [chosen];
          lead = `${art.i('withdraw', '🏳️')} <@${chosen}> انسحب من اللعبة`;
        } else if (res.choice === 'random') {
          // a small wheel of the others decides — nobody can blame the chooser
          const t = await spin(game, others, `-# <@${chosen}> خلّى العجلة تختار مين يطلع`, { scale: 0.6 });
          targets = [t];
          lead = `${art.i('random', '🎲')} العجلة اختارت <@${t}>`;
        } else {
          targets = res.values.filter((v) => others.includes(v)).slice(0, canDouble ? 2 : 1);
          if (targets.length === 2) usePerk(game.guild.id, chosen, 'double');
          lead = `${art.i('kick', '🔨')} <@${chosen}> طرد ${targets.map((t) => `<@${t}>`).join(' و ')}`;
        }
      }
      const notes = [lead];
      for (const t of targets) {
        if (!game.alive.has(t)) continue;
        const r = eliminate(game, t, t === chosen ? null : chosen);
        if (r.note) notes.push(r.note);
        if (r.out) notes.push(`-# ${'<@' + r.out + '>'} طلع من اللعبة`);
        if (game.alive.size <= 2) break;
      }
      await game.send({ content: notes.join('\n') });
      await game.sleep(2500);
    }
    if (game.alive.size === 1) return { winners: game.aliveList(), title: 'بطل الروليت' };
    const final = await spin(game, game.aliveList(), '**الجولة الأخيرة** • العجلة بتختار البطل');
    return { winners: [final], title: 'بطل الروليت' };
  },
};
