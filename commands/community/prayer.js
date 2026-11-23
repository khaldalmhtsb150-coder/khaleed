const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const prayer = require('../../systems/prayer');

module.exports = {
  name: 'prayer',
  aliases: ['صلاة', 'مواقيت', 'اذان'],
  description: 'مواقيت الصلاة لليوم، ومع رمضان عداد الإمساك والإفطار',
  cooldown: 5,
  options: [{ name: 'city', type: 'string', description: 'المدينة (الافتراضي مدينة السيرفر)', choices: Object.entries(prayer.CITIES).slice(0, 25).map(([value, c]) => ({ name: c.name, value })) }],
  async run(ctx) {
    const key = ctx.get('city') || prayer.config(ctx.guild.id).city || 'amman';
    const c = prayer.CITIES[key] || prayer.CITIES.amman;
    const ram = prayer.isRamadan(new Date(), c.tz);
    const t = prayer.times(key, new Date(), { ramadan: ram });
    const now = Date.now();
    const next = prayer.ADHAN.map((k) => [k, t[k]]).find(([, d]) => d.getTime() > now);
    const h = prayer.hijri(new Date(), c.tz);
    const lines = Object.entries(prayer.NAMES).map(([k, n]) => `${next?.[0] === k ? '▸ ' : `${E.dot} `}**${n}** — ${prayer.fmt(t[k], c.tz)}`);
    const extra = [];
    if (next) extra.push(`⏳ الصلاة الجاية: **${prayer.NAMES[next[0]]}** <t:${Math.floor(next[1].getTime() / 1000)}:R>`);
    if (ram) {
      extra.push(`🌙 **رمضان كريم** — الإمساك ${prayer.fmt(new Date(t.fajr.getTime() - 10 * 60_000), c.tz)} · الإفطار ${prayer.fmt(t.maghrib, c.tz)}`);
      if (t.maghrib.getTime() > now) extra.push(`🍽️ باقي على الإفطار <t:${Math.floor(t.maghrib.getTime() / 1000)}:R>`);
    }
    return ctx.reply({
      embeds: [
        ui
          .embed()
          .setDescription(`### 🕌 مواقيت الصلاة — ${c.name}\n${h.day}/${h.month}/${h.year} هـ\n\n${lines.join('\n')}\n\n${extra.join('\n')}\n${ui.hint(`طريقة الحساب: ${prayer.METHODS[c.method].name}. ممكن تختلف دقيقة أو دقيقتين عن إعلان المسجد.`)}`),
      ],
    });
  },
};
