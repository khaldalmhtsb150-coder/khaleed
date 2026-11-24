const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const store = require('../../utils/store');
const games = require('../../systems/games');

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

module.exports = {
  name: 'game-night',
  aliases: ['سهرة', 'سهرة-العاب'],
  description: 'سهرة ألعاب أسبوعية: تذكير قبلها، ألعاب ورا بعض، وأبطال السهرة',
  perms: ['ManageGuild'],
  options: [
    { name: 'action', type: 'string', description: 'شو بدك؟', required: true, choices: [{ name: 'جدولة أسبوعية', value: 'schedule' }, { name: 'ابدأ سهرة هسا', value: 'now' }, { name: 'إيقاف الجدولة', value: 'off' }] },
    { name: 'channel', type: 'channel', description: 'روم السهرة', channelTypes: [0] },
    { name: 'day', type: 'string', description: 'اليوم', choices: DAYS.map((name, value) => ({ name, value: String(value) })) },
    { name: 'time', type: 'string', description: 'الساعة بتوقيت عمّان، مثل 21:00' },
    { name: 'games', type: 'string', description: 'الألعاب بالترتيب، مثل roulette,chairs,spy,mafia' },
    { name: 'role', type: 'role', description: 'رتبة بتنمنشن بالتذكير' },
  ],
  async run(ctx) {
    const conf = store.guild('gamesConfig', ctx.guild.id, {});
    conf.night = { ...games.DEFAULT.night, ...(conf.night || {}) };
    const action = ctx.get('action');
    if (ctx.get('channel')) conf.night.channelId = ctx.get('channel').id;
    if (ctx.get('day') !== null) conf.night.day = Number(ctx.get('day'));
    if (ctx.get('time')) {
      const t = String(ctx.get('time')).trim();
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(t)) return ctx.fail('الوقت لازم يكون مثل 21:00');
      conf.night.time = t.padStart(5, '0');
    }
    if (ctx.get('games')) {
      const list = String(ctx.get('games')).split(/[,\s،]+/).filter((g) => games.TYPES.has(g));
      if (!list.length) return ctx.fail(`الألعاب المتاحة: ${[...games.TYPES.keys()].join(', ')}`);
      conf.night.games = list;
    }
    if (ctx.get('role')) conf.night.roleId = ctx.get('role').id;
    if (action === 'off') conf.night.enabled = false;
    if (action === 'schedule') {
      if (!conf.night.channelId) return ctx.fail('حدد روم السهرة.');
      conf.night.enabled = true;
    }
    store.save('gamesConfig');
    if (action === 'now') {
      if (!conf.night.channelId) conf.night.channelId = ctx.channel.id;
      store.save('gamesConfig');
      games.runNight(ctx.guild, games.config(ctx.guild.id), ctx.client).catch(() => {});
      return ctx.reply(`${E.success} بلشت سهرة الألعاب بـ <#${conf.night.channelId}> 🎉`);
    }
    if (action === 'off') return ctx.reply(`${E.success} وقفت سهرة الألعاب الأسبوعية.`);
    return ctx.reply(
      [
        `${E.success} سهرة الألعاب كل **${DAYS[conf.night.day]}** الساعة **${conf.night.time}** بـ <#${conf.night.channelId}>`,
        `${E.dot} الألعاب: ${conf.night.games.map((g) => `${games.TYPES.get(g).emoji} ${games.TYPES.get(g).name}`).join(' ← ')}`,
        ui.hint('البوت بيذكّر قبل نص ساعة، وبآخر السهرة بيعلن الأبطال.'),
      ].join('\n')
    );
  },
};
