const E = require('../../utils/emojis');
const art = require('../../utils/art');
const store = require('../../utils/store');
const media = require('../../utils/media');
const premium = require('../../utils/premium');

const NAMES = { roulette: 'روليت (اللوبي)', rouletteWheel: 'روليت (خلفية العجلة)', mafia: 'مافيا', chairs: 'الكراسي', spy: 'برا السالفة', xo: 'بطولة XO', rps: 'حجرة ورقة مقص', deathbox: 'صندوق الموت', rebelka: 'ريبلكا', fasttype: 'أسرع كاتب', flags: 'أعلام', capitals: 'عواصم', unscramble: 'فكّك الكلمة', math: 'حساب سريع', night: 'سهرة الألعاب' };

module.exports = {
  name: 'game-image',
  aliases: ['صورة-لعبة'],
  description: 'بريميوم: حط صورتك الخاصة لأي لعبة أو لخلفية عجلة الروليت',
  perms: ['ManageGuild'],
  cooldown: 5,
  options: [
    { name: 'game', type: 'string', description: 'اللعبة', required: true, choices: Object.entries(NAMES).map(([value, name]) => ({ name, value })) },
    { name: 'reset', type: 'boolean', description: 'رجّع صورة البوت الأصلية' },
    { name: 'url', type: 'string', description: 'رابط الصورة https://' },
    { name: 'image', type: 'attachment', description: 'ارفع الصورة (الأفضل 1200×600)' },
  ],
  async run(ctx) {
    if (!premium.has(ctx.guild.id, 'gameArt')) return ctx.fail(premium.lockedText('gameArt'));
    const key = ctx.get('game');
    const ga = store.guild('gameArt', ctx.guild.id);
    if (ctx.get('reset')) {
      delete ga[key];
      media.remove(`game-${key}-${ctx.guild.id}`);
      store.save('gameArt');
      return ctx.reply(`${E.success} رجعت صورة **${NAMES[key]}** الأصلية.`);
    }
    const att = ctx.get('image');
    const link = (att && typeof att === 'object' ? att.url : null) || ctx.message?.attachments?.first()?.url || ctx.get('url') || (typeof att === 'string' ? att : null);
    if (!link || !/^https:\/\//.test(link)) return ctx.fail('ارفع صورة أو حط رابط https.');
    await ctx.defer();
    try {
      // Discord attachment links expire, so the picture is saved on the bot
      ga[key] = media.saveDataUri(await media.fetchToDataUri(link), `game-${key}-${ctx.guild.id}`);
      store.save('gameArt');
    } catch (e) {
      return ctx.reply(`• ${e.message}`);
    }
    const preview = art.customArt(key === 'rouletteWheel' ? 'roulette' : key, ctx.guild.id) && key !== 'rouletteWheel' ? art.customArt(key, ctx.guild.id) : null;
    return ctx.reply({ content: `${E.success} صارت صورة **${NAMES[key]}** هاي${key === 'rouletteWheel' ? ' (بتظهر ورا العجلة وهي بتلف)' : ''}`, files: preview ? [preview] : [] });
  },
};
