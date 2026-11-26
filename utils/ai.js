// One small client for the language model behind the AI assistant and the staff applications.
// Works with Anthropic directly, or with any OpenAI-style endpoint (Gemini, OpenAI, Groq, OpenRouter).
//
// .env
//   AI_PROVIDER = gemini | anthropic | openai | groq | openrouter   (optional if one of the keys below is set)
//   AI_API_KEY  = the key for that provider   (or GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY / GROQ_API_KEY)
//   AI_MODEL    = optional, overrides the default model
//   AI_BASE_URL = optional, a custom OpenAI-style endpoint (…/chat/completions)
//   AI_DAILY_FREE / AI_DAILY_PREMIUM / AI_DAILY_GLOBAL = optional daily call limits
//
// Messages use one neutral shape everywhere in the bot:
//   { role: 'user' | 'assistant', content: string | [{ type: 'text', text } | { type: 'image', data, mediaType }] }
//   { role: 'assistant', content, toolCalls: [{ id, name, input }] }
//   { role: 'tool', results: [{ id, name, content }] }
const store = require('./store');

const PROVIDERS = {
  anthropic: { format: 'anthropic', url: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-5-5', env: 'ANTHROPIC_API_KEY' },
  gemini: { format: 'openai', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-flash-latest', fallback: ['gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'], env: 'GEMINI_API_KEY' },
  openai: { format: 'openai', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-5-mini', env: 'OPENAI_API_KEY' },
  groq: { format: 'openai', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', fallback: ['llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'meta-llama/llama-4-scout-17b-16e-instruct'], env: 'GROQ_API_KEY' },
  openrouter: { format: 'openai', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'google/gemini-flash-latest', env: 'OPENROUTER_API_KEY' },
};

let mock = null;
const resting = new Map(); // provider → time it may lead again
const working = new Map(); // provider → { model, at }: the last model that answered

// keys pasted with quotes or spaces around them are a common .env mistake
const clean = (v) => String(v || '').trim().replace(/^['"]|['"]$/g, '').trim();
// Which provider a key belongs to, from its shape — so a key in the "wrong" line still works.
function keyOwner(key) {
  if (/^sk-ant-/.test(key)) return 'anthropic';
  if (/^gsk_/.test(key)) return 'groq';
  if (/^sk-or-/.test(key)) return 'openrouter';
  if (/^(AIza|AQ\.)/.test(key)) return 'gemini';
  if (/^sk-/.test(key)) return 'openai';
  return null;
}
function entry(name, key, { primary = false } = {}) {
  const env = process.env;
  const p = PROVIDERS[name];
  const model = (primary && env.AI_MODEL) || p.model;
  const extra = primary && env.AI_FALLBACK_MODELS ? env.AI_FALLBACK_MODELS.split(',').map((m) => m.trim()).filter(Boolean) : p.fallback || [];
  return { name, ...p, key, model, models: [...new Set([model, ...extra])], url: (primary && env.AI_BASE_URL) || p.url };
}
/** Every provider with a key in .env, the one named in AI_PROVIDER first. */
function chain() {
  const env = process.env;
  const wanted = String(env.AI_PROVIDER || '').toLowerCase().trim();
  const found = new Map(); // provider → key
  const add = (key, hint) => {
    key = clean(key);
    if (!key) return;
    const owner = keyOwner(key) || (PROVIDERS[hint] ? hint : null);
    if (owner && !found.has(owner)) found.set(owner, key);
  };
  add(env.AI_API_KEY, wanted || 'gemini');
  for (const [name, p] of Object.entries(PROVIDERS)) add(env[p.env], name);
  const names = [...found.keys()].sort((x, y) => (y === wanted) - (x === wanted));
  return names.map((n, k) => entry(n, found.get(n), { primary: k === 0 && (n === wanted || !wanted) }));
}
const settings = () => chain()[0] || null;

/** One safe line for the console: which providers, and the last 4 characters of each key. */
function describe() {
  const list = chain();
  return list.length ? list.map((x) => `${x.name} (…${x.key.slice(-4)})`).join(' + ') : 'none';
}

const available = () => Boolean(mock || settings());
const providerName = () => (mock ? 'mock' : chain().map((x) => x.name).join(' + ') || null);
if (!process.env.AI_QUIET) setImmediate(() => console.log(`[ai] providers: ${describe()}`));

// ---------- daily limits (protects the owner's API bill) ----------
const today = () => new Date().toISOString().slice(0, 10);
function limitFor(guildId) {
  const premium = require('./premium');
  const lim = premium.limit(guildId, 'aiDaily') ?? 60;
  const env = Number(process.env[lim === premium.PLANS.premium.aiDaily ? 'AI_DAILY_PREMIUM' : 'AI_DAILY_FREE']);
  return env > 0 ? env : lim;
}
function usage(guildId) {
  const all = store.get('aiUsage');
  const u = all[guildId];
  if (!u || u.day !== today()) return { day: today(), n: 0 };
  return u;
}
function globalUsage() {
  const g = store.get('aiUsage').__all;
  return g && g.day === today() ? g.n : 0;
}
function canUse(guildId) {
  if (!available()) return false;
  if (globalUsage() >= (Number(process.env.AI_DAILY_GLOBAL) || 3000)) return false;
  return usage(guildId).n < limitFor(guildId);
}
function count(guildId) {
  const all = store.get('aiUsage');
  const u = usage(guildId);
  u.n++;
  all[guildId] = u;
  const g = all.__all && all.__all.day === today() ? all.__all : { day: today(), n: 0 };
  g.n++;
  all.__all = g;
  store.save('aiUsage');
}

// ---------- format converters ----------
function toAnthropic({ system, messages, tools }) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      out.push({ role: 'user', content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: String(r.content) })) });
      continue;
    }
    const parts = [];
    const content = typeof m.content === 'string' ? (m.content ? [{ type: 'text', text: m.content }] : []) : m.content || [];
    for (const c of content) {
      if (c.type === 'text' && c.text) parts.push({ type: 'text', text: c.text });
      else if (c.type === 'image') parts.push({ type: 'image', source: { type: 'base64', media_type: c.mediaType, data: c.data } });
    }
    for (const t of m.toolCalls || []) parts.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input || {} });
    if (!parts.length) parts.push({ type: 'text', text: '…' });
    // Anthropic wants alternating roles: merge neighbours with the same role
    const last = out[out.length - 1];
    if (last && last.role === m.role && Array.isArray(last.content)) last.content.push(...parts);
    else out.push({ role: m.role, content: parts });
  }
  if (out[0]?.role !== 'user') out.unshift({ role: 'user', content: [{ type: 'text', text: '…' }] });
  const body = { system, messages: out };
  if (tools?.length) body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  return body;
}

