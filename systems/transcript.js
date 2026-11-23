// Self-contained, dark-themed HTML transcript generator (no external libraries).

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function markdown(text, guild, client) {
  let html = esc(text);
  const blocks = [];
  html = html.replace(/```(?:[\w-]+\n)?([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre><code>${code}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  html = html.replace(/`([^`\n]+)`/g, (_, code) => {
    blocks.push(`<code class="inline">${code}</code>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });

  html = html
    .replace(/&lt;(a?):(\w+):(\d+)&gt;/g, (_, a, name, id) => `<img class="emoji" alt=":${name}:" src="https://cdn.discordapp.com/emojis/${id}.${a ? 'gif' : 'png'}?size=48">`)
    .replace(/&lt;@!?(\d+)&gt;/g, (_, id) => {
      const m = guild?.members.cache.get(id);
      const u = m?.user || client?.users.cache.get(id);
      return `<span class="mention">@${esc(m?.displayName || u?.username || id)}</span>`;
    })
    .replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => `<span class="mention">@${esc(guild?.roles.cache.get(id)?.name || 'رتبة')}</span>`)
    .replace(/&lt;#(\d+)&gt;/g, (_, id) => `<span class="mention">#${esc(guild?.channels.cache.get(id)?.name || 'قناة')}</span>`)
    .replace(/&lt;t:(\d+)(?::\w)?&gt;/g, (_, t) => `<span class="time">${new Date(Number(t) * 1000).toLocaleString('ar')}</span>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/^-# (.+)$/gm, '<small>$1</small>')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');

  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
}

async function fetchAll(channel, limit = 3000) {
  const out = [];
  let before;
  while (out.length < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    out.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return out.reverse();
}

function renderEmbed(e, guild, client) {
  const color = e.hexColor || '#1e1f22';
  return `<div class="embed" style="border-inline-start-color:${color}">
    ${e.author?.name ? `<div class="e-author">${esc(e.author.name)}</div>` : ''}
    ${e.title ? `<div class="e-title">${esc(e.title)}</div>` : ''}
    ${e.description ? `<div class="e-desc">${markdown(e.description, guild, client)}</div>` : ''}
    ${(e.fields || []).map((f) => `<div class="e-field"><b>${esc(f.name)}</b><div>${markdown(f.value, guild, client)}</div></div>`).join('')}
    ${e.image?.url ? `<img class="e-img" src="${esc(e.image.url)}">` : ''}
  </div>`;
}

async function buildTranscript(channel, meta = {}) {
  const messages = await fetchAll(channel);
  const { guild, client } = channel;

  const rows = messages
    .map((m) => {
      const member = guild.members.cache.get(m.author.id);
      const color = member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : '#f2f3f5';
      const atts = [...m.attachments.values()]
        .map((a) =>
          a.contentType?.startsWith('image/')
            ? `<a href="${esc(a.url)}" target="_blank"><img class="att-img" src="${esc(a.url)}" alt="${esc(a.name)}"></a>`
            : `<a class="att" href="${esc(a.url)}" target="_blank">${esc(a.name)} · ${(a.size / 1024).toFixed(1)} KB</a>`
        )
        .join('');
      return `<div class="msg">
        <img class="avatar" src="${esc(m.author.displayAvatarURL({ extension: 'png', size: 64 }))}" alt="">
        <div class="body">
          <div class="meta"><span class="name" style="color:${color}">${esc(member?.displayName || m.author.username)}</span>${m.author.bot ? '<span class="bot">BOT</span>' : ''}<span class="date">${new Date(m.createdTimestamp).toLocaleString('ar')}</span></div>
          ${m.content ? `<div class="content" dir="auto">${markdown(m.content, guild, client)}</div>` : ''}
          ${m.embeds.map((e) => renderEmbed(e, guild, client)).join('')}
          ${atts ? `<div class="atts">${atts}</div>` : ''}
        </div>
      </div>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(channel.name)} — ${esc(guild.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:#111214;color:#dbdee1;font-family:Tajawal,system-ui,sans-serif;font-size:15px;line-height:1.55}
header{position:sticky;top:0;z-index:2;background:#1e1f22;border-bottom:1px solid #2b2d31;padding:18px 28px;display:flex;gap:16px;align-items:center}
header img{width:52px;height:52px;border-radius:14px;background:#2b2d31}
header h1{margin:0;font-size:18px;color:#f2f3f5}
header .sub{color:#949ba4;font-size:13px;display:flex;gap:14px;flex-wrap:wrap;margin-top:4px}
main{max-width:1000px;margin:0 auto;padding:18px 12px 60px}
.msg{display:flex;gap:14px;padding:8px 16px;border-radius:8px}
.msg:hover{background:#1a1b1e}
.avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;margin-top:2px}
.body{min-width:0;flex:1}
.meta{display:flex;align-items:center;gap:8px}
.name{font-weight:700}
.bot{background:#5865f2;color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px}
.date{color:#80848e;font-size:12px}
.content{word-wrap:break-word;white-space:normal}
.mention{background:rgba(88,101,242,.25);color:#c9cdfb;padding:0 3px;border-radius:4px}
code.inline{background:#2b2d31;padding:1px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:13px}
pre{background:#1e1f22;border:1px solid #2b2d31;padding:10px;border-radius:6px;overflow:auto;direction:ltr;text-align:left}
blockquote{margin:2px 0;padding-inline-start:10px;border-inline-start:3px solid #4e5058}
small{color:#949ba4;font-size:12px}
a{color:#00a8fc;text-decoration:none}
.emoji{width:22px;height:22px;vertical-align:middle}
.embed{background:#2b2d31;border-inline-start:4px solid;border-radius:6px;padding:10px 14px;margin-top:6px;max-width:520px}
.e-author{font-size:13px;font-weight:600}
.e-title{font-weight:700;color:#f2f3f5;margin-bottom:4px}
.e-desc{font-size:14px}
.e-field{margin-top:8px;font-size:14px}
.e-img,.att-img{max-width:100%;max-height:340px;border-radius:6px;margin-top:6px}
.atts{display:flex;flex-direction:column;gap:6px;margin-top:4px}
.att{display:inline-block;background:#2b2d31;border:1px solid #1e1f22;padding:8px 12px;border-radius:6px;width:fit-content}
footer{text-align:center;color:#6d6f78;font-size:12px;padding:24px}
</style>
</head>
<body>
<header>
  <img src="${esc(guild.iconURL({ extension: 'png', size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="">
  <div>
    <h1>${esc(guild.name)} · #${esc(channel.name)}</h1>
    <div class="sub">
      ${meta.department ? `<span>القسم: ${esc(meta.department)}</span>` : ''}
      ${meta.opener ? `<span>صاحب التذكرة: ${esc(meta.opener)}</span>` : ''}
      ${meta.claimer ? `<span>المستلم: ${esc(meta.claimer)}</span>` : ''}
      <span>عدد الرسائل: ${messages.length}</span>
    </div>
  </div>
</header>
<main>
${rows || '<p style="text-align:center;color:#80848e">لا توجد رسائل.</p>'}
</main>
<footer>MarkaBot Transcript · ${new Date().toLocaleString('ar')}</footer>
</body>
</html>`;

  return { buffer: Buffer.from(html, 'utf8'), count: messages.length };
}

module.exports = { buildTranscript };
