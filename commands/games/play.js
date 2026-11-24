const games = require('../../systems/games');

const CHOICES = [
  ['roulette', '🎡 روليت'], ['mafia', '🕵️ مافيا'], ['chairs', '🪑 كراسي'], ['spy', '🤫 برا السالفة'], ['xo', '❌ بطولة XO'],
  ['rps', '✂️ حجرة ورقة مقص'], ['deathbox', '📦 صندوق الموت'], ['fasttype', '⌨️ أسرع كاتب'], ['flags', '🏳️ أعلام'],
  ['capitals', '🏛️ عواصم'], ['unscramble', '🔤 فكك الكلمة'], ['math', '🧮 حساب سريع'],
];

module.exports = {
  name: 'play',
  aliases: ['لعبة', 'العب', 'روليت', 'مافيا', 'كراسي'],
  description: 'ابدأ لعبة: روليت، مافيا، كراسي، برا السالفة، XO والمزيد',
  cooldown: 5,
  options: [{ name: 'game', type: 'string', description: 'اللعبة', label: 'اللعبة', choices: CHOICES.map(([value, name]) => ({ name, value })) }],
  async run(ctx) {
    let id = ctx.get('game');
    // prefix aliases: "روليت" / "مافيا" / "كراسي" start that game directly
    if (!id && ctx.message) {
      const said = ctx.message.content;
      id = [['روليت', 'roulette'], ['مافيا', 'mafia'], ['كراسي', 'chairs']].find(([w]) => said.includes(w))?.[1] || null;
    }
    const byArabic = id ? CHOICES.find(([, n]) => n.includes(id)) : null;
    if (!games.TYPES.has(id) && byArabic) id = byArabic[0];
    if (!games.TYPES.has(id)) return ctx.fail(`اختار لعبة: ${CHOICES.map(([, n]) => n).join(' • ')}`);
    const conf = games.config(ctx.guild.id);
    if (conf.starterRoleId && !ctx.member.roles.cache.has(conf.starterRoleId) && !ctx.member.permissions.has('ManageGuild')) {
      return ctx.fail(`بس اللي معه رتبة <@&${conf.starterRoleId}> بيقدر يبدأ لعبة.`);
    }
    try {
      await games.start(id, ctx.channel, ctx.user.id);
      if (ctx.isSlash) return ctx.reply({ content: `${games.TYPES.get(id).emoji} بلشت اللعبة!` }, { ephemeral: true });
    } catch (e) {
      return ctx.fail(e.message);
    }
  },
};