function toOpenAI({ system, messages, tools }) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'tool') {
      for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.id, content: String(r.content) });
      continue;
    }
    let content;
    if (typeof m.content === 'string') content = m.content;
    else {
      content = (m.content || []).map((c) => (c.type === 'image' ? { type: 'image_url', image_url: { url: `data:${c.mediaType};base64,${c.data}` } } : { type: 'text', text: c.text || '' }));
      if (m.role === 'assistant') content = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    }
    const msg = { role: m.role, content: content || (m.toolCalls?.length ? null : '…') };
    if (m.toolCalls?.length) msg.tool_calls = m.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.input || {}) } }));
    out.push(msg);
  }
  const body = { messages: out };
  if (tools?.length) body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  return body;
}

function fromAnthropic(j) {
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  const toolCalls = (j.content || []).filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, input: c.input || {} }));
  return { text, toolCalls };
}
function fromOpenAI(j) {
  const m = j.choices?.[0]?.message || {};
  let text = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((c) => c.text || '').join('') : '';
  const toolCalls = (m.tool_calls || []).map((t, k) => {
    let input = {};
    try {
      input = JSON.parse(t.function?.arguments || '{}');
    } catch {}
    return { id: t.id || `call_${k}`, name: t.function?.name, input };
  });
  return { text: String(text || '').trim(), toolCalls };
}

