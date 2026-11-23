// Wheel prize chances. A prize is stored as a plain string (old format) or { name, chance }.
// chance: a number 0–100 (0 = shown on the wheel but never wins) or null = "auto" (shares what is left of 100%).

const nameOf = (r) => (r && typeof r === 'object' ? String(r.name) : String(r));
const chanceOf = (r) => (r && typeof r === 'object' && typeof r.chance === 'number' ? r.chance : null);

/** Reads "نيترو 5%" / "نيترو | 0.5" style input → { name, chance }. */
function parse(text, explicit = null) {
  let name = String(text || '').trim();
  let chance = explicit;
  if (chance === null || chance === undefined) {
    const m = name.match(/^(.*?)[\s|،,:-]*(\d+(?:\.\d+)?)\s*[%٪]$/);
    if (m && m[1].trim()) {
      name = m[1].trim();
      chance = Number(m[2]);
    } else chance = null;
  }
  return { name: name.slice(0, 200), chance };
}

/** Parses a chance typed by an admin: "5", "5%", "0.5", "auto"/"تلقائي" → number | null | undefined (invalid). */
function parseChance(v) {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim().replace(/[%٪]/g, '');
  if (/^(auto|تلقائي|تلقائيا|-)$/i.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 100) / 100;
}

/** Effective % for every prize (what the members really get). */
function table(list) {
  const items = (list || []).map((r) => ({ name: nameOf(r), set: chanceOf(r) }));
  const fixed = items.filter((i) => i.set !== null).reduce((s, i) => s + i.set, 0);
  const autos = items.filter((i) => i.set === null);
  const left = Math.max(0, 100 - fixed);
  const autoEach = autos.length ? left / autos.length : 0;
  const weights = items.map((i) => (i.set === null ? autoEach : i.set));
  const total = weights.reduce((s, w) => s + w, 0);
  return {
    items: items.map((i, k) => ({ ...i, weight: weights[k], percent: total > 0 ? (weights[k] / total) * 100 : 0 })),
    fixed,
    total,
    // the typed numbers don't add up to 100 and there are no "auto" prizes to absorb the gap
    scaled: total > 0 && !autos.length && Math.abs(fixed - 100) > 0.001,
    overfull: fixed > 100.001,
  };
}

/** Picks a prize name using the chances; null when nothing can win. */
function pick(list, rnd = Math.random) {
  const t = table(list);
  if (t.total <= 0) return null;
  let x = rnd() * t.total;
  for (const i of t.items) {
    if (i.weight <= 0) continue;
    if ((x -= i.weight) < 0) return i.name;
  }
  return t.items.filter((i) => i.weight > 0).pop().name;
}

const fmt = (p) => `${p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2)}%`.replace(/\.0+%$/, '%');

/** Replies only the admin can see: ephemeral on slash; on prefix the command message is removed and details go to DMs. */
async function privateReply(ctx, text) {
  if (ctx.isSlash) return ctx.reply(text, { ephemeral: true });
  ctx.message?.delete().catch(() => {});
  const dm = await ctx.user.send(`${text}\n-# سيرفر ${ctx.guild.name}`).catch(() => null);
  const note = await ctx.channel
    .send(dm ? '✓ تم، بعتتلك التفاصيل بالخاص.' : '✓ تم. خاصك مسكّر، استخدم الأمر بالسلاش عشان تشوف النسب بشكل مخفي.')
    .catch(() => null);
  if (note) setTimeout(() => note.delete().catch(() => {}), 8000);
  return note;
}

module.exports = { privateReply, nameOf, chanceOf, parse, parseChance, table, pick, fmt };