async function post(url, headers, body, ms = Number(process.env.AI_TIMEOUT_MS) || 30_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const raw = await res.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {}
    if (!res.ok) {
      const err = new Error(`AI ${res.status}: ${(json?.error?.message || raw).slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One model call. Returns { text, toolCalls }.
 * opts: { guildId, system, messages, tools, maxTokens, temperature, json }
 */
async function chat({ guildId, system, messages, tools = [], maxTokens = 700, temperature = 0.6 }) {
  if (guildId && !canUse(guildId)) {
    const e = new Error('AI limit');
    e.code = 'LIMIT';
    throw e;
  }
  if (guildId) count(guildId);
  if (mock) return mock({ system, messages, tools });
  const list = chain();
  if (!list.length) throw Object.assign(new Error('AI not configured'), { code: 'OFF' });
  let lastErr;
  // a provider that was all busy a moment ago goes to the back of the line for 2 minutes
  const now = Date.now();
  const order = [...list.filter((x) => !(resting.get(x.name) > now)), ...list.filter((x) => resting.get(x.name) > now)];
  for (const s of order) {
    try {
      const t0 = Date.now();
      const out = await callProvider(s, { system, messages, tools, maxTokens, temperature });
      resting.delete(s.name);
      if (process.env.AI_LOG !== '0') console.log(`[ai] ✓ ${s.name}/${working.get(s.name)?.model || s.model} ${((Date.now() - t0) / 1000).toFixed(1)}s${out.toolCalls?.length ? ` tools: ${out.toolCalls.map((c) => c.name).join(',')}` : ''}`);
      return out;
    } catch (e) {
      lastErr = e;
      // busy, rate-limited, timed out or model gone: let the backup provider answer
      // a wrong key (401/403) on one provider shouldn't silence the bot when another one works
      const passOn = e.name === 'AbortError' || /timeout/i.test(e.message) || [400, 401, 403, 404, 429, 500, 502, 503, 504].includes(e.status);
      if (!passOn) throw e;
      if (list.length > 1) resting.set(s.name, Date.now() + 2 * 60_000);
    }
  }
  throw lastErr;
}

async function callProvider(s, { system, messages, tools, maxTokens, temperature }) {

  let body;
  if (s.format === 'anthropic') body = { model: s.model, max_tokens: maxTokens, temperature, ...toAnthropic({ system, messages, tools }) };
  else {
    body = { model: s.model, ...toOpenAI({ system, messages, tools }) };
    const effort = process.env.AI_REASONING || 'low';
    if (s.name === 'openai') {
      // reasoning models: their thinking counts against the budget, and they only take the default temperature
      body.max_completion_tokens = Math.max(maxTokens * 4, 2000);
      body.reasoning_effort = effort;
    } else if (s.name === 'gemini') {
      // chat replies don't need long thinking: ask for none (falls back to low on models that always think)
      body.max_tokens = Math.max(maxTokens * 4, 2048);
      body.reasoning_effort = process.env.AI_REASONING || 'none';
      body.temperature = temperature;
    } else {
      body.max_tokens = /gpt-oss|qwen3/.test(s.model) ? Math.max(maxTokens * 4, 2048) : maxTokens;
      body.temperature = temperature;
      if (/gpt-oss/.test(s.model)) body.reasoning_effort = 'low';
    }
  }

  // when a model is busy (503/429) or missing (404), move on to the next one in the list
  // start from the model that answered last time, so a busy one doesn't slow every reply
  const all = s.models || [s.model];
  const pref = working.get(s.name);
  const models = pref && Date.now() - pref.at < 15 * 60_000 && all.includes(pref.model) ? [pref.model, ...all.filter((m) => m !== pref.model)] : all;
  let mi = 0;
  let attempt = 0;
  for (;;) {
    body.model = models[mi];
    try {
      const out = s.format === 'anthropic' ? fromAnthropic(await post(s.url, { 'x-api-key': s.key, 'anthropic-version': '2023-06-01' }, body)) : fromOpenAI(await post(s.url, { authorization: `Bearer ${s.key}` }, body));
      working.set(s.name, { model: body.model, at: Date.now() });
      return out;
    } catch (e) {
      attempt++;
      // a model that doesn't take one of the optional knobs: drop it and try again
      if (e.status === 400 && attempt <= 3) {
        const msg = String(e.message);
        // models that always think reject "none" (often with a bare "invalid argument"): ask for low instead
        if (body.reasoning_effort === 'none') {
          body.reasoning_effort = 'low';
          continue;
        }
        const knob = ['reasoning_effort', 'temperature'].find((k) => k in body && (msg.includes(k) || /invalid argument/i.test(msg)));
        if (knob) {
          delete body[knob];
          continue;
        }
      }
      if (e.name === 'AbortError') e.message = 'AI timeout: ما وصل رد من مزوّد الذكاء الاصطناعي خلال 30 ثانية (يمكن الاستضافة مانعة الاتصال)';
      console.error(`[ai] ${s.name} ${body.model}:`, String(e.message).replace(/\s+/g, ' ').slice(0, 160));
      if ([404, 429, 500, 503].includes(e.status) && mi + 1 < models.length) {
        if (working.get(s.name)?.model === body.model) working.delete(s.name);
        mi++;
        attempt = 0;
        continue;
      }
      const retry = e.status === 429 || (e.status >= 500 && e.status < 600);
      if (!retry || attempt > 1) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

/**
 * Model + tools loop: calls the model, runs the tools it asks for, feeds the results back, repeats.
 * handlers: { toolName: async (input) => string }
 * Returns { text, actions: [{ name, input, result }] }
 */
async function run({ guildId, system, messages, tools = [], handlers = {}, maxSteps = 4, maxTokens, temperature }) {
  const convo = [...messages];
  const actions = [];
  let text = '';
  for (let step = 0; step < maxSteps; step++) {
    const r = await chat({ guildId, system, messages: convo, tools, maxTokens, temperature });
    text = r.text || text;
    if (!r.toolCalls?.length) return { text: r.text, actions };
    convo.push({ role: 'assistant', content: r.text || '', toolCalls: r.toolCalls });
    const results = [];
    for (const call of r.toolCalls) {
      let result;
      try {
        result = handlers[call.name] ? await handlers[call.name](call.input || {}) : 'unknown tool';
      } catch (e) {
        result = `error: ${e.message}`;
      }
      actions.push({ name: call.name, input: call.input, result });
      results.push({ id: call.id, name: call.name, content: typeof result === 'string' ? result : JSON.stringify(result) });
    }
    convo.push({ role: 'tool', results });
  }
  return { text, actions };
}

/** Asks for a JSON object and parses it (tolerates code fences and chatter around it). */
async function json({ guildId, system, prompt, images = [], maxTokens = 700 }) {
  const content = [{ type: 'text', text: prompt }, ...images];
  const r = await chat({ guildId, system: `${system}\n\nReply with one JSON object only. No code fences, no text around it.`, messages: [{ role: 'user', content }], maxTokens, temperature: 0.2 });
  const m = String(r.text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI returned no JSON');
  return JSON.parse(m[0]);
}

/** Downloads an image attachment for vision (≤ 4 MB, png/jpg/webp/gif). */
async function image(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return null;
    return { type: 'image', mediaType: type === 'image/jpg' ? 'image/jpeg' : type, data: buf.toString('base64') };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  PROVIDERS,
  available,
  providerName,
  describe,
  _keyOwner: keyOwner,
  canUse,
  usage,
  limitFor,
  chat,
  run,
  json,
  image,
  _toAnthropic: toAnthropic,
  _toOpenAI: toOpenAI,
  _fromAnthropic: fromAnthropic,
  _fromOpenAI: fromOpenAI,
  _setMock: (fn) => (mock = fn),
};
