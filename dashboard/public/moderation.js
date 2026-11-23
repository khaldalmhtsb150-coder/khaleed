/* Settings page: all modules for one guild */
(function () {
  const { api, toast, icon, esc, options } = MB;
  const id = MB.guildIdFromPath();
  let S = null; // settings
  let M = null; // metadata
  let EMO = null; // emojis (global, owner only)
  let GEMO = null; // this server's emojis (premium)
  let P = null; // premium status
  const chipState = {};
  const listState = {};

  const SECTIONS = [
    { id: 'sec-premium', label: 'البريميوم', icon: 'crown' },
    { id: 'sec-general', label: 'عام', icon: 'sliders' },
    { id: 'sec-botprofile', label: 'شكل البوت 👑', icon: 'discord' },
    { id: 'sec-welcome', label: 'الترحيب', icon: 'wave' },
    { id: 'sec-tickets', label: 'التذاكر', icon: 'ticket' },
    { id: 'sec-giveaway', label: 'القيفاواي', icon: 'gift' },
    { id: 'sec-protection', label: 'الحماية 👑', icon: 'shield' },
    { id: 'sec-jail', label: 'السجن', icon: 'lock' },
    { id: 'sec-vanity', label: 'حماية الرابط', icon: 'shield' },
    { id: 'sec-logs', label: 'السجلات', icon: 'log' },
    { id: 'sec-invites', label: 'الدعوات', icon: 'users' },
    { id: 'sec-autoline', label: 'الخط التلقائي', icon: 'line' },
    { id: 'sec-feedback', label: 'الآراء', icon: 'chat' },
    { id: 'sec-replies', label: 'الردود التلقائية', icon: 'reply' },
    { id: 'sec-gemojis', label: 'إيموجيات السيرفر 👑', icon: 'smile' },
    { id: 'sec-emojis', label: 'الإيموجيات (عام)', icon: 'smile' },
  ];

  // ---------- premium helpers ----------
  /** isPrem(feature): is this feature unlocked here (paid premium, launch period, or switched to free by the owner)?
   *  isPrem(): are premium perks/limits active (paid or launch). paid(): real paid subscription. */
  const isPrem = (feature) => (feature ? Boolean(P?.unlocked?.[feature]) : Boolean(P?.active || P?.launch?.active));
  const paid = () => Boolean(P?.active);
  const premiumLimitMsg = (key) => (isPrem() ? `الحد الأقصى ${P.limits[key]}` : `المجاني ${P.limits[key]} — البريميوم ${P.plans.premium[key]} 👑`);
  const crown = '<span class="crown-badge" title="بريميوم">👑</span>';
  /** Wraps premium-only controls: dimmed + disabled with a note on free servers. */
  const premiumBlock = (inner, title = 'هذه الميزة للبريميوم', feature) =>
    isPrem(feature) ? inner : `<div class="locked"><div class="locked-note">${crown} ${title} — <a href="#premium">رقّي السيرفر</a></div><fieldset disabled>${inner}</fieldset></div>`;
  const fmtMs = (ms) => {
    if (!ms) return '—';
    const m = Math.round(ms / 60000);
    if (m < 60) return `${m} د`;
    const h = Math.floor(m / 60);
    return h < 48 ? `${h} س ${m % 60} د` : `${Math.round(h / 24)} يوم`;
  };

  // ---------- small builders ----------
  const textOpts = (sel, ph) => options(M.text, sel, { placeholder: ph || 'اختر قناة', prefix: '# ' });
  const roleOpts = (sel, ph) => options(M.roles.filter((r) => !r.managed), sel, { placeholder: ph || 'اختر رتبة', prefix: '@ ' });
  const catOpts = (sel) => options(M.categories, sel, { placeholder: 'اختر تصنيفاً' });

  function card(secId, title, desc, ic, body, saveKey, extraFoot = '') {
    return `<section class="card" id="${secId}">
      <div class="card-head"><div><h2>${icon(ic)} ${title}</h2>${desc ? `<p>${desc}</p>` : ''}</div></div>
      <div class="card-body">${body}</div>
      ${saveKey ? `<div class="card-foot">${extraFoot}<button class="btn primary" data-save="${saveKey}">حفظ التغييرات</button></div>` : ''}
    </section>`;
  }

  const toggle = (idAttr, checked, title, sub, disabled = false) => `
    <div class="toggle-line"><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>
      <label class="switch"><input type="checkbox" id="${idAttr}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span></span></label></div>`;

  const field = (label, control, help = '') => `<div class="field"><label>${label}</label>${control}${help ? `<div class="help">${help}</div>` : ''}</div>`;
  const vars = (target, list) => `<div class="vars" data-target="${target}">${list.map((v) => `<code>${v}</code>`).join('')}</div>`;
  const val = (sel) => document.getElementById(sel)?.value ?? '';
  const checked = (sel) => Boolean(document.getElementById(sel)?.checked);

  // chips (multi channel select)
  const chipKind = {}; // key → 'text' | 'roles' | 'any'
  function chips(key, selected, kind = 'text') {
    chipKind[key] = kind;
    chipState[key] = [...(selected || [])];
    return `<div class="chips" data-chips="${key}"></div>`;
  }
  function renderChips(key) {
    const box = document.querySelector(`[data-chips="${key}"]`);
    if (!box) return;
    const sel = chipState[key];
    const kind = chipKind[key] || 'text';
    const pool =
      kind === 'roles'
        ? M.roles.filter((r) => !r.managed)
        : kind === 'any'
          ? [...M.categories.map((c) => ({ ...c, name: `📁 ${c.name}` })), ...M.text, ...(M.voice || []).map((c) => ({ ...c, name: `🔊 ${c.name}` }))]
          : M.text;
    const pre = kind === 'roles' ? '@ ' : kind === 'any' ? '' : '# ';
    box.innerHTML =
      sel
        .map((cid) => {
          const c = pool.find((x) => x.id === cid);
          return `<span class="chip">${pre}${esc(c?.name || cid)}<button type="button" data-rm="${cid}" aria-label="إزالة">×</button></span>`;
        })
        .join('') +
      `<select data-add>${options(pool.filter((c) => !sel.includes(c.id)), '', { placeholder: kind === 'roles' ? 'إضافة رتبة...' : 'إضافة قناة...', prefix: kind === 'any' ? '# ' : pre })}</select>`;
  }

  // ---------- list editors ----------
  function deptRow(d = {}) {
    const qs = (d.questions || []).join('\n');
    return `<div class="dept-block" data-row>
      <div class="list-item">
        <input class="input" data-f="label" placeholder="اسم القسم" maxlength="80" value="${esc(d.label || '')}">
        <input class="input" data-f="description" placeholder="وصف قصير" maxlength="100" value="${esc(d.description || '')}">
        <input class="input ltr" data-f="emoji" placeholder="<:name:id>" value="${esc(d.emoji || '')}">
        <input type="hidden" data-f="id" value="${esc(d.id || '')}">
        <button type="button" class="icon-btn" data-del>${icon('trash')}</button>
      </div>
      <details class="dept-form" ${qs ? 'open' : ''}><summary>${crown} فورم أسئلة قبل فتح التذكرة ${qs ? `(${(d.questions || []).length})` : ''}</summary>
        <textarea class="textarea" data-f="questions" rows="3" maxlength="300" placeholder="سؤال في كل سطر — حتى 5 أسئلة (45 حرف للسؤال)\nمثال: ما هو طلبك؟" ${isPrem('ticketForms') ? '' : 'disabled'}>${esc(qs)}</textarea>
        ${isPrem('ticketForms') ? '' : '<div class="help">👑 الفورم يعمل للسيرفرات البريميوم فقط.</div>'}
      </details>
      ${S.shopGuild ? `<label class="check dept-shop"><input type="checkbox" data-f="shop" ${d.shop ? 'checked' : ''}> 🛒 قسم شراء البريميوم (البوت بيعرض الخطط ويتأكد من التحويل لحاله)</label>` : ''}
    </div>`;
  }
  function replyRow(r = {}) {
    return `<div class="list-item replies" data-row>
      <input class="input" data-f="trigger" placeholder="الكلمة" maxlength="100" value="${esc(r.trigger || '')}">
      <input class="input" data-f="response" placeholder="الرد" maxlength="1800" value="${esc(r.response || '')}">
      <label class="switch" title="مطابقة تامة"><input type="checkbox" data-f="exact" ${r.exact ? 'checked' : ''}><span></span></label>
      <button type="button" class="icon-btn" data-del>${icon('trash')}</button></div>`;
  }
  function readRows(container) {
    return [...document.querySelectorAll(`#${container} [data-row]`)].map((row) => {
      const o = {};
      row.querySelectorAll('[data-f]').forEach((el) => (o[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value));
      if (typeof o.questions === 'string') o.questions = o.questions.split('\n').map((q) => q.trim()).filter(Boolean).slice(0, 5);
      return o;
    });
  }

  // ---------- sections ----------
  function sPremium() {
    const L = P.plans;
    const feats = Object.entries(P.features)
      .map(([k, f]) => `<li>${isPrem(k) ? '<span class="ok">✓</span>' : crown} ${esc(f)}${!paid() && (P.freeFeatures || []).includes(k) ? ' <span class="pill">مجاني للكل</span>' : ''}</li>`)
      .join('');
    const limits = Object.entries(P.limitLabels)
      .map(([k, label]) => {
        const f = L.free[k];
        const pr = L.premium[k];
        const show = (v) => (v === null || v === Infinity || v > 1e9 ? 'بلا حدود' : v);
        return `<tr><td>${esc(label)}</td><td>${show(f)}</td><td>${show(pr)}</td></tr>`;
      })
      .join('');
    const state = paid()
      ? `<div class="premium-state on">${crown}<div><b>السيرفر بريميوم</b><small>${P.permanent ? 'اشتراك دائم' : `ينتهي ${new Date(P.until).toLocaleDateString('ar')} — باقي ${P.daysLeft} يوم`}</small></div></div>`
      : `<div class="premium-state"><span class="crown-badge big">👑</span><div><b>الخطة المجانية</b><small>${P.expired ? 'انتهى اشتراك البريميوم السابق — إعداداتك محفوظة وترجع فور التجديد.' : 'فعّل كود بريميوم لفتح كل الميزات.'}</small></div></div>`;
    const launchNote = P.launch?.active
      ? `<div class="launch-note">${icon('gift')}<div><b>🎉 فترة الإطلاق — كل ميزات البريميوم مجانية لكل السيرفرات</b><small>${P.launch.endsAt ? `العرض لحد ${new Date(P.launch.endsAt).toLocaleDateString('ar')}. ` : ''}السيرفرات اللي بتستخدم البوت بفترة الإطلاق بتاخد شهر بريميوم هدية لما يخلص العرض.</small></div></div>`
      : '';
    return `<section class="card premium-card" id="sec-premium">
      <div class="card-body">
        ${launchNote}
        ${state}
        <div class="inline-form" style="margin-top:14px">
          <input class="input ltr" id="pr-code" placeholder="MARKA-XXXX-XXXX-XXXX" maxlength="40">
          <button class="btn primary" id="pr-redeem">${paid() ? 'تمديد بكود' : 'تفعيل الكود'}</button>
        </div>
        <div class="premium-grid">
          <div><div class="group-title">الميزات المميزة</div><ul class="feat-list">${feats}</ul></div>
          <div><div class="group-title">الحدود</div><table class="table"><thead><tr><th></th><th>مجاني</th><th>بريميوم</th></tr></thead><tbody>${limits}
            <tr><td>الردود التلقائية</td><td>بلا حدود</td><td>بلا حدود</td></tr>
            <tr><td>عدد القيفاواي</td><td>بلا حدود</td><td>بلا حدود</td></tr></tbody></table></div>
        </div>
      </div>
    </section>`;
  }

  function sBotProfile() {
    const b = S.botProfile;
    const img = (src, cls) => (src ? `<img src="${esc(src)}" class="${cls}" alt="">` : `<div class="${cls} ph"></div>`);
    return card(
      'sec-botprofile',
      `شكل البوت في السيرفر ${crown}`,
      'اسم وصورة وبانر ونبذة خاصة بالبوت داخل هذا السيرفر فقط — شكل البوت في باقي السيرفرات لا يتغير.',
      'discord',
      premiumBlock(`<div class="bp-preview">
          <div class="bp-banner" id="bp-banner-prev">${b.banner ? `<img src="${esc(b.banner)}" alt="">` : ''}</div>
          <div class="bp-avatar" id="bp-avatar-prev">${img(b.avatar, 'bp-av')}</div>
          <div class="bp-name" id="bp-name-prev">${esc(b.nick || 'MarkaBot')}</div>
        </div>
        <div class="row">
          ${field('اسم البوت في السيرفر', `<input class="input" id="bp-nick" maxlength="32" placeholder="اتركه فارغاً للاسم الأصلي" value="${esc(b.nick)}">`)}
          ${field('النبذة (Bio)', `<input class="input" id="bp-bio" maxlength="190" placeholder="حتى 190 حرف" value="${esc(b.bio)}">`)}
        </div>
        <div class="row">
          ${field('صورة البوت', `<div class="upload-line"><input type="file" id="bp-avatar-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
            <button type="button" class="btn ghost sm" data-pick="bp-avatar-file">رفع صورة</button>
            <button type="button" class="btn ghost sm" data-clear-img="avatar">إزالة</button></div>`, 'PNG / JPG / GIF — مربعة يفضل 512×512.')}
          ${field('بانر البوت', `<div class="upload-line"><input type="file" id="bp-banner-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
            <button type="button" class="btn ghost sm" data-pick="bp-banner-file">رفع بانر</button>
            <button type="button" class="btn ghost sm" data-clear-img="banner">إزالة</button></div>`, 'مقاس مقترح 680×240.')}
        </div>`, 'شكل البوت المخصص للبريميوم', 'botProfile'),
      isPrem('botProfile') ? 'botProfile' : null,
      isPrem('botProfile') ? '<button class="btn ghost" id="bp-reset">إرجاع الشكل الأصلي</button>' : ''
    );
  }

  function sGiveaway() {
    const g = S.giveaway;
    listState.bonus = g.bonusRoles || [];
    const bonusRow = (b = {}) => `<div class="list-item bonus" data-row>
        <select class="select" data-f="roleId">${roleOpts(b.roleId, 'اختر رتبة')}</select>
        <input class="input ltr" type="number" data-f="entries" min="2" max="10" value="${b.entries || 2}" title="عدد الإدخالات">
        <button type="button" class="icon-btn" data-del>${icon('trash')}</button></div>`;
    window.__bonusRow = bonusRow;
    return card(
      'sec-giveaway',
      'القيفاواي',
      'عدد القيفاواي بلا حدود للجميع. التخصيص والشروط والإدخالات الإضافية للبريميوم.',
      'gift',
      `<div class="group-title">${crown} شكل رسالة القيفاواي</div>
      ${premiumBlock(`<div class="row">
          ${field('العنوان', `<input class="input" id="gw-title" maxlength="200" placeholder="فارغ = اسم الجائزة" value="${esc(g.title)}">`)}
          ${field('لون الإمبد', `<input class="input color" type="color" id="gw-color" value="${esc(g.color || '#2b2d31')}">`)}
        </div>
        ${field('الوصف', `<textarea class="textarea" id="gw-desc" maxlength="2000" placeholder="فارغ = الشكل الافتراضي">${esc(g.description)}</textarea>${vars('gw-desc', ['{prize}', '{winners}', '{host}', '{ends}', '{endsAt}'])}`)}
        <div class="row">
          ${field('صورة الإمبد', `<input class="input ltr" id="gw-image" placeholder="https://..." value="${esc(g.imageUrl)}">`)}
          ${field('إيموجي المشاركة', `<input class="input ltr" id="gw-react" placeholder="<:name:id> أو 🎉" value="${esc(g.reaction)}">`)}
        </div>
        ${field('رسالة الفوز', `<textarea class="textarea" id="gw-win" maxlength="1000" placeholder="{gift} مبروك {winnerList}! فزتم بـ **{prize}**">${esc(g.winMessage)}</textarea>${vars('gw-win', ['{winnerList}', '{prize}', '{host}', '{gift}'])}`)}`, 'تخصيص رسالة القيفاواي للبريميوم', 'giveawayMessage')}
      <div class="group-title" style="margin-top:18px">${crown} شروط الدخول الافتراضية</div>
      ${premiumBlock(`<div class="row-3">
          ${field('رتبة مطلوبة', `<select class="select" id="gw-role">${roleOpts(g.requiredRoleId, 'بدون')}</select>`)}
          ${field('أقل عدد دعوات', `<input class="input ltr" type="number" id="gw-inv" min="0" max="10000" value="${g.minInvites || 0}">`)}
          ${field('أقل عمر للحساب (أيام)', `<input class="input ltr" type="number" id="gw-age" min="0" max="3650" value="${g.minAccountAgeDays || 0}">`)}
        </div><div class="help">تُطبق على كل قيفاواي جديد. يمكن تحديد رتبة أو دعوات خاصة لقيفاواي واحد من خيارات أمر /gstart.</div>`, 'شروط الدخول للبريميوم', 'giveawayRequirements')}
      <div class="group-title" style="margin-top:18px">${crown} إدخالات إضافية للرتب</div>
      ${premiumBlock(`<div class="list-editor" id="gw-bonus">${(g.bonusRoles || []).map(bonusRow).join('')}</div>
        <button type="button" class="btn ghost sm mt" id="gw-bonus-add">${icon('plus')} إضافة رتبة</button>
        <div class="help">مثال: رتبة البوسترز ×2 = فرصتهم بالفوز ضعف الباقين.</div>`, 'الإدخالات الإضافية للبريميوم', 'giveawayBonus')}`,
      isPrem('giveawayMessage') || isPrem('giveawayRequirements') || isPrem('giveawayBonus') ? 'giveaway' : null
    );
  }

  function sProtection() {
    const c = S.protection;
    const r = c.antiRaid;
    const n = c.antiNuke;
    const watchNames = { channelDelete: 'حذف القنوات', channelCreate: 'إنشاء القنوات', roleDelete: 'حذف الرتب', roleCreate: 'إنشاء الرتب', ban: 'الحظر', kick: 'الطرد', webhookCreate: 'إنشاء ويب هوك' };
    return card(
      'sec-protection',
      `الحماية`,
      'Anti-Raid يوقف هجمات الدخول الجماعي، و Anti-Nuke يعاقب أي شخص يخرب السيرفر بسرعة. البوت يحتاج رتبة أعلى من الأعضاء وصلاحية سجل التدقيق.',
      'shield',
      `${field('قناة تنبيهات الحماية', `<select class="select" id="p-alert">${textOpts(c.alertChannelId, 'بدون')}</select>`)}
      ${premiumBlock(`
        ${toggle('p-raid', r.enabled, 'Anti-Raid', 'عند دخول عدد كبير خلال ثوانٍ قليلة')}
        <div class="row-3">
          ${field('عدد الدخول', `<input class="input ltr" type="number" id="p-raid-joins" min="3" max="100" value="${r.joins}">`)}
          ${field('خلال (ثانية)', `<input class="input ltr" type="number" id="p-raid-sec" min="3" max="300" value="${r.seconds}">`)}
          ${field('الإجراء', `<select class="select" id="p-raid-action">
            <option value="kick" ${r.action === 'kick' ? 'selected' : ''}>طرد</option>
            <option value="ban" ${r.action === 'ban' ? 'selected' : ''}>حظر</option>
            <option value="timeout" ${r.action === 'timeout' ? 'selected' : ''}>إسكات ساعة</option></select>`)}
        </div>
        <div class="row">
          ${field('منع الحسابات الأحدث من (أيام)', `<input class="input ltr" type="number" id="p-raid-age" min="0" max="365" value="${r.newAccountDays}">`, '0 = معطل. يطبق الإجراء على أي حساب جديد يدخل.')}
          <div class="field"><label>&nbsp;</label>${toggle('p-raid-lock', r.lockdown, 'رفع مستوى التحقق أثناء الهجوم', 'لمدة 10 دقائق ثم يرجع تلقائياً')}</div>
        </div>
      `, 'Anti-Raid للبريميوم', 'antiRaid')}
        <div style="height:12px"></div>
      ${premiumBlock(`
        ${toggle('p-nuke', n.enabled, 'Anti-Nuke', 'عند تكرار إجراء تخريبي من نفس الشخص')}
        <div class="row-3">
          ${field('الحد المسموح', `<input class="input ltr" type="number" id="p-nuke-limit" min="1" max="50" value="${n.limit}">`)}
          ${field('خلال (ثانية)', `<input class="input ltr" type="number" id="p-nuke-sec" min="5" max="600" value="${n.seconds}">`)}
          ${field('العقوبة', `<select class="select" id="p-nuke-punish">
            <option value="strip" ${n.punishment === 'strip' ? 'selected' : ''}>سحب جميع الرتب</option>
            <option value="kick" ${n.punishment === 'kick' ? 'selected' : ''}>طرد</option>
            <option value="ban" ${n.punishment === 'ban' ? 'selected' : ''}>حظر</option></select>`)}
        </div>
        <div class="field"><label>الإجراءات المراقبة</label><div class="check-grid">${Object.entries(watchNames)
          .map(([k, label]) => `<label class="check"><input type="checkbox" data-watch="${k}" ${n.watch?.[k] ? 'checked' : ''}> ${label}</label>`)
          .join('')}</div></div>
        ${field('قائمة الاستثناء (آيديات أشخاص أو بوتات)', `<input class="input ltr" id="p-nuke-white" placeholder="123..., 456..." value="${esc((n.whitelist || []).join(', '))}">`, 'مالك السيرفر ومالك البوت مستثنون تلقائياً.')}
      `, 'Anti-Nuke للبريميوم', 'antiNuke')}
      <div style="height:12px"></div>
      ${premiumBlock(`${toggle('p-imp', S.protection.impersonation?.enabled, 'كشف انتحال الإدارة', 'إذا حدا غيّر اسمه أو صورته لتشبه إداري (حتى مع تغيير حرف أو استبدال o بـ 0)')}
        ${field('الإجراء', `<select class="select" id="p-imp-action" style="max-width:240px">${[['alert', 'تنبيه بقناة الحماية'], ['timeout', 'إسكات 24 ساعة'], ['kick', 'طرد'], ['ban', 'حظر']].map(([k, t]) => `<option value="${k}" ${S.protection.impersonation?.action === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}`, 'كشف انتحال الإدارة للبريميوم', 'impersonation')}`,
      'protection'
    );
  }

  function sGuildEmojis() {
    if (!GEMO) return '';
    const names = { ui: 'الواجهة', systems: 'الأنظمة', logs: 'السجلات', giveaway: 'القيفاواي' };
    const body = Object.entries(GEMO.groups)
      .map(
        ([g, keys]) => `<div class="group-title">${names[g]}</div><div class="emoji-grid">${keys
          .map((k) => {
            const it = GEMO.items.find((x) => x.key === k);
            return `<div class="emoji-item"><div class="prev" data-gprev="${k}">${emojiPreview(it.value) || emojiPreview(it.fallback) || esc(it.fallback)}</div>
              <div class="key">${k}</div>
              <input class="input ltr" data-gemoji="${k}" placeholder="<:name:id>" value="${esc(it.value)}"></div>`;
          })
          .join('')}</div>`
      )
      .join('');
    const picker = GEMO.serverEmojis.length
      ? `<div class="field"><label>إيموجيات سيرفرك — اضغط على حقل ثم على الإيموجي</label><div class="emoji-picker">${GEMO.serverEmojis
          .map((e) => `<button type="button" class="emo-btn" data-pick-emoji="${esc(e.value)}" title=":${esc(e.name)}:"><img src="https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=48" alt=""></button>`)
          .join('')}</div></div>`
      : '';
    return card(
      'sec-gemojis',
      `إيموجيات البوت في السيرفر ${crown}`,
      'استبدل إيموجيات البوت بإيموجيات سيرفرك — تظهر في كل رسائل وأزرار البوت داخل هذا السيرفر. الحقول الفارغة تستخدم الإيموجي العام.',
      'smile',
      premiumBlock(picker + body, 'إيموجيات السيرفر للبريميوم', 'guildEmojis'),
      isPrem('guildEmojis') ? 'gemojis' : null
    );
  }

  function sGeneral() {
    return card(
      'sec-general',
      'الإعدادات العامة',
      'البادئة النصية ورتبة إدارة البوت.',
      'sliders',
      `<div class="row">
        ${field('البادئة النصية', `<input class="input ltr" id="g-prefix" maxlength="5" placeholder="مثال: $" value="${esc(S.prefix.prefix)}">`, 'اتركها فارغة ليعمل البوت بأوامر السلاش فقط.')}
        ${field('رتبة إدارة البوت', `<select class="select" id="g-manager">${roleOpts(S.general.managerRoleId, 'بدون')}</select>`, 'تمنح أصحابها صلاحية أوامر الإدارة واستلام التذاكر ودخول اللوحة.')}
      </div>`,
      'general'
    );
  }

  function sWelcome() {
    const w = S.welcome;
    const g = S.greetings;
    const num = (idA, v, min, max, lbl) => field(lbl, `<input class="input ltr" type="number" id="${idA}" min="${min}" max="${max}" value="${v}" data-wl>`);
    const alignSel = (idA, v) => `<select class="select" id="${idA}" data-wl>
      <option value="right" ${v === 'right' ? 'selected' : ''}>يمين</option>
      <option value="center" ${v === 'center' ? 'selected' : ''}>وسط</option>
      <option value="left" ${v === 'left' ? 'selected' : ''}>يسار</option></select>`;
    return card(
      'sec-welcome',
      'الترحيب',
      'ترحيب متقدم بصورة مخصصة، وترحيب نصي مؤقت.',
      'wave',
      `${toggle('w-enabled', w.enabled, 'الترحيب المتقدم', 'رسالة مع صورة خلفية وأفتار العضو')}
      <div class="row">
        ${field('قناة الترحيب', `<select class="select" id="w-channel">${textOpts(w.channelId)}</select>`)}
        ${field('صورة الخلفية (1024×500)', `<div class="upload-line"><input type="file" id="w-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
          <button type="button" class="btn ghost sm" data-pick="w-file">${icon('plus')} رفع صورة</button>
          <input class="input ltr" id="w-image" placeholder="أو الصق رابط https://..." value="${esc(w.imageUrl)}"></div>`)}
      </div>
      ${field('رسالة الترحيب', `<textarea class="textarea" id="w-message" maxlength="1800" placeholder="أهلاً {user} في {server}">${esc(w.message)}</textarea>${vars('w-message', ['{user}', '{username}', '{server}', '{membercount}', '{inviter}', '{invites}'])}`)}

      <div class="wel-editor">
        <div class="wel-tools">
          <div class="seg" id="w-seg">
            <button type="button" data-el="avatar" class="on">الأفتار</button>
            <button type="button" data-el="name">اسم العضو ${isPrem('welcomeEditor') ? '' : '👑'}</button>
            <button type="button" data-el="text">النص ${isPrem('welcomeEditor') ? '' : '👑'}</button>
          </div>
          <span class="faint wel-hint">اسحب العناصر بالماوس أو بإصبعك لتحديد مكانها</span>
        </div>
        <div class="wel-stage"><canvas id="w-canvas" width="1024" height="500"></canvas></div>
      </div>

      <div class="wel-panel" data-panel="avatar">
        <div class="row-3">
          ${num('w-x', w.avatarX, 0, 1024, 'الموقع الأفقي X')}
          ${num('w-y', w.avatarY, 0, 500, 'الموقع العمودي Y')}
          ${num('w-r', w.avatarRadius, 20, 250, 'الحجم (نصف القطر)')}
        </div>
        ${premiumBlock(`<div class="row-3">
          ${field('الشكل', `<select class="select" id="w-shape" data-wl>
            <option value="circle" ${w.avatarShape === 'circle' ? 'selected' : ''}>دائرة</option>
            <option value="rounded" ${w.avatarShape === 'rounded' ? 'selected' : ''}>مربع بحواف دائرية</option>
            <option value="square" ${w.avatarShape === 'square' ? 'selected' : ''}>مربع</option></select>`)}
          ${field('لون الإطار', `<input class="input color" type="color" id="w-bcolor" value="${esc(w.avatarBorderColor)}" data-wl>`)}
          ${num('w-bwidth', w.avatarBorderWidth, 0, 30, 'سماكة الإطار')}
        </div>`, 'شكل الأفتار والإطار للبريميوم', 'welcomeEditor')}
      </div>

      <div class="wel-panel" data-panel="name" hidden>
        ${premiumBlock(`${toggle('w-name-on', w.nameEnabled, 'إظهار اسم العضو على الصورة')}
        <div class="row-3">
          ${num('w-nx', w.nameX, 0, 1024, 'X')}
          ${num('w-ny', w.nameY, 0, 500, 'Y')}
          ${num('w-ns', w.nameSize, 10, 140, 'حجم الخط')}
        </div>
        <div class="row">
          ${field('اللون', `<input class="input color" type="color" id="w-nc" value="${esc(w.nameColor)}" data-wl>`)}
          ${field('المحاذاة', alignSel('w-na', w.nameAlign))}
        </div>`, 'اسم العضو على الصورة للبريميوم', 'welcomeEditor')}
      </div>

      <div class="wel-panel" data-panel="text" hidden>
        ${premiumBlock(`${toggle('w-text-on', w.textEnabled, 'إظهار نص إضافي على الصورة')}
        ${field('النص', `<input class="input" id="w-text" maxlength="120" value="${esc(w.text)}" data-wl>${vars('w-text', ['{username}', '{server}', '{membercount}'])}`)}
        <div class="row-3">
          ${num('w-tx', w.textX, 0, 1024, 'X')}
          ${num('w-ty', w.textY, 0, 500, 'Y')}
          ${num('w-ts', w.textSize, 10, 140, 'حجم الخط')}
        </div>
        <div class="row">
          ${field('اللون', `<input class="input color" type="color" id="w-tc" value="${esc(w.textColor)}" data-wl>`)}
          ${field('المحاذاة', alignSel('w-ta', w.textAlign))}
        </div>`, 'النص على الصورة للبريميوم', 'welcomeEditor')}
      </div>

      <div style="height:10px"></div>
      ${toggle('gr-enabled', g.enabled, 'الترحيب النصي', 'رسالة نصية بسيطة يمكن حذفها تلقائياً')}
      <div class="row">
        ${field('القنوات (حتى 10)', chips('grch', g.channelIds || (g.channelId ? [g.channelId] : [])), 'الرسالة بتنبعت بكل القنوات المختارة.')}
        ${field('مدة البقاء (ثواني، 0 = دائمة)', `<input class="input ltr" type="number" id="gr-duration" min="0" max="3600" value="${g.duration || 0}">`)}
      </div>
      ${field('الرسالة', `<textarea class="textarea" id="gr-message" maxlength="1800">${esc(g.message)}</textarea>${vars('gr-message', ['{user}', '{username}', '{server}', '{membercount}'])}`)}`,
      'welcome',
      '<button class="btn ghost" id="w-test">إرسال تجربة</button>'
    );
  }

  // ---------- welcome image editor ----------
  const WE = {
    W: 1024,
    H: 500,
    bg: null,
    bgSrc: '',
    selected: 'avatar',
    drag: null,
    font: 'MarkaSans',
    ready: false,
  };

  function weState() {
    const n = (idA, def) => {
      const v = parseInt(val(idA), 10);
      return Number.isFinite(v) ? v : def;
    };
    const prem = isPrem('welcomeEditor');
    return {
      avatar: { x: n('w-x', 512), y: n('w-y', 210), r: n('w-r', 100), shape: prem ? val('w-shape') || 'circle' : 'circle', bcolor: prem ? val('w-bcolor') || '#ffffff' : '#ffffff', bwidth: prem ? n('w-bwidth', 6) : 6 },
      name: { on: prem && checked('w-name-on'), x: n('w-nx', 512), y: n('w-ny', 360), size: n('w-ns', 46), color: val('w-nc') || '#ffffff', align: val('w-na') || 'center', text: MB.me?.username || 'Username' },
      text: {
        on: prem && checked('w-text-on'),
        x: n('w-tx', 512),
        y: n('w-ty', 420),
        size: n('w-ts', 30),
        color: val('w-tc') || '#e5e7eb',
        align: val('w-ta') || 'center',
        text: (val('w-text') || '').replace(/{user}|{username}/g, MB.me?.username || 'Username').replace(/{server}/g, MB.guildName || 'Server').replace(/{membercount}/g, '1234'),
      },
    };
  }

  function weShape(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'square' || shape === 'rounded') {
      const rad = shape === 'rounded' ? r * 0.28 : 0;
      const l = x - r;
      const t = y - r;
      const sz = r * 2;
      ctx.moveTo(l + rad, t);
      ctx.arcTo(l + sz, t, l + sz, t + sz, rad);
      ctx.arcTo(l + sz, t + sz, l, t + sz, rad);
      ctx.arcTo(l, t + sz, l, t, rad);
      ctx.arcTo(l, t, l + sz, t, rad);
    } else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
  }

  function weTextBox(ctx, el) {
    ctx.font = `bold ${el.size}px "${WE.font}", sans-serif`;
    const w = Math.max(20, ctx.measureText(el.text || ' ').width);
    const left = el.align === 'left' ? el.x : el.align === 'right' ? el.x - w : el.x - w / 2;
    return { left, top: el.y - el.size * 0.6, w, h: el.size * 1.2 };
  }

  function weDrawText(ctx, el) {
    if (!el.text) return;
    ctx.save();
    ctx.font = `bold ${el.size}px "${WE.font}", sans-serif`;
    ctx.fillStyle = el.color;
    ctx.textAlign = el.align;
    ctx.textBaseline = 'middle';
    const strong = (el.text.match(/[A-Za-z֐-ࣿ]/) || [''])[0];
    ctx.direction = /[֐-ࣿ]/.test(strong) ? 'rtl' : 'ltr';
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillText(el.text, el.x, el.y);
    ctx.restore();
  }

  function weDraw() {
    const cv = document.getElementById('w-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const st = weState();
    ctx.clearRect(0, 0, WE.W, WE.H);

    // background
    if (WE.bg) {
      const sc = Math.max(WE.W / WE.bg.width, WE.H / WE.bg.height);
      const bw = WE.bg.width * sc;
      const bh = WE.bg.height * sc;
      ctx.drawImage(WE.bg, (WE.W - bw) / 2, (WE.H - bh) / 2, bw, bh);
    } else {
      const gr = ctx.createLinearGradient(0, 0, WE.W, WE.H);
      gr.addColorStop(0, '#1d1733');
      gr.addColorStop(1, '#2b1d4f');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, WE.W, WE.H);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.font = `bold 26px "${WE.font}", sans-serif`;
      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      ctx.fillText('ارفع صورة الخلفية', WE.W / 2, 40);
    }

    // avatar placeholder (blue) — the member's avatar goes here
    const a = st.avatar;
    ctx.save();
    weShape(ctx, a.shape, a.x, a.y, a.r);
    ctx.clip();
    const ag = ctx.createLinearGradient(a.x - a.r, a.y - a.r, a.x + a.r, a.y + a.r);
    ag.addColorStop(0, '#3b82f6');
    ag.addColorStop(1, '#1d4ed8');
    ctx.fillStyle = ag;
    ctx.fillRect(a.x - a.r, a.y - a.r, a.r * 2, a.r * 2);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; // person silhouette
    ctx.beginPath();
    ctx.arc(a.x, a.y - a.r * 0.18, a.r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(a.x, a.y + a.r * 0.62, a.r * 0.62, a.r * 0.45, 0, Math.PI, 0);
    ctx.fill();
    ctx.restore();
    if (a.bwidth > 0) {
      ctx.strokeStyle = a.bcolor;
      ctx.lineWidth = a.bwidth;
      weShape(ctx, a.shape, a.x, a.y, a.r);
      ctx.stroke();
    }

    if (st.name.on) weDrawText(ctx, st.name);
    if (st.text.on) weDrawText(ctx, st.text);

    // selection outline
    ctx.save();
    ctx.setLineDash([10, 7]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#d946ef';
    if (WE.selected === 'avatar') ctx.strokeRect(a.x - a.r - 8, a.y - a.r - 8, a.r * 2 + 16, a.r * 2 + 16);
    else if (st[WE.selected]?.on) {
      const b = weTextBox(ctx, st[WE.selected]);
      ctx.strokeRect(b.left - 8, b.top - 6, b.w + 16, b.h + 12);
    }
    ctx.restore();
  }

  function weLoadBg(src) {
    if (!src || src === WE.bgSrc) {
      if (!src) {
        WE.bg = null;
        WE.bgSrc = '';
      }
      return weDraw();
    }
    WE.bgSrc = src;
    const img = new Image();
    img.onload = () => {
      if (WE.bgSrc === src) {
        WE.bg = img;
        weDraw();
      }
    };
    img.onerror = () => {
      WE.bg = null;
      weDraw();
    };
    img.src = src;
  }

  function weSelect(el) {
    WE.selected = el;
    document.querySelectorAll('#w-seg [data-el]').forEach((b) => b.classList.toggle('on', b.dataset.el === el));
    document.querySelectorAll('.wel-panel').forEach((p) => (p.hidden = p.dataset.panel !== el));
    weDraw();
  }

  function weBind() {
    const cv = document.getElementById('w-canvas');
    if (!cv) return;
    const ids = { avatar: ['w-x', 'w-y'], name: ['w-nx', 'w-ny'], text: ['w-tx', 'w-ty'] };
    const toCanvas = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * WE.W, y: ((e.clientY - r.top) / r.height) * WE.H };
    };
    const hit = (p) => {
      const st = weState();
      const ctx = cv.getContext('2d');
      for (const k of ['text', 'name']) {
        if (!st[k].on) continue;
        const b = weTextBox(ctx, st[k]);
        if (p.x >= b.left - 10 && p.x <= b.left + b.w + 10 && p.y >= b.top - 10 && p.y <= b.top + b.h + 10) return k;
      }
      const a = st.avatar;
      if (Math.abs(p.x - a.x) <= a.r + 6 && Math.abs(p.y - a.y) <= a.r + 6) return 'avatar';
      return null;
    };
    cv.addEventListener('pointerdown', (e) => {
      const p = toCanvas(e);
      const el = hit(p);
      if (!el) return;
      if (el !== 'avatar' && !isPrem('welcomeEditor')) return;
      weSelect(el);
      const [ix, iy] = ids[el];
      WE.drag = { el, dx: p.x - parseInt(val(ix), 10), dy: p.y - parseInt(val(iy), 10) };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('dragging');
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => {
      const p = toCanvas(e);
      if (!WE.drag) {
        cv.style.cursor = hit(p) ? 'grab' : 'default';
        return;
      }
      const [ix, iy] = ids[WE.drag.el];
      document.getElementById(ix).value = Math.round(Math.min(WE.W, Math.max(0, p.x - WE.drag.dx)));
      document.getElementById(iy).value = Math.round(Math.min(WE.H, Math.max(0, p.y - WE.drag.dy)));
      weDraw();
    });
    const stop = () => {
      WE.drag = null;
      cv.classList.remove('dragging');
    };
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);

    document.getElementById('w-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-el]');
      if (b) weSelect(b.dataset.el);
    });
    document.getElementById('sec-welcome').addEventListener('input', (e) => {
      if (e.target.matches('[data-wl], #w-name-on, #w-text-on')) weDraw();
      if (e.target.id === 'w-image') weLoadBg(e.target.value.trim());
    });
    document.getElementById('sec-welcome').addEventListener('change', (e) => {
      if (e.target.matches('[data-wl], #w-name-on, #w-text-on')) weDraw();
    });

    const font = new FontFace(WE.font, 'url(/fonts/DejaVuSans-Bold.ttf)', { weight: 'bold' });
    font
      .load()
      .then((f) => {
        document.fonts.add(f);
        weDraw();
      })
      .catch(() => weDraw());
    weLoadBg(val('w-image').trim());
  }

  /** Reads an image file, shrinking big ones so uploads stay small. */
  function readImage(file, { maxW = 1600, maxH = 1600, square = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('لم يتم اختيار ملف'));
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return reject(new Error('الصيغة غير مدعومة'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
      reader.onload = () => {
        const data = reader.result;
        if (file.type === 'image/gif') {
          if (file.size > 8 * 1024 * 1024) return reject(new Error('حجم الصورة أكبر من 8MB'));
          return resolve(data); // keep animation
        }
        const img = new Image();
        img.onload = () => {
          let { width: w, height: h } = img;
          let sx = 0;
          let sy = 0;
          let sw = w;
          let sh = h;
          if (square) {
            const m = Math.min(w, h);
            sx = (w - m) / 2;
            sy = (h - m) / 2;
            sw = sh = w = h = m;
          }
          const sc = Math.min(1, maxW / w, maxH / h);
          const c = document.createElement('canvas');
          c.width = Math.round(w * sc);
          c.height = Math.round(h * sc);
          c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
          resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9));
        };
        img.onerror = () => reject(new Error('الملف ليس صورة صالحة'));
        img.src = data;
      };
      reader.readAsDataURL(file);
    });
  }

  function sTickets() {
    const t = S.tickets;
    listState.depts = t.departments;
    return card(
      'sec-tickets',
      'نظام التذاكر',
      'الأقسام، فريق الدعم، اللوحة، والسجلات مع نسخ HTML وتقييمات.',
      'ticket',
      `<div class="row">
        ${field('تصنيف التذاكر', `<select class="select" id="t-category">${catOpts(t.categoryId)}</select>`)}
        ${field('قناة السجلات والنسخ', `<select class="select" id="t-log">${textOpts(t.logChannelId)}</select>`)}
      </div>
      <div class="row-3">
        ${field('رتبة فريق الدعم', `<select class="select" id="t-role">${roleOpts(t.supportRoleId)}</select>`)}
        ${field(`تذاكر مفتوحة لكل عضو ${P.limits.ticketMaxOpen < 5 ? crown : ''}`, `<input class="input ltr" type="number" id="t-max" min="1" max="${Math.max(P.limits.ticketMaxOpen, t.maxOpen || 1)}" value="${t.maxOpen || 1}">`, P.limits.ticketMaxOpen < 5 ? `المجاني: ${P.limits.ticketMaxOpen} — البريميوم: حتى 5` : '')}
        ${field('مهلة الاستدعاء (ثواني)', `<input class="input ltr" type="number" id="t-cd" min="60" max="86400" value="${t.alertCooldown}">`)}
      </div>
      <div class="row">
        ${field('عنوان اللوحة', `<input class="input" id="t-title" maxlength="100" value="${esc(t.panelTitle)}">`)}
        ${field('رابط البانر', `<input class="input ltr" id="t-banner" placeholder="https://..." value="${esc(t.bannerUrl)}">`)}
      </div>
      ${field('قوانين اللوحة', `<textarea class="textarea" id="t-desc" maxlength="3000" placeholder="اتركها فارغة لاستخدام القوانين الافتراضية">${esc(t.panelDescription)}</textarea>`)}
      <div class="field"><label>الأقسام (حتى ${P.limits.ticketDepartments}${isPrem() ? '' : ` — البريميوم ${P.plans.premium.ticketDepartments} ${crown}`})</label>
        <div class="list-editor" id="t-depts">${t.departments.map(deptRow).join('')}</div>
        <button type="button" class="btn ghost sm mt" id="t-add">${icon('plus')} إضافة قسم</button>
        <div class="help">الإيموجي اختياري ويجب أن يكون إيموجي مخصص بصيغة &lt;:name:id&gt;.</div>
      </div>
      <div class="toggle-line" style="margin-top:18px"><div><b>إرسال لوحة التذاكر</b><small>احفظ الإعدادات أولاً ثم اختر القناة</small></div>
        <div style="display:flex;gap:8px;min-width:280px"><select class="select" id="t-panel-ch">${textOpts('', 'اختر قناة')}</select>
        <button type="button" class="btn" id="t-send">${icon('send')} إرسال</button></div></div>
      <div class="group-title" style="margin-top:18px">${crown} الإغلاق التلقائي</div>
      ${premiumBlock(field('إغلاق التذكرة بعد عدم النشاط (ساعات، 0 = معطل)', `<input class="input ltr" type="number" id="t-auto" min="0" max="720" value="${t.autoCloseHours || 0}">`, 'يتم تنبيه صاحب التذكرة قبل الإغلاق بساعة.'), 'الإغلاق التلقائي للبريميوم', 'ticketAutoClose')}
      <div class="group-title" style="margin-top:18px">${crown} إحصائيات التذاكر</div>
      <div id="t-analytics">${isPrem('ticketStats') ? '<div class="faint">جاري التحميل...</div>' : premiumBlock('<div class="stat-grid"><div class="stat-mini"><b>—</b><small>تذاكر مفتوحة</small></div><div class="stat-mini"><b>—</b><small>متوسط أول رد</small></div><div class="stat-mini"><b>—</b><small>متوسط المدة</small></div><div class="stat-mini"><b>—</b><small>متوسط التقييم</small></div></div>', 'إحصائيات التذاكر للبريميوم', 'ticketStats')}</div>
      <div class="field" style="margin-top:14px"><label>إحصائيات فريق الدعم</label><div id="t-staff" class="faint">جاري التحميل...</div></div>`,
      'tickets'
    );
  }

  function sJail() {
    const j = S.jail;
    const rows = j.jailed.length
      ? `<table class="table"><thead><tr><th>العضو</th><th>السبب</th><th>ينتهي</th><th></th></tr></thead><tbody>${j.jailed
          .map(
            (x) => `<tr><td class="ltr" style="text-align:right">${esc(x.userId)}</td><td>${esc(x.reason)}</td><td>${x.until ? new Date(x.until).toLocaleString('ar') : 'غير محدد'}</td>
          <td style="text-align:left"><button class="btn sm ghost" data-release="${x.userId}">تحرير</button></td></tr>`
          )
          .join('')}</tbody></table>`
      : '<div class="empty" style="padding:18px">لا يوجد أعضاء مسجونون حالياً.</div>';
    return card(
      'sec-jail',
      'نظام السجن',
      'يتم حفظ رتب العضو واسترجاعها تلقائياً عند انتهاء المدة أو التحرير.',
      'lock',
      `<div class="row-3">
        ${field('رتبة السجن', `<select class="select" id="j-role">${roleOpts(j.roleId)}</select>`)}
        ${field('قناة العزل', `<select class="select" id="j-channel">${textOpts(j.channelId)}</select>`)}
        ${field('قناة طلبات العفو', `<select class="select" id="j-log">${textOpts(j.logChannelId, 'قناة سجل الإدارة')}</select>`)}
      </div>
      <div class="field mt"><label>المسجونون حالياً</label>${rows}</div>`,
      'jail'
    );
  }

  function sVanity() {
    const v = S.vanity;
    return card(
      'sec-vanity',
      'حماية الرابط المخصص',
      v.current ? `الرابط الحالي: discord.gg/${esc(v.current)}` : 'هذا السيرفر لا يملك رابطاً مخصصاً.',
      'shield',
      `${toggle('v-enabled', v.vanityProtect, 'تفعيل الحماية', 'معاقبة اللي بيغيّر الرابط فوراً، وتنبيه عاجل لمالك السيرفر بالخاص فيه الرابط القديم عشان يرجّعه', !v.current)}
      <div class="help">ديسكورد ما بيسمح للبوتات تغيّر الرابط المخصص، فالبوت ما بيقدر يرجّعه بنفسه. أقوى حماية إنك تعطي صلاحية Manage Server بس للناس اللي بتثق فيهم.</div>
      <div class="row">
        ${field('العقوبة', `<select class="select" id="v-punish">
          <option value="ban" ${v.punishment === 'ban' ? 'selected' : ''}>حظر نهائي</option>
          <option value="kick" ${v.punishment === 'kick' ? 'selected' : ''}>طرد</option>
          <option value="strip" ${v.punishment === 'strip' ? 'selected' : ''}>سحب جميع الرتب</option></select>`)}
        ${field('قائمة الاستثناء (آيديات)', `<input class="input ltr" id="v-white" placeholder="123..., 456..." value="${esc((v.whitelist || []).join(', '))}">`, 'مالك السيرفر ومالك البوت مستثنون تلقائياً.')}
      </div>`,
      'vanity'
    );
  }

  function sLogs() {
    return card(
      'sec-logs',
      'السجلات',
      'اختر قناة لكل نوع، أو نفس القناة للجميع.',
      'log',
      `<div class="row">${M.logTypes
        .map((t) => field(esc(t.label), `<select class="select" data-log="${t.key}">${textOpts(S.logs[t.key], 'معطل')}</select>`))
        .join('')}</div>
      <div class="vars" style="margin-top:12px"><code id="logs-all" style="direction:rtl">تعيين قناة واحدة للجميع</code></div>`,
      'logs'
    );
  }

  function sInvites() {
    const i = S.invites;
    return card(
      'sec-invites',
      'الدعوات والنقاط',
      'تتبع الداعين ومنح النقاط لعجلة الحظ.',
      'users',
      `${toggle('i-wheel', i.wheelEnabled, 'تشغيل عجلة الحظ', 'وهي موقفة: ما حدا بيقدر يلف، والدعوات الجديدة ما بتعطي نقاط. النقاط الحالية محفوظة.')}
      <div class="row">
        ${field('قناة سجل الدعوات', `<select class="select" id="i-log">${textOpts(i.logChannelId, 'معطل')}</select>`)}
        ${field('أقل عمر للحساب لاحتساب النقطة (أيام)', `<input class="input ltr" type="number" id="i-age" min="0" max="365" value="${i.minAccountAgeDays}">`, 'الحسابات الأحدث تُحسب كدعوات وهمية.')}
      </div>
      ${field('مدة البقاء قبل احتساب نقطة العجلة (ساعات)', `<input class="input ltr" type="number" id="i-hold" min="0" max="720" value="${i.pointHoldHours || 0}">`, 'الداعي ما بياخد النقطة إلا إذا العضو الجديد ضل بالسيرفر هالمدة. 0 = فوراً. ننصح بـ 24. وإذا طلع العضو بعد ما انحسبت النقطة، بتنسحب.')}
      ${premiumBlock(
        field(
          `صورة العجلة ${crown}`,
          `<div class="upload-line"><input type="file" id="i-wheel-file" accept="image/png,image/jpeg,image/webp" hidden>
          <button type="button" class="btn ghost sm" data-pick="i-wheel-file">${icon('plus')} رفع صورة</button>
          <input class="input ltr" id="i-wheel-img" placeholder="أو الصق رابط https://..." value="${esc(i.wheelImage || '')}"></div>`,
          'الصورة بتنحط جوا العجلة وبتلف معها. اتركها فاضية عشان تضل صورة ماركا بوت. الأفضل صورة مربعة.'
        ),
        'صورة العجلة الخاصة للبريميوم',
        'wheelImage'
      )}`,
      'invites'
    );
  }

  function sAutoLine() {
    const a = S.autoLine;
    return card(
      'sec-autoline',
      'الخط التلقائي',
      'إرسال صورة فاصل بعد كل رسالة في القنوات المحددة.',
      'line',
      `${toggle('a-enabled', a.enabled, 'تفعيل الخط التلقائي')}
      ${field('القنوات', chips('autoline', a.channels))}
      ${field('رابط صورة الخط', `<input class="input ltr" id="a-image" placeholder="https://..." value="${esc(a.imageUrl)}">`)}`,
      'autoLine'
    );
  }

  function sFeedback() {
    const f = S.feedback;
    return card(
      'sec-feedback',
      'قنوات الآراء',
      'تحويل رسائل الأعضاء إلى إمبد مع تفاعلات.',
      'chat',
      `${toggle('f-enabled', f.enabled, 'تفعيل الآراء')}
      ${field('القنوات', chips('feedback', f.channels))}
      ${field('إيموجيات التفاعل', `<input class="input ltr" id="f-emojis" placeholder="<:up:123>, <:down:456>" value="${esc((f.emojis || []).map((e) => (/^\w+:\d+$/.test(e) ? `<:${e}>` : e)).join(', '))}">`, 'اتركها فارغة لاستخدام upvote و downvote من مدير الإيموجيات.')}`,
      'feedback'
    );
  }

  function boostRow(kind, idv = '', mult = 2) {
    const sel = kind === 'role' ? `<select class="select" data-k="id">${roleOpts(idv, 'اختر رتبة')}</select>` : `<select class="select" data-k="id">${textOpts(idv, 'اختر قناة')}</select>`;
    return `<div class="list-item boost-row" data-boost="${kind}"><span class="pill">${kind === 'role' ? 'رتبة' : 'قناة'}</span>${sel}<input class="input ltr" type="number" data-k="mult" min="1" max="5" step="0.1" value="${mult}"><button type="button" class="icon-btn" data-del>×</button></div>`;
  }
  function sLevels() {
    const L = S.levels;
    const rewardRow = (r = {}) => `<div class="list-item lvl-reward" data-row>
        <input class="input ltr" type="number" data-f="level" min="1" max="500" placeholder="اللفل" value="${r.level || ''}" title="اللفل">
        <select class="select" data-f="roleId">${roleOpts(r.roleId, 'اختر رتبة')}</select>
        <select class="select" data-f="type"><option value="text" ${r.type !== 'voice' ? 'selected' : ''}>كتابة</option><option value="voice" ${r.type === 'voice' ? 'selected' : ''}>فويس</option></select>
        <button type="button" class="icon-btn" data-del>${icon('trash')}</button></div>`;
    window.__rewardRow = rewardRow;
    const mode = (v, t) => `<option value="${v}" ${L.announce === v ? 'selected' : ''}>${t}</option>`;
    return (
      card(
        'sec-levels',
        'إعدادات المستويات',
        'XP للكتابة والفويس، رسالة الترقية، ورتب المكافآت. مجاني لكل السيرفرات.',
        'trophy',
        `${toggle('lv-enabled', L.enabled, 'تفعيل نظام المستويات', 'الأعضاء بياخدوا XP على الرسائل والوقت بالفويس')}
        <div class="group-title" style="margin-top:14px">XP الكتابة</div>
        <div class="row-3">
          ${field('أقل XP للرسالة', `<input class="input ltr" type="number" id="lv-min" min="1" max="100" value="${L.textMin}">`)}
          ${field('أعلى XP للرسالة', `<input class="input ltr" type="number" id="lv-max" min="1" max="200" value="${L.textMax}">`)}
          ${field('الانتظار بين الرسائل (ثانية)', `<input class="input ltr" type="number" id="lv-cd" min="0" max="3600" value="${L.cooldown}">`, 'ضد السبام: رسالة وحدة بتحسب كل هالمدة.')}
        </div>
        ${field('أقل طول للرسالة (حروف)', `<input class="input ltr" type="number" id="lv-len" min="0" max="50" value="${L.minLength}" style="max-width:160px">`, 'الرسائل الأقصر، والرسائل المكررة ورا بعض، ما بتاخد XP. الصور والملصقات بتحسب.')}
        <div class="group-title" style="margin-top:14px">XP الفويس</div>
        <div class="row">
          ${field('XP بالدقيقة', `<input class="input ltr" type="number" id="lv-voice" min="0" max="100" value="${L.voicePerMin}">`, '0 = إيقاف XP الفويس.')}
          <div>${toggle('lv-voice-others', L.voiceRequireOthers, 'لازم يكون مع حدا', 'اللي قاعد لحاله أو عامل ديفن ما بياخد XP')}</div>
        </div>
        <div class="group-title" style="margin-top:14px">رسالة الترقية</div>
        <div class="row">
          ${field('وين تنرسل', `<select class="select" id="lv-announce">${mode('current', 'بنفس القناة')}${mode('channel', 'بقناة محددة')}${mode('dm', 'بالخاص')}${mode('off', 'مقفلة')}</select>`)}
          ${field('القناة', `<select class="select" id="lv-channel">${textOpts(L.announceChannelId, 'اختر قناة')}</select>`, 'بس لما تختار "بقناة محددة".')}
        </div>
        ${field('نص الرسالة', `<textarea class="textarea" id="lv-msg" maxlength="1000">${esc(L.message)}</textarea>${vars('lv-msg', ['{user}', '{username}', '{level}', '{server}', '{type}'])}`)}
        <div class="group-title" style="margin-top:14px">رتب المكافآت</div>
        <div class="list-editor" id="lv-rewards">${(L.rewards || []).map(rewardRow).join('')}</div>
        <button type="button" class="btn ghost sm mt" id="lv-reward-add">${icon('plus')} إضافة مكافأة</button>
        ${toggle('lv-stack', L.stackRewards, 'خلي الرتب القديمة', 'إذا مسكّرة: لما ياخد رتبة لفل أعلى بتنشال اللي قبلها')}
        <div class="group-title" style="margin-top:14px">بدون XP</div>
        ${field('قنوات وكاتيجوري ما بتعطي XP', chips('lvch', L.noXpChannels, 'any'))}
        ${field('رتب ما بتاخد XP', chips('lvroles', L.noXpRoles, 'roles'))}
        <div class="group-title" style="margin-top:14px">${crown} بطاقة الرانك ومضاعفة XP</div>
        ${premiumBlock(`<div class="row">
            ${field('لون البطاقة', `<input class="input ltr" type="color" id="lvc-accent" value="${esc(L.card?.accent || '#7950E8')}">`)}
            ${field('خلفية البطاقة (رابط صورة https)', `<input class="input ltr" id="lvc-bg" value="${esc(L.card?.background || '')}" placeholder="https://...">`, 'مقاس مقترح 934×300.')}
          </div>`, 'تخصيص بطاقة الرانك للبريميوم', 'rankCard')}
        ${premiumBlock(`<div class="help" style="margin-bottom:8px">مثلاً رتبة البوسترز ×2، أو قناة #الفعاليات ×1.5. إذا انطبق أكثر من واحد، بياخد الأعلى (أقصى ×5).</div>
          <div class="list-editor" id="lv-boosts">${[...(L.boosts?.roles || []).map((r) => boostRow('role', r.roleId, r.multiplier)), ...(L.boosts?.channels || []).map((c) => boostRow('channel', c.channelId, c.multiplier))].join('')}</div>
          <div class="inline-form mt"><button type="button" class="btn ghost sm" data-boost-add="role">${icon('plus')} رتبة</button><button type="button" class="btn ghost sm" data-boost-add="channel">${icon('plus')} قناة</button></div>`, 'مضاعفة XP للبريميوم', 'xpBoost')}`,
        'levels'
      ) +
      card(
        'sec-echo',
        'الصدى 🔊 — خاصية MarkaBot',
        'الـ XP بيروح للي بيفتح سوالف، مش للي بيسبّم: كل ما حدا رد على رسالتك أو تفاعل عليها بتاخد XP إضافي.',
        'activity',
        `${toggle('ec-enabled', L.echo.enabled, 'تفعيل الصدى')}
        <div class="row-3">
          ${field('XP لما حدا يرد عليك', `<input class="input ltr" type="number" id="ec-reply" min="0" max="100" value="${L.echo.reply}">`)}
          ${field('XP لما حدا يتفاعل', `<input class="input ltr" type="number" id="ec-react" min="0" max="100" value="${L.echo.reaction}">`)}
          ${field('أعلى صدى باليوم', `<input class="input ltr" type="number" id="ec-cap" min="0" max="5000" value="${L.echo.dailyCap}">`)}
        </div>
        <div class="na">${icon('info')}<span>ضد الغش: نفس الشخص بيعطيك صدى مرة كل 30 دقيقة بس، والرد على نفسك ما بيحسب، وبس الرسائل اللي عمرها أقل من يوم بتاخد صدى من التفاعلات.</span></div>`,
        'levels'
      ) +
      card(
        'sec-lvtop',
        'لوحة الترتيب',
        'نفس ترتيب أمر /top.',
        'chart',
        `<div class="seg-tabs" id="lv-tabs" role="tablist">
          <button type="button" class="on" data-lvt="text">الكتابة</button><button type="button" data-lvt="voice">الفويس</button>
          <button type="button" data-lvt="week">هالأسبوع</button><button type="button" data-lvt="echo">الصدى</button></div>
        <div id="lv-board" class="lv-board"><div class="skeleton" style="height:180px"></div></div>`
      )
    );
  }

  async function loadBoard(type = 'text') {
    const box = document.getElementById('lv-board');
    if (!box) return;
    box.innerHTML = '<div class="skeleton" style="height:180px"></div>';
    try {
      const r = await api(`/api/levels/${id}?type=${type}`);
      if (!r.top.length) {
        box.innerHTML = `<div class="empty" style="padding:22px">${S.levels.enabled ? 'ما في حدا بالترتيب لسا — الـ XP بيبلش أول ما الأعضاء يتفاعلوا.' : 'نظام المستويات متوقف — فعّله من فوق.'}</div>`;
        return;
      }
      const val = (e) => (type === 'voice' ? `لفل ${e.voiceLevel} · ${e.vmin} دقيقة` : type === 'week' ? `${MB.num(e.score)} XP` : type === 'echo' ? `${MB.num(e.echo)} صدى` : `لفل ${e.textLevel} · ${MB.num(e.tx)} XP`);
      box.innerHTML = `<ol class="lv-list">${r.top
        .map((e) => `<li><span class="lv-rank r${e.rank}">${e.rank}</span>
          ${e.avatar ? `<img src="${esc(e.avatar)}" alt="">` : '<span class="lv-ava"></span>'}
          <b>${esc(e.name)}</b><span class="lv-val">${val(e)}</span></li>`)
        .join('')}</ol>`;
    } catch (err) {
      box.innerHTML = `<div class="empty" style="padding:22px">${esc(err.message)}</div>`;
    }
  }

  function sReplies() {
    const r = S.replies;
    return card(
      'sec-replies',
      'الردود التلقائية',
      'يرد البوت عند احتواء الرسالة على الكلمة (أو مطابقتها تماماً).',
      'reply',
      `${toggle('r-enabled', r.enabled, 'تفعيل الردود التلقائية')}
      <div class="list-editor" id="r-list">${r.replies.map(replyRow).join('')}</div>
      <button type="button" class="btn ghost sm mt" id="r-add">${icon('plus')} إضافة رد</button>`,
      'replies'
    );
  }

  function emojiPreview(v) {
    const m = String(v || '').match(/^<(a?):\w+:(\d+)>$/);
    return m ? `<img src="https://cdn.discordapp.com/emojis/${m[2]}.${m[1] ? 'gif' : 'png'}?size=48" alt="">` : '';
  }

  function sEmojis() {
    if (!EMO) return '';
    const names = { ui: 'الواجهة', systems: 'الأنظمة', logs: 'السجلات', giveaway: 'القيفاواي' };
    const body = Object.entries(EMO.groups)
      .map(
        ([g, keys]) => `<div class="group-title">${names[g]}</div><div class="emoji-grid">${keys
          .map((k) => {
            const it = EMO.items.find((x) => x.key === k);
            return `<div class="emoji-item"><div class="prev" data-prev="${k}">${emojiPreview(it.value) || emojiPreview(it.fallback) || esc(it.fallback)}</div>
              <div class="key">${k}</div>
              <input class="input ltr" data-emoji="${k}" placeholder="<:name:id>" value="${esc(it.value)}" ${EMO.canEdit ? '' : 'disabled'}></div>`;
          })
          .join('')}</div>`
      )
      .join('');
    return card(
      'sec-emojis',
      'مدير الإيموجيات',
      EMO.canEdit
        ? 'تُطبق على البوت بالكامل. الصق الإيموجي بصيغة &lt;:name:id&gt; أو الآيدي فقط — الحقول الفارغة تستخدم الرمز الافتراضي.'
        : 'إعداد عام يتحكم به مالك البوت فقط.',
      'smile',
      body,
      EMO.canEdit ? 'emojis' : null
    );
  }

  // ---------- collect & save ----------
  const collectors = {
    general: () => [
      ['prefix', { prefix: val('g-prefix').trim() }],
      ['general', { managerRoleId: val('g-manager') }],
    ],
    welcome: () => [
      [
        'welcome',
        {
          enabled: checked('w-enabled'),
          channelId: val('w-channel'),
          imageUrl: val('w-image').trim(),
          message: val('w-message'),
          avatarX: val('w-x'),
          avatarY: val('w-y'),
          avatarRadius: val('w-r'),
          avatarShape: val('w-shape'),
          avatarBorderColor: val('w-bcolor'),
          avatarBorderWidth: val('w-bwidth'),
          nameEnabled: checked('w-name-on'),
          nameX: val('w-nx'),
          nameY: val('w-ny'),
          nameSize: val('w-ns'),
          nameColor: val('w-nc'),
          nameAlign: val('w-na'),
          textEnabled: checked('w-text-on'),
          text: val('w-text'),
          textX: val('w-tx'),
          textY: val('w-ty'),
          textSize: val('w-ts'),
          textColor: val('w-tc'),
          textAlign: val('w-ta'),
        },
      ],
      ['greetings', { enabled: checked('gr-enabled'), channelIds: chipState.grch, message: val('gr-message'), duration: val('gr-duration') }],
    ],
    tickets: () => [
      [
        'tickets',
        {
          categoryId: val('t-category'),
          logChannelId: val('t-log'),
          supportRoleId: val('t-role'),
          maxOpen: val('t-max'),
          alertCooldown: val('t-cd'),
          panelTitle: val('t-title'),
          bannerUrl: val('t-banner'),
          panelDescription: val('t-desc'),
          departments: readRows('t-depts'),
          autoCloseHours: val('t-auto'),
        },
      ],
    ],
    jail: () => [['jail', { roleId: val('j-role'), channelId: val('j-channel'), logChannelId: val('j-log') }]],
    vanity: () => [['vanity', { vanityProtect: checked('v-enabled'), punishment: val('v-punish'), whitelist: val('v-white').split(/[,\s]+/).filter(Boolean) }]],
    logs: () => {
      const d = {};
      document.querySelectorAll('[data-log]').forEach((s) => (d[s.dataset.log] = s.value));
      return [['logs', d]];
    },
    invites: () => [['invites', { logChannelId: val('i-log'), minAccountAgeDays: val('i-age'), pointHoldHours: val('i-hold'), wheelEnabled: checked('i-wheel'), ...(isPrem('wheelImage') ? { wheelImage: val('i-wheel-img').trim() } : {}) }]],
    autoLine: () => [['autoLine', { enabled: checked('a-enabled'), channels: chipState.autoline, imageUrl: val('a-image') }]],
    feedback: () => [['feedback', { enabled: checked('f-enabled'), channels: chipState.feedback, emojis: val('f-emojis').split(',').map((s) => s.trim()).filter(Boolean) }]],
    kafeel: () => [['kafeel', { enabled: checked('kf-enabled'), channelId: val('kf-channel'), sponsorRoleId: val('kf-role'), goalMessages: val('kf-goal'), days: val('kf-days'), rewardXp: val('kf-xp'), maxPerSponsor: val('kf-max') }]],
    wrapped: () => [['wrapped', { enabled: checked('wr-enabled'), channelId: val('wr-channel'), city: val('wr-city'), weekly: checked('wr-weekly'), accent: val('wr-accent') }]],
    prayer: () => [['prayer', { enabled: checked('pr-enabled'), channelId: val('pr-channel'), city: val('pr-city'), roleId: val('pr-role'), prayers: [...document.querySelectorAll('[data-prayer]:checked')].map((c) => c.dataset.prayer), ramadan: checked('pr-ramadan'), suhoorMinutes: val('pr-suhoor') }]],
    automod: () => {
      const g = (x) => document.getElementById(x);
      const r = (k, extra = {}) => ({ on: checked(`am-${k}`), action: val(`am-${k}-act`), ...extra });
      return [[
        'automod',
        {
          enabled: checked('am-enabled'),
          logChannelId: val('am-log'),
          timeoutMinutes: val('am-tmin'),
          ignoreChannels: chipState.amch,
          ignoreRoles: chipState.amroles,
          words: r('words', { list: val('am-words-list') }),
          invites: r('invites'),
          links: r('links', { allow: val('am-links-allow') }),
          spam: r('spam', { messages: val('am-spam-n'), seconds: val('am-spam-s') }),
          mentions: r('mentions', { max: val('am-ment-max') }),
          ...(g('am-caps') ? {
            caps: r('caps', { percent: val('am-caps-p'), min: val('am-caps-m') }),
            emoji: r('emoji', { max: val('am-emo-max') }),
            channelRules: Object.fromEntries([...document.querySelectorAll('#am-chrules [data-chrule]')].map((row) => [row.querySelector('[data-k="channel"]').value, { off: [...row.querySelectorAll('[data-off]:checked')].map((c) => c.dataset.off) }]).filter(([c]) => c)),
            escalation: { on: checked('am-esc'), resetHours: val('am-esc-reset'), steps: [...document.querySelectorAll('#am-steps [data-step]')].map((row) => Object.fromEntries([...row.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value]))) },
          } : {}),
        },
      ]];
    },
    verify: () => [['verify', { enabled: checked('vf-enabled'), channelId: val('vf-channel'), roleId: val('vf-role'), removeRoleId: val('vf-remove'), title: val('vf-title'), text: val('vf-text'), mode: val('vf-mode') || 'button', minAccountDays: val('vf-age') || 0 }]],
    purge: () => [['purge', { list: readRows('pg-list') }]],
    levels: () => [
      [
        'levels',
        {
          enabled: checked('lv-enabled'),
          textMin: val('lv-min'),
          textMax: val('lv-max'),
          cooldown: val('lv-cd'),
          minLength: val('lv-len'),
          voicePerMin: val('lv-voice'),
          voiceRequireOthers: checked('lv-voice-others'),
          announce: val('lv-announce'),
          announceChannelId: val('lv-channel'),
          message: val('lv-msg'),
          rewards: readRows('lv-rewards'),
          stackRewards: checked('lv-stack'),
          noXpChannels: chipState.lvch,
          noXpRoles: chipState.lvroles,
          card: { accent: val('lvc-accent'), background: val('lvc-bg') },
          boosts: {
            roles: [...document.querySelectorAll('[data-boost="role"]')].map((r) => ({ roleId: r.querySelector('[data-k="id"]').value, multiplier: r.querySelector('[data-k="mult"]').value })),
            channels: [...document.querySelectorAll('[data-boost="channel"]')].map((r) => ({ channelId: r.querySelector('[data-k="id"]').value, multiplier: r.querySelector('[data-k="mult"]').value })),
          },
          echo: { enabled: checked('ec-enabled'), reply: val('ec-reply'), reaction: val('ec-react'), dailyCap: val('ec-cap') },
        },
      ],
    ],
    replies: () => [['replies', { enabled: checked('r-enabled'), replies: readRows('r-list') }]],
    giveaway: () => [
      [
        'giveaway',
        {
          title: val('gw-title'),
          description: val('gw-desc'),
          color: val('gw-color'),
          imageUrl: val('gw-image').trim(),
          reaction: val('gw-react').trim(),
          winMessage: val('gw-win'),
          requiredRoleId: val('gw-role'),
          minInvites: val('gw-inv'),
          minAccountAgeDays: val('gw-age'),
          bonusRoles: readRows('gw-bonus'),
        },
      ],
    ],
    protection: () => {
      const watch = {};
      document.querySelectorAll('[data-watch]').forEach((c) => (watch[c.dataset.watch] = c.checked));
      return [
        [
          'protection',
          {
            alertChannelId: val('p-alert'),
            antiRaid: { enabled: checked('p-raid'), joins: val('p-raid-joins'), seconds: val('p-raid-sec'), action: val('p-raid-action'), newAccountDays: val('p-raid-age'), lockdown: checked('p-raid-lock') },
            antiNuke: { enabled: checked('p-nuke'), limit: val('p-nuke-limit'), seconds: val('p-nuke-sec'), punishment: val('p-nuke-punish'), whitelist: val('p-nuke-white').split(/[,\s]+/).filter(Boolean), watch },
            impersonation: { enabled: checked('p-imp'), action: val('p-imp-action') || 'alert' },
          },
        ],
      ];
    },
  };

  // pending bot-profile images (data: URIs) until saved; null = remove
  const pendingImg = {};

  async function save(key, btn) {
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      if (key === 'botProfile') {
        const body = { nick: val('bp-nick'), bio: val('bp-bio') };
        for (const k of ['avatar', 'banner']) if (k in pendingImg) body[k] = pendingImg[k];
        const r = await api(`/api/bot-profile/${id}`, { method: 'POST', body });
        S.botProfile = r.profile;
        for (const k of Object.keys(pendingImg)) delete pendingImg[k];
        toast('تم تحديث شكل البوت في السيرفر', 'success');
      } else if (key === 'gemojis') {
        const emojis = {};
        document.querySelectorAll('[data-gemoji]').forEach((i) => (emojis[i.dataset.gemoji] = i.value.trim()));
        const r = await api(`/api/guild-emojis/${id}`, { method: 'POST', body: { emojis } });
        if (r.invalid?.length) toast(`صيغة غير صالحة: ${r.invalid.join('، ')}`, 'error', 5000);
        else toast('تم حفظ إيموجيات السيرفر', 'success');
      } else if (key === 'emojis') {
        const emojis = {};
        document.querySelectorAll('[data-emoji]').forEach((i) => (emojis[i.dataset.emoji] = i.value.trim()));
        const r = await api('/api/emojis', { method: 'POST', body: { emojis } });
        if (r.invalid?.length) toast(`صيغة غير صالحة: ${r.invalid.join('، ')}`, 'error', 5000);
        else toast('تم حفظ الإيموجيات', 'success');
      } else {
        for (const [module, data] of collectors[key]()) {
          const r = await api(`/api/settings/${id}`, { method: 'POST', body: { module, data } });
          S = r.settings;
        }
        toast('تم حفظ الإعدادات', 'success');
        if (key === 'tickets') {
          document.getElementById('t-depts').innerHTML = S.tickets.departments.map(deptRow).join('');
        }
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }

  async function loadStaff() {
    const box = document.getElementById('t-staff');
    try {
      const list = await api(`/api/staff/${id}`);
      if (!list.length) return (box.innerHTML = '<div class="empty" style="padding:18px">لا توجد إحصائيات بعد.</div>');
      box.innerHTML = `<table class="table"><thead><tr><th>الموظف</th><th>مستلمة</th><th>مغلقة</th><th>التقييم</th></tr></thead><tbody>${list
        .map((s) => {
          const full = Math.round(s.average);
          return `<tr><td><div class="person">${s.avatar ? `<img src="${esc(s.avatar)}" alt="">` : ''}<span>${esc(s.name)}</span></div></td>
            <td>${s.claimed}</td><td>${s.closed}</td>
            <td><span class="stars">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span> <span class="faint">${s.average.toFixed(1)} (${s.ratings})</span></td></tr>`;
        })
        .join('')}</tbody></table>`;
    } catch {
      box.textContent = 'تعذر التحميل.';
    }
  }

  async function loadAnalytics() {
    const box = document.getElementById('t-analytics');
    if (!box || !isPrem('ticketStats')) return;
    try {
      const a = await api(`/api/ticket-stats/${id}`);
      const depts = a.byDept.length
        ? `<table class="table" style="margin-top:12px"><thead><tr><th>القسم</th><th>عدد التذاكر</th></tr></thead><tbody>${a.byDept
            .map((d) => `<tr><td>${esc(d.label)}</td><td>${d.count}</td></tr>`)
            .join('')}</tbody></table>`
        : '';
      box.innerHTML = `<div class="stat-grid">
          <div class="stat-mini"><b>${a.open}</b><small>مفتوحة الآن</small></div>
          <div class="stat-mini"><b>${a.last7}</b><small>آخر 7 أيام</small></div>
          <div class="stat-mini"><b>${a.last30}</b><small>آخر 30 يوم</small></div>
          <div class="stat-mini"><b>${a.opened}</b><small>إجمالي المفتوحة</small></div>
          <div class="stat-mini"><b>${fmtMs(a.avgFirstResponse)}</b><small>متوسط أول رد</small></div>
          <div class="stat-mini"><b>${fmtMs(a.avgDuration)}</b><small>متوسط مدة التذكرة</small></div>
          <div class="stat-mini"><b>${a.ratings ? a.avgRating.toFixed(1) + ' ★' : '—'}</b><small>متوسط التقييم (${a.ratings})</small></div>
          <div class="stat-mini"><b>${a.autoClosed}</b><small>أُغلقت تلقائياً</small></div>
        </div>${depts}`;
    } catch (err) {
      box.textContent = err.message;
    }
  }

  function setPreview(kind, src) {
    if (kind === 'avatar') document.getElementById('bp-avatar-prev').innerHTML = src ? `<img src="${esc(src)}" class="bp-av" alt="">` : '<div class="bp-av ph"></div>';
    else document.getElementById('bp-banner-prev').innerHTML = src ? `<img src="${esc(src)}" alt="">` : '';
  }

  // ---------- events ----------
  let lastEmojiInput = null;
  function bind() {
    const root = document.getElementById('cards');
    root.addEventListener('focusin', (e) => {
      if (e.target.matches('[data-gemoji]')) lastEmojiInput = e.target;
    });
    root.addEventListener('click', async (e) => {
      const saveBtn = e.target.closest('[data-save]');
      if (saveBtn) return save(saveBtn.dataset.save, saveBtn);

      const pick = e.target.closest('[data-pick]');
      if (pick) return document.getElementById(pick.dataset.pick).click();

      const pe = e.target.closest('[data-pick-emoji]');
      if (pe) {
        const input = lastEmojiInput || document.querySelector('[data-gemoji]');
        if (!input) return;
        input.value = pe.dataset.pickEmoji;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const all = [...document.querySelectorAll('[data-gemoji]')];
        lastEmojiInput = all[all.indexOf(input) + 1] || input;
        lastEmojiInput.focus();
        return;
      }

      const clr = e.target.closest('[data-clear-img]');
      if (clr) {
        pendingImg[clr.dataset.clearImg] = null;
        setPreview(clr.dataset.clearImg, '');
        return toast('اضغط حفظ لتطبيق الإزالة');
      }

      if (e.target.closest('#pr-redeem')) {
        const code = val('pr-code').trim();
        if (!code) return toast('اكتب الكود أولاً', 'error');
        const b = e.target.closest('#pr-redeem');
        b.disabled = true;
        try {
          await api(`/api/premium/redeem/${id}`, { method: 'POST', body: { code } });
          toast('تم تفعيل البريميوم 👑', 'success');
          setTimeout(() => location.reload(), 900);
        } catch (err) {
          toast(err.message, 'error');
          b.disabled = false;
        }
        return;
      }

      if (e.target.closest('#bp-reset')) {
        const b = e.target.closest('#bp-reset');
        b.disabled = true;
        try {
          const r = await api(`/api/bot-profile/${id}`, { method: 'POST', body: { reset: true } });
          S.botProfile = r.profile;
          document.getElementById('bp-nick').value = '';
          document.getElementById('bp-bio').value = '';
          document.getElementById('bp-name-prev').textContent = 'MarkaBot';
          setPreview('avatar', '');
          setPreview('banner', '');
          toast('رجع البوت لشكله الأصلي', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          b.disabled = false;
        }
        return;
      }

      if (e.target.closest('#w-test')) {
        const b = e.target.closest('#w-test');
        b.disabled = true;
        try {
          await api(`/api/welcome-test/${id}`, { method: 'POST', body: {} });
          toast('تم إرسال رسالة تجربة لقناة الترحيب', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          b.disabled = false;
        }
        return;
      }

      const ba = e.target.closest('[data-boost-add]');
      if (ba) {
        if (document.querySelectorAll('[data-boost]').length >= 30) return toast('الحد 30', 'error');
        return document.getElementById('lv-boosts').insertAdjacentHTML('beforeend', boostRow(ba.dataset.boostAdd));
      }
      if (e.target.closest('#wr-post')) {
        try { await api(`/api/wrapped/${id}/post`, { method: 'POST', body: {} }); toast('انتشر الملخص', 'success'); } catch (err) { toast(err.message, 'error', 5000); }
        return;
      }
      if (e.target.closest('#st-run')) {
        const out = document.getElementById('st-out');
        out.innerHTML = '<div class="skeleton" style="height:160px"></div>';
        try {
          const r = await api(`/api/staff-report/${id}`, { method: 'POST', body: {} });
          const ago = (t) => (t ? MB.ago(t) : 'ما في نشاط');
          out.innerHTML = r.rows.length
            ? `<div class="table-wrap"><table class="table"><thead><tr><th>الإداري</th><th>استلم</th><th>سكّر</th><th>التقييم</th><th>رسائل</th><th>أيام نشاط</th><th>فويس</th><th>آخر نشاط</th></tr></thead><tbody>${r.rows
                .map((x) => `<tr${!x.last || Date.now() - x.last > 7 * 864e5 ? ' class="warn-row"' : ''}><td>${x.avatar ? `<img class="st-ava" src="${esc(x.avatar)}" alt="">` : ''} ${esc(x.name)}</td><td>${x.claimed}</td><td>${x.closed}</td><td>${x.rating ? `${x.rating.toFixed(1)} ★ (${x.ratings})` : '—'}</td><td>${x.msgs}</td><td>${x.activeDays}/30</td><td>${x.voiceMin} د</td><td>${ago(x.last)}</td></tr>`)
                .join('')}</tbody></table></div><div class="help">الصفوف الملوّنة = ما تفاعل من أكثر من أسبوع.</div>`
            : '<div class="empty" style="padding:18px">ما في إداريين.</div>';
          if (!r.next.ok) document.getElementById('st-note').textContent = `التقرير الجاي متاح ${new Date(r.next.nextAt).toLocaleDateString('ar')} — بالبريميوم وقت ما بدك.`;
        } catch (err) {
          out.innerHTML = '';
          toast(err.message, 'error', 6000);
        }
        return;
      }
      if (e.target.closest('#am-chrule-add')) return document.getElementById('am-chrules').insertAdjacentHTML('beforeend', chRuleRow());
      if (e.target.closest('[data-del-chrule]')) return e.target.closest('[data-chrule]').remove();
      // auto purge
      if (e.target.closest('#pg-add')) {
        const box = document.getElementById('pg-list');
        if (box.children.length >= P.limits.purgeChannels) return toast(premiumLimitMsg('purgeChannels'), 'error', 4500);
        return box.insertAdjacentHTML('beforeend', window.__purgeRow());
      }
      const pn = e.target.closest('[data-purge-now]');
      if (pn) {
        const row = pn.closest('[data-row]');
        const channelId = row.querySelector('[data-f="channelId"]').value;
        if (!channelId) return toast('اختار القناة', 'error');
        if (pn.dataset.sure !== '1') { pn.dataset.sure = '1'; toast('اضغط مرة ثانية للتأكيد', 'info'); return setTimeout(() => delete pn.dataset.sure, 4000); }
        try {
          const r = await api(`/api/purge/${id}/now`, { method: 'POST', body: { channelId, keepPinned: row.querySelector('[data-f="keepPinned"]').checked } });
          toast(`انمسحت ${r.deleted} رسالة`, 'success');
        } catch (err) { toast(err.message, 'error'); }
        return;
      }
      // verification panel
      if (e.target.closest('#vf-publish')) {
        try { await api(`/api/verify/${id}/publish`, { method: 'POST', body: {} }); toast('تم نشر رسالة التحقق', 'success'); } catch (err) { toast(err.message, 'error', 5000); }
        return;
      }
      // role menus
      const rmEdit = e.target.closest('[data-rm-edit]');
      if (e.target.closest('#rm-new') || rmEdit) {
        const ed = document.getElementById('rm-editor');
        if (!rmEdit && (S.roleMenus || []).length >= P.limits.roleMenus) return toast(premiumLimitMsg('roleMenus'), 'error', 4500);
        ed.innerHTML = rmEditor(rmEdit ? S.roleMenus.find((m) => m.id === rmEdit.dataset.rmEdit) : undefined);
        ed.hidden = false;
        document.getElementById('rm-new').hidden = true;
        return ed.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (e.target.closest('#rm-cancel')) {
        document.getElementById('rm-editor').hidden = true;
        document.getElementById('rm-new').hidden = false;
        return;
      }
      if (e.target.closest('#rm-role-add')) {
        const box = document.getElementById('rm-roles');
        if (box.children.length >= 25) return toast('الحد 25 رتبة بالقائمة', 'error');
        return box.insertAdjacentHTML('beforeend', window.__rmRole());
      }
      if (e.target.closest('#rm-save')) {
        const menu = { id: val('rm-id'), channelId: val('rm-channel'), title: val('rm-title'), description: val('rm-desc'), color: val('rm-color'), image: val('rm-image'), exclusive: checked('rm-excl'), mode: val('rm-mode') || 'buttons', tempMinutes: val('rm-temp') || 0, roles: readRows('rm-roles') };
        try {
          const r = await api(`/api/role-menus/${id}`, { method: 'POST', body: { menu } });
          S.roleMenus = r.menus;
          document.getElementById('sec-rolemenus').outerHTML = sRoleMenus();
          arrangeGroups();
          showGroup();
          toast('تم النشر', 'success');
        } catch (err) { toast(err.message, 'error', 5000); }
        return;
      }
      const rmDel = e.target.closest('[data-rm-del]');
      if (rmDel) {
        if (rmDel.dataset.sure !== '1') { rmDel.dataset.sure = '1'; rmDel.textContent = 'متأكد؟'; return; }
        const r = await api(`/api/role-menus/${id}`, { method: 'POST', body: { action: 'delete', menuId: rmDel.dataset.rmDel } });
        S.roleMenus = r.menus;
        document.getElementById('sec-rolemenus').outerHTML = sRoleMenus();
        arrangeGroups();
        showGroup();
        return toast('انحذفت القائمة ورسالتها', 'success');
      }
      // embed builder
      if (e.target.closest('#em-send') || e.target.closest('#em-schedule')) {
        const schedule = Boolean(e.target.closest('#em-schedule'));
        const body = { action: schedule ? 'schedule' : 'send', channelId: val('em-channel'), embed: embedData(), sender: val('em-sname') ? { name: val('em-sname'), avatar: val('em-savatar') } : null };
        if (schedule) Object.assign(body, { at: val('em-at') ? new Date(val('em-at')).toISOString() : '', repeatHours: val('em-rep') });
        try {
          const r = await api(`/api/embed/${id}`, { method: 'POST', body });
          S.scheduled = r.scheduled;
          if (schedule) document.getElementById('em-sched').innerHTML = (r.scheduled || []).map((x) => `<div class="gw-item"><div><b>${esc(x.title)}</b><small>${new Date(x.at).toLocaleString('ar')}${x.repeatHours ? ` · كل ${x.repeatHours} ساعة` : ''}</small></div><div class="gw-actions"><button type="button" class="btn ghost sm" data-unsched="${x.id}">إلغاء</button></div></div>`).join('');
          toast(schedule ? 'تمت الجدولة' : 'تم الإرسال', 'success');
        } catch (err) { toast(err.message, 'error', 5000); }
        return;
      }
      const un = e.target.closest('[data-unsched]');
      if (un) {
        await api(`/api/embed/${id}`, { method: 'POST', body: { action: 'unschedule', sid: un.dataset.unsched } });
        un.closest('.gw-item').remove();
        return toast('انلغت الجدولة', 'success');
      }

      if (e.target.closest('#lv-reward-add')) {
        const box = document.getElementById('lv-rewards');
        if (box.children.length >= 25) return toast('الحد الأقصى 25 مكافأة', 'error');
        return box.insertAdjacentHTML('beforeend', window.__rewardRow());
      }
      const lvt = e.target.closest('[data-lvt]');
      if (lvt) {
        document.querySelectorAll('[data-lvt]').forEach((b) => b.classList.toggle('on', b === lvt));
        return loadBoard(lvt.dataset.lvt);
      }

      if (e.target.closest('#gw-bonus-add')) {
        const box = document.getElementById('gw-bonus');
        if (box.children.length >= 10) return toast('الحد الأقصى 10 رتب', 'error');
        return box.insertAdjacentHTML('beforeend', window.__bonusRow());
      }

      const v = e.target.closest('.vars[data-target] code');
      if (v) {
        const ta = document.getElementById(v.parentElement.dataset.target);
        const pos = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, pos) + v.textContent + ta.value.slice(pos);
        ta.focus();
        return;
      }

      const rm = e.target.closest('[data-rm]');
      if (rm) {
        const key = rm.closest('[data-chips]').dataset.chips;
        chipState[key] = chipState[key].filter((x) => x !== rm.dataset.rm);
        return renderChips(key);
      }

      if (e.target.closest('[data-del]')) return e.target.closest('[data-row]').remove();
      if (e.target.closest('#t-add')) {
        const box = document.getElementById('t-depts');
        if (box.children.length >= P.limits.ticketDepartments)
          return toast(isPrem() ? `الحد الأقصى ${P.limits.ticketDepartments} قسماً` : `المجاني ${P.limits.ticketDepartments} أقسام — رقّي للبريميوم 👑 لحتى ${P.plans.premium.ticketDepartments}`, 'error', 4500);
        return box.insertAdjacentHTML('beforeend', deptRow());
      }
      if (e.target.closest('#r-add')) return document.getElementById('r-list').insertAdjacentHTML('beforeend', replyRow());

      if (e.target.closest('#logs-all')) {
        const first = [...document.querySelectorAll('[data-log]')].find((s) => s.value)?.value;
        if (!first) return toast('اختر قناة لأي نوع أولاً', 'error');
        document.querySelectorAll('[data-log]').forEach((s) => (s.value = first));
        return toast('تم التعيين — اضغط حفظ لتطبيقه');
      }

      const send = e.target.closest('#t-send');
      if (send) {
        const ch = val('t-panel-ch');
        if (!ch) return toast('اختر قناة لإرسال اللوحة', 'error');
        send.disabled = true;
        try {
          await api(`/api/ticket-panel/${id}`, { method: 'POST', body: { channelId: ch } });
          toast('تم إرسال لوحة التذاكر', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          send.disabled = false;
        }
        return;
      }

      const rel = e.target.closest('[data-release]');
      if (rel) {
        rel.disabled = true;
        try {
          await api(`/api/jail/${id}/release`, { method: 'POST', body: { userId: rel.dataset.release } });
          rel.closest('tr').remove();
          toast('تم تحرير العضو وإرجاع رتبه', 'success');
        } catch (err) {
          rel.disabled = false;
          toast(err.message, 'error');
        }
      }
    });

    root.addEventListener('change', async (e) => {
      if (e.target.id === 'w-file') {
        const file = e.target.files[0];
        e.target.value = '';
        try {
          toast('جاري رفع الصورة...');
          const data = await readImage(file, { maxW: 2048, maxH: 1000 });
          const r = await api(`/api/upload/${id}`, { method: 'POST', body: { kind: 'welcome', data } });
          document.getElementById('w-image').value = r.url;
          weLoadBg(r.url);
          toast('تم رفع الصورة', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }
      if (e.target.id === 'i-wheel-file') {
        const file = e.target.files[0];
        e.target.value = '';
        try {
          toast('جاري رفع الصورة...');
          const data = await readImage(file, { maxW: 800, maxH: 800, square: true });
          const r = await api(`/api/upload/${id}`, { method: 'POST', body: { kind: 'wheel', data } });
          document.getElementById('i-wheel-img').value = r.url;
          toast('تم رفع صورة العجلة', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }
      if (e.target.id === 'bp-avatar-file' || e.target.id === 'bp-banner-file') {
        const kind = e.target.id === 'bp-avatar-file' ? 'avatar' : 'banner';
        const file = e.target.files[0];
        e.target.value = '';
        try {
          const data = await readImage(file, kind === 'avatar' ? { maxW: 512, maxH: 512, square: true } : { maxW: 1360, maxH: 480 });
          pendingImg[kind] = data;
          setPreview(kind, data);
          toast('اضغط حفظ لتطبيق الصورة');
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add && add.value) {
        const key = add.closest('[data-chips]').dataset.chips;
        chipState[key].push(add.value);
        renderChips(key);
      }
    });

    root.addEventListener('input', (e) => {
      if (e.target.id?.startsWith('em-')) drawEmbed();
      if (e.target.id === 'bp-nick') document.getElementById('bp-name-prev').textContent = e.target.value || 'MarkaBot';
      const gem = e.target.closest('[data-gemoji]');
      if (gem) {
        const prev = document.querySelector(`[data-gprev="${gem.dataset.gemoji}"]`);
        const it = GEMO.items.find((x) => x.key === gem.dataset.gemoji);
        prev.innerHTML = emojiPreview(gem.value.trim()) || emojiPreview(it.fallback) || esc(it.fallback);
      }
      const em = e.target.closest('[data-emoji]');
      if (em) {
        const prev = document.querySelector(`[data-prev="${em.dataset.emoji}"]`);
        const it = EMO.items.find((x) => x.key === em.dataset.emoji);
        prev.innerHTML = emojiPreview(em.value.trim()) || emojiPreview(it.fallback) || esc(it.fallback);
      }
    });
  }

  // ---------- groups (one per sidebar item) ----------
  const GROUPS = {
    settings: { sections: ['sec-general'], ar: ['إعدادات السيرفر', 'البادئة ورتبة مدراء البوت.'], en: ['Server settings', 'Prefix and the bot manager role.'] },
    moderation: { sections: ['sec-mod-note', 'sec-automod', 'sec-verify', 'sec-jail', 'sec-protection', 'sec-vanity', 'sec-purge'], ar: ['الإشراف والحماية', 'AutoMod، التحقق، السجن، الحماية والمسح التلقائي.'], en: ['Moderation', 'AutoMod, verification, jail, protection and auto purge.'] },
    community: { sections: ['sec-kafeel', 'sec-wrapped', 'sec-prayer'], ar: ['المجتمع', 'الكفيل، ملخص السيرفر، وأوقات الصلاة ورمضان.'], en: ['Community', 'Sponsors, server summary, and prayer times & Ramadan.'] },
    staff: { sections: ['sec-staff'], ar: ['أداء الإدارة', 'تقرير شهري لنشاط كل إداري.'], en: ['Staff report', 'A monthly activity report for every staff member.'] },
    rolemenus: { sections: ['sec-rolemenus'], ar: ['رتب بالأزرار', 'لوحات يختار منها الأعضاء رتبهم.'], en: ['Role menus', 'Panels where members pick their roles.'] },
    embeds: { sections: ['sec-embeds'], ar: ['صانع الإمبد', 'صمم رسائل مرتبة وابعتها أو جدولها.'], en: ['Embed builder', 'Design messages and send or schedule them.'] },
    tickets: { sections: ['sec-tickets'], ar: ['التذاكر', 'لوحة التذاكر، الأقسام، فريق الدعم والسجلات.'], en: ['Tickets', 'Ticket panel, categories, support staff and logs.'] },
    logs: { sections: ['sec-logs'], ar: ['السجلات', 'قناة مستقلة لكل نوع من السجلات.'], en: ['Logs', 'A separate channel for each log type.'] },
    giveaways: { sections: ['sec-gwmanage', 'sec-giveaway'], ar: ['القيفاواي', 'القيفاوايات الشغالة، إنشاء جديد، والسجل.'], en: ['Giveaways', 'Active giveaways, create new ones, and history.'] },
    welcome: { sections: ['sec-welcome'], ar: ['الترحيب', 'صورة الترحيب، الرسالة، والترحيب النصي.'], en: ['Welcome', 'Welcome image, message and text greeting.'] },
    responses: { sections: ['sec-replies', 'sec-autoline', 'sec-feedback'], ar: ['الردود التلقائية', 'ردود على كلمات، الخط التلقائي، ونظام الآراء.'], en: ['Auto responses', 'Keyword replies, auto line and feedback.'] },
    levels: { sections: ['sec-levels', 'sec-echo', 'sec-lvtop'], ar: ['المستويات', 'XP الكتابة والفويس، الصدى، رتب المكافآت ولوحة الترتيب.'], en: ['Levels', 'Text and voice XP, Echo, level rewards and the leaderboard.'] },
    invites: { sections: ['sec-invites'], ar: ['الدعوات والعجلة', 'تتبع الدعوات وكشف الوهمي.'], en: ['Invites & wheel', 'Invite tracking and fake detection.'] },
    customization: { sections: ['sec-botprofile', 'sec-gemojis', 'sec-emojis'], ar: ['التخصيص', 'شكل البوت وإيموجياته داخل السيرفر.'], en: ['Customization', 'The bot’s look and emojis in this server.'] },
    premium: { sections: ['sec-premium'], ar: ['البريميوم', 'الخطة الحالية والحدود وتفعيل الأكواد.'], en: ['Premium', 'Current plan, limits and code activation.'] },
  };

  function arrangeGroups() {
    const root = document.getElementById('cards');
    const frag = document.createDocumentFragment();
    for (const [key, g] of Object.entries(GROUPS)) {
      const box = document.createElement('div');
      box.className = 'sec-group';
      box.id = `grp-${key}`;
      const [title, desc] = g[MB.lang] || g.ar;
      box.innerHTML = `<div class="group-head"><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>`;
      for (const sid of g.sections) {
        const el = document.getElementById(sid);
        if (el) box.appendChild(el);
      }
      frag.appendChild(box);
    }
    root.innerHTML = '';
    root.appendChild(frag);
    document.querySelector('.page-head')?.remove();
  }

  function showGroup() {
    let key = (location.hash || '#settings').slice(1);
    if (!GROUPS[key]) {
      // old anchors like #sec-tickets → their group
      const hit = Object.entries(GROUPS).find(([, g]) => g.sections.includes(key));
      key = hit ? hit[0] : 'settings';
    }
    document.querySelectorAll('.sec-group').forEach((el) => el.classList.toggle('show', el.id === `grp-${key}`));
    MB.setActiveNav(key);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (key === 'welcome') weDraw();
    if (key === 'giveaways') loadGiveaways();
    if (key === 'levels') loadBoard(document.querySelector('[data-lvt].on')?.dataset.lvt || 'text');
  }

  // ---------- giveaways manager ----------
  const GT = {
    ar: { active: 'الشغالة', ended: 'المنتهية', create: 'قيفاواي جديد', prize: 'الجائزة', channel: 'القناة', pick: 'اختر قناة', winners: 'عدد الفائزين', duration: 'المدة', minutes: 'دقيقة', hours: 'ساعة', days: 'يوم',
      start: 'ابدأ القيفاواي', end: 'إنهاء الآن', reroll: 'إعادة سحب', open: 'فتح', entrants: 'مشارك', endsIn: 'ينتهي', endedAt: 'انتهى', winnersL: 'الفائزون', none: 'لا يوجد',
      emptyActive: 'ما في قيفاواي شغال حالياً. ابدأ واحد من النموذج.', emptyEnded: 'ما في قيفاوايات منتهية بعد.', title: 'إدارة القيفاواي', desc: 'كل قيفاواي بينزل بالقناة اللي تختارها وبيشتغل بنفس نظام البوت.', host: 'المضيف' },
    en: { active: 'Active', ended: 'History', create: 'New giveaway', prize: 'Prize', channel: 'Channel', pick: 'Pick a channel', winners: 'Winners', duration: 'Duration', minutes: 'minutes', hours: 'hours', days: 'days',
      start: 'Start giveaway', end: 'End now', reroll: 'Reroll', open: 'Open', entrants: 'entrants', endsIn: 'Ends', endedAt: 'Ended', winnersL: 'Winners', none: 'None',
      emptyActive: 'No active giveaways. Start one with the form.', emptyEnded: 'No finished giveaways yet.', title: 'Manage giveaways', desc: 'Each giveaway is posted in the channel you choose and runs on the bot’s giveaway system.', host: 'Host' },
  }[MB.lang];
  let GW = { active: [], ended: [] };
  let gwTab = 'active';

  function sGwManage() {
    return card(
      'sec-gwmanage',
      GT.title,
      GT.desc,
      'gift',
      `<div class="row" style="align-items:end">
        ${field(GT.prize, `<input class="input" id="gwm-prize" maxlength="200" placeholder="Nitro">`)}
        ${field(GT.channel, `<select class="select" id="gwm-channel">${textOpts('', GT.pick)}</select>`)}
      </div>
      <div class="row-3" style="align-items:end">
        ${field(GT.winners, `<input class="input ltr" type="number" id="gwm-winners" min="1" max="20" value="1">`)}
        ${field(GT.duration, `<input class="input ltr" type="number" id="gwm-amount" min="1" max="1440" value="1">`)}
        ${field('&nbsp;', `<select class="select" id="gwm-unit"><option value="60">${GT.hours}</option><option value="1">${GT.minutes}</option><option value="1440" selected>${GT.days}</option></select>`)}
      </div>
      <div style="display:flex;justify-content:flex-end;margin:4px 0 18px"><button class="btn primary" id="gwm-start" type="button">${icon('plus')} ${GT.start}</button></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;flex-wrap:wrap">
        <div class="seg-tabs" role="tablist"><button type="button" role="tab" data-gwtab="active" class="on">${GT.active}</button><button type="button" role="tab" data-gwtab="ended">${GT.ended}</button></div>
        <button class="btn ghost sm" type="button" id="gwm-refresh" aria-label="refresh">${icon('refresh')}</button>
      </div>
      <div class="gw-list" id="gwm-list"><div class="skeleton" style="height:70px"></div></div>`,
      null
    );
  }

  function renderGiveaways() {
    const box = document.getElementById('gwm-list');
    if (!box) return;
    const list = GW[gwTab];
    if (!list.length) {
      box.innerHTML = `<div class="empty" style="padding:26px">${gwTab === 'active' ? GT.emptyActive : GT.emptyEnded}</div>`;
      return;
    }
    const when = (t) => new Date(t).toLocaleString(MB.lang, { dateStyle: 'medium', timeStyle: 'short' });
    box.innerHTML = list
      .map(
        (g) => `<div class="gw-item">
          <div style="min-width:0">
            <b>${esc(g.prize)}</b>
            <div class="meta">
              <span>#${esc(g.channel || '—')}</span>
              <span>${g.ended ? GT.endedAt : GT.endsIn} ${g.ended ? when(g.endTime) : MB.ago(g.endTime)}</span>
              <span>${MB.num(g.entrants)} ${GT.entrants}</span>
              <span>${GT.winners}: ${g.winnersCount}</span>
              ${g.host ? `<span>${GT.host}: ${esc(g.host)}</span>` : ''}
              ${g.ended ? `<span>${GT.winnersL}: ${g.winners.length ? g.winners.map((w) => esc(w.name)).join('، ') : GT.none}</span>` : ''}
            </div>
          </div>
          <div class="acts">
            <a class="btn ghost sm" href="${esc(g.url)}" target="_blank" rel="noopener">${icon('external')} ${GT.open}</a>
            ${g.ended
              ? `<button class="btn ghost sm" type="button" data-gw="reroll" data-mid="${g.messageId}">${icon('refresh')} ${GT.reroll}</button>`
              : `<button class="btn ghost sm" type="button" data-gw="end" data-mid="${g.messageId}">${icon('stop')} ${GT.end}</button>`}
          </div>
        </div>`
      )
      .join('');
  }

  async function loadGiveaways() {
    try {
      GW = await api(`/api/giveaways/${id}`);
      renderGiveaways();
    } catch (err) {
      const box = document.getElementById('gwm-list');
      if (box) box.innerHTML = `<div class="na">${icon('info')}<span>${esc(err.message)}</span></div>`;
    }
  }

  function bindGiveaways() {
    const sec = document.getElementById('sec-gwmanage');
    if (!sec) return;
    sec.addEventListener('click', async (e) => {
      const tab = e.target.closest('[data-gwtab]');
      if (tab) {
        gwTab = tab.dataset.gwtab;
        sec.querySelectorAll('[data-gwtab]').forEach((b) => b.classList.toggle('on', b === tab));
        return renderGiveaways();
      }
      if (e.target.closest('#gwm-refresh')) return loadGiveaways();
      const act = e.target.closest('[data-gw]');
      const startBtn = e.target.closest('#gwm-start');
      const btn = act || startBtn;
      if (!btn) return;
      const body = act
        ? { action: act.dataset.gw, messageId: act.dataset.mid }
        : {
            action: 'create',
            prize: val('gwm-prize').trim(),
            channelId: val('gwm-channel'),
            winners: val('gwm-winners'),
            minutes: (parseInt(val('gwm-amount'), 10) || 0) * (parseInt(val('gwm-unit'), 10) || 1),
          };
      btn.disabled = true;
      try {
        GW = await api(`/api/giveaways/${id}`, { method: 'POST', body });
        if (startBtn) {
          document.getElementById('gwm-prize').value = '';
          gwTab = 'active';
          sec.querySelectorAll('[data-gwtab]').forEach((b) => b.classList.toggle('on', b.dataset.gwtab === 'active'));
        }
        renderGiveaways();
        toast(MB.lang === 'ar' ? 'تم' : 'Done', 'success');
      } catch (err) {
        toast(err.message, 'error', 4500);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function sModNote() {
    const txt = MB.lang === 'ar'
      ? 'صلاحيات فريق الإدارة تُحدد من «إعدادات السيرفر ← رتبة المدراء». الإداريين وأصحاب صلاحية إدارة الرسائل مستثنين من AutoMod تلقائياً.'
      : 'Staff permissions are set in Server settings → manager role. Staff with Manage Messages are never filtered by AutoMod.';
    return `<div id="sec-mod-note" class="na" style="margin-bottom:16px">${icon('info')}<span>${esc(txt)}</span></div>`;
  }

  // ---------- AutoMod ----------
  const RULE_NAMES = { words: 'الكلمات', invites: 'الدعوات', links: 'الروابط', spam: 'السبام', mentions: 'المنشن', caps: 'الكابس', emoji: 'الإيموجي' };
  function chRuleRow(cid = '', off = []) {
    return `<div class="am-chrule" data-chrule><select class="select" data-k="channel">${textOpts(cid, 'اختر قناة')}</select>
      <div class="check-grid">${Object.entries(RULE_NAMES).map(([k, t]) => `<label class="check"><input type="checkbox" data-off="${k}" ${off.includes(k) ? 'checked' : ''}> بدون ${t}</label>`).join('')}</div>
      <button type="button" class="icon-btn" data-del-chrule>×</button></div>`;
  }
  function sAutomod() {
    const A = S.automod;
    const actSel = (id, v) => `<select class="select" id="${id}">${[['delete', 'حذف الرسالة'], ['timeout', 'حذف + إسكات'], ['kick', 'حذف + طرد'], ['ban', 'حذف + حظر']].map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    const rule = (key, title, hint, extra = '') => `<div class="am-rule">
        <div class="am-head">${toggle(`am-${key}`, A[key].on, title, hint)}<div class="am-act">${actSel(`am-${key}-act`, A[key].action)}</div></div>${extra}</div>`;
    const steps = (A.escalation.steps || []).map((x, i) => `<div class="row-3 am-step" data-step>
        ${field(`بعد كم مخالفة`, `<input class="input ltr" type="number" data-k="strikes" min="1" max="100" value="${x.strikes}">`)}
        ${field('العقوبة', `<select class="select" data-k="action">${[['timeout', 'إسكات'], ['kick', 'طرد'], ['ban', 'حظر']].map(([k, t]) => `<option value="${k}" ${x.action === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
        ${field('مدة الإسكات (دقائق)', `<input class="input ltr" type="number" data-k="minutes" min="1" max="40320" value="${x.minutes || 10}">`)}</div>`).join('');
    return card(
      'sec-automod',
      'AutoMod',
      'البوت بيحذف الرسائل المخالفة لحاله وبيعاقب حسب الإعدادات. الكلمات العربية بتنفحص حتى لو فيها تشكيل أو همزات مختلفة.',
      'shield',
      `${toggle('am-enabled', A.enabled, 'تفعيل AutoMod')}
      <div class="row">
        ${field('قناة سجل AutoMod', `<select class="select" id="am-log">${textOpts(A.logChannelId, 'سجل الإشراف العام')}</select>`)}
        ${field('مدة الإسكات الافتراضية (دقائق)', `<input class="input ltr" type="number" id="am-tmin" min="1" max="1440" value="${A.timeoutMinutes}">`)}
      </div>
      ${rule('words', 'الكلمات الممنوعة', 'الشتايم والكلمات اللي بتحددها', field('الكلمات (كلمة بكل سطر أو بينها فاصلة)', `<textarea class="textarea" id="am-words-list" rows="3" maxlength="8000">${esc((A.words.list || []).join('\n'))}</textarea>`))}
      ${rule('invites', 'روابط دعوات ديسكورد', 'discord.gg وروابط الدعوات')}
      ${rule('links', 'الروابط', 'كل الروابط إلا المسموحة', field('مواقع مسموحة', `<input class="input ltr" id="am-links-allow" value="${esc((A.links.allow || []).join(', '))}" placeholder="youtube.com, tenor.com">`))}
      ${rule('spam', 'السبام', 'رسائل كثير ورا بعض', `<div class="row">${field('عدد الرسائل', `<input class="input ltr" type="number" id="am-spam-n" min="3" max="30" value="${A.spam.messages}">`)}${field('خلال (ثانية)', `<input class="input ltr" type="number" id="am-spam-s" min="2" max="60" value="${A.spam.seconds}">`)}</div>`)}
      ${rule('mentions', 'المنشن الكثير', 'منشن لأعضاء أو رتب كثير برسالة وحدة', field('أعلى عدد منشن', `<input class="input ltr" type="number" id="am-ment-max" min="1" max="50" value="${A.mentions.max}" style="max-width:140px">`))}
      ${field('قنوات وكاتيجوري مستثناة', chips('amch', A.ignoreChannels, 'any'))}
      ${field('رتب مستثناة', chips('amroles', A.ignoreRoles, 'roles'))}
      <div class="group-title" style="margin-top:16px">${crown} AutoMod المتقدم</div>
      ${premiumBlock(`
        ${rule('caps', 'الكابس', 'رسائل كلها حروف كبيرة', `<div class="row">${field('النسبة %', `<input class="input ltr" type="number" id="am-caps-p" min="30" max="100" value="${A.caps.percent}">`)}${field('أقل عدد حروف', `<input class="input ltr" type="number" id="am-caps-m" min="5" max="200" value="${A.caps.min}">`)}</div>`)}
        ${rule('emoji', 'الإيموجي الكثير', 'إيموجيات كثير برسالة وحدة', field('أعلى عدد', `<input class="input ltr" type="number" id="am-emo-max" min="1" max="100" value="${A.emoji.max}" style="max-width:140px">`))}
        <div class="am-rule">${toggle('am-esc', A.escalation.on, 'عقوبات متدرجة', 'كل ما زادت مخالفات العضو بتقوى العقوبة')}
          <div id="am-steps">${steps}</div>
          ${field('تصفير المخالفات بعد (ساعات)', `<input class="input ltr" type="number" id="am-esc-reset" min="1" max="720" value="${A.escalation.resetHours}" style="max-width:140px">`)}</div>
        <div class="am-rule"><b>قواعد لكل قناة</b><div class="help" style="margin-top:4px">طفّي فلتر معين بقناة معينة — مثلاً اسمح بالروابط بقناة #الميديا بس.</div>
          <div class="list-editor mt" id="am-chrules">${Object.entries(A.channelRules || {}).map(([cid, v]) => chRuleRow(cid, v.off)).join('')}</div>
          <button type="button" class="btn ghost sm mt" id="am-chrule-add">${icon('plus')} إضافة قناة</button></div>
      `, 'AutoMod المتقدم للبريميوم', 'automodPlus')}`,
      'automod'
    );
  }

  // ---------- verification ----------
  function sVerify() {
    const V = S.verify;
    return card(
      'sec-verify',
      'التحقق',
      'الأعضاء الجداد بيكبسوا زر عشان ياخدوا رتبة التحقق ويشوفوا السيرفر. هيك بتوقف البوتات والحسابات الوهمية.',
      'check',
      `${toggle('vf-enabled', V.enabled, 'تفعيل التحقق')}
      <div class="row">
        ${field('قناة التحقق', `<select class="select" id="vf-channel">${textOpts(V.channelId, 'اختر قناة')}</select>`)}
        ${field('رتبة بعد التحقق', `<select class="select" id="vf-role">${roleOpts(V.roleId, 'اختر رتبة')}</select>`)}
      </div>
      ${field('رتبة "غير متحقق" تنشال بعد التحقق (اختياري)', `<select class="select" id="vf-remove">${roleOpts(V.removeRoleId, 'بدون')}</select>`)}
      <div class="row">
        ${field('عنوان الرسالة', `<input class="input" id="vf-title" maxlength="100" value="${esc(V.title)}">`)}
        ${field('نص الرسالة', `<input class="input" id="vf-text" maxlength="1500" value="${esc(V.text)}">`)}
      </div>
      ${premiumBlock(`<div class="row">
          ${field('طريقة التحقق', `<select class="select" id="vf-mode"><option value="button" ${V.mode !== 'captcha' ? 'selected' : ''}>زر فقط</option><option value="captcha" ${V.mode === 'captcha' ? 'selected' : ''}>كابتشا بصورة</option></select>`)}
          ${field('أقل عمر للحساب (أيام)', `<input class="input ltr" type="number" id="vf-age" min="0" max="365" value="${V.minAccountDays}">`, '0 = بدون شرط.')}
        </div>`, 'الكابتشا وعمر الحساب للبريميوم', 'captcha')}
      <button type="button" class="btn ghost mt" id="vf-publish">${icon('send')} نشر رسالة التحقق بالقناة</button>
      <div class="help">احفظ الإعدادات أول، بعدين انشر الرسالة. لو عدّلت النص بعدين، انشرها مرة ثانية وبتتحدّث نفس الرسالة.</div>`,
      'verify'
    );
  }

  // ---------- auto purge ----------
  function sPurge() {
    const purgeRow = (x = {}) => `<div class="list-item purge-row" data-row>
        <select class="select" data-f="channelId">${textOpts(x.channelId, 'اختر قناة')}</select>
        <input class="input ltr" type="number" data-f="hours" min="1" max="720" value="${x.hours || 24}" title="كل كم ساعة">
        <label class="check" title="لا تمسح الرسائل المثبتة"><input type="checkbox" data-f="keepPinned" ${x.keepPinned !== false ? 'checked' : ''}> المثبتة</label>
        <button type="button" class="icon-btn" data-purge-now title="امسح هلأ">${icon('trash')}</button>
        <button type="button" class="icon-btn" data-del>×</button></div>`;
    window.__purgeRow = purgeRow;
    return card(
      'sec-purge',
      'المسح التلقائي',
      `البوت بيمسح رسائل القناة لحاله كل فترة. مثلاً #السبام كل 24 ساعة. (المجاني ${P.plans.free.purgeChannels} قناة، البريميوم ${P.plans.premium.purgeChannels} ${crown})`,
      'trash',
      `<div class="list-editor" id="pg-list">${(S.purge || []).map(purgeRow).join('')}</div>
      <button type="button" class="btn ghost sm mt" id="pg-add">${icon('plus')} إضافة قناة</button>
      <div class="help">الرقم = كل كم ساعة. ديسكورد ما بيسمح بمسح الرسائل الأقدم من 14 يوم دفعة وحدة، فهدول بيضلوا.</div>`,
      'purge'
    );
  }

  // ---------- role menus ----------
  function sRoleMenus() {
    const list = S.roleMenus || [];
    const items = list.length
      ? list.map((m) => `<div class="gw-item"><div><b>${esc(m.title)}</b><small>${m.roles.length} رتبة · ${m.channelId ? `#${esc(M.text.find((c) => c.id === m.channelId)?.name || '؟')}` : '—'}${m.mode === 'select' ? ' · قائمة منسدلة' : ''}${m.tempMinutes ? ` · مؤقتة ${m.tempMinutes} د` : ''}</small></div>
          <div class="gw-actions"><button type="button" class="btn ghost sm" data-rm-edit="${m.id}">تعديل</button><button type="button" class="btn ghost sm" data-rm-del="${m.id}">حذف</button></div></div>`).join('')
      : '<div class="empty" style="padding:18px">ما في قوائم رتب لسا.</div>';
    return card(
      'sec-rolemenus',
      'رتب بالأزرار',
      `الأعضاء بيختاروا رتبهم بكبسة زر: ألوان، ألعاب، اهتمامات... (المجاني ${P.plans.free.roleMenus} لوحات، البريميوم ${P.plans.premium.roleMenus} ${crown})`,
      'layers',
      `<div class="gw-list" id="rm-list">${items}</div>
      <div class="rm-editor" id="rm-editor" hidden></div>
      <button type="button" class="btn primary mt" id="rm-new">${icon('plus')} قائمة جديدة</button>`
    );
  }
  function rmEditor(m = { roles: [], mode: 'buttons' }) {
    const roleRow = (r = {}) => `<div class="list-item rm-role" data-row>
        <select class="select" data-f="roleId">${roleOpts(r.roleId, 'اختر رتبة')}</select>
        <input class="input" data-f="label" maxlength="80" placeholder="اسم الزر (اختياري)" value="${esc(r.label || '')}">
        <input class="input ltr" data-f="emoji" placeholder="إيموجي" value="${esc(r.emoji || '')}">
        <select class="select" data-f="style">${[['secondary', 'رمادي'], ['primary', 'بنفسجي'], ['success', 'أخضر'], ['danger', 'أحمر']].map(([k, t]) => `<option value="${k}" ${r.style === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button type="button" class="icon-btn" data-del>×</button></div>`;
    window.__rmRole = roleRow;
    return `<input type="hidden" id="rm-id" value="${esc(m.id || '')}">
      <div class="row">${field('القناة', `<select class="select" id="rm-channel">${textOpts(m.channelId, 'اختر قناة')}</select>`)}${field('العنوان', `<input class="input" id="rm-title" maxlength="200" value="${esc(m.title || 'اختار رتبك')}">`)}</div>
      ${field('الوصف', `<textarea class="textarea" id="rm-desc" maxlength="2000">${esc(m.description || '')}</textarea>`)}
      <div class="row">${field('اللون', `<input class="input ltr" type="color" id="rm-color" value="${esc(m.color || '#7950E8')}">`)}${field('صورة (رابط https)', `<input class="input ltr" id="rm-image" value="${esc(m.image || '')}">`)}</div>
      ${toggle('rm-excl', m.exclusive, 'رتبة وحدة بس', 'إذا اختار رتبة بتنشال الثانية (مثلاً ألوان)')}
      <div class="list-editor mt" id="rm-roles">${(m.roles.length ? m.roles : [{}]).map(roleRow).join('')}</div>
      <button type="button" class="btn ghost sm mt" id="rm-role-add">${icon('plus')} إضافة رتبة</button>
      ${premiumBlock(`<div class="row">
          ${field('الشكل', `<select class="select" id="rm-mode"><option value="buttons" ${m.mode !== 'select' ? 'selected' : ''}>أزرار</option><option value="select" ${m.mode === 'select' ? 'selected' : ''}>قائمة منسدلة</option></select>`)}
          ${field('رتب مؤقتة (دقائق، 0 = دائمة)', `<input class="input ltr" type="number" id="rm-temp" min="0" max="129600" value="${m.tempMinutes || 0}">`)}</div>`, 'القوائم المنسدلة والرتب المؤقتة للبريميوم', 'roleMenusPlus')}
      <div class="inline-form mt"><button type="button" class="btn primary" id="rm-save">${icon('send')} حفظ ونشر</button><button type="button" class="btn ghost" id="rm-cancel">إلغاء</button></div>`;
  }

  // ---------- embed builder ----------
  function sEmbeds() {
    const sched = (S.scheduled || []).map((x) => `<div class="gw-item"><div><b>${esc(x.title)}</b><small>#${esc(M.text.find((c) => c.id === x.channelId)?.name || '؟')} · ${new Date(x.at).toLocaleString('ar')}${x.repeatHours ? ` · يتكرر كل ${x.repeatHours} ساعة` : ''}</small></div><div class="gw-actions"><button type="button" class="btn ghost sm" data-unsched="${x.id}">إلغاء</button></div></div>`).join('');
    return card(
      'sec-embeds',
      'صانع الإمبد',
      'صمم رسالة مرتبة (قوانين، إعلان، معلومات) وابعتها بأي قناة بدون كود. المعاينة بتتحدث وإنت بتكتب.',
      'edit',
      `<div class="emb-grid">
        <div>
          ${field('القناة', `<select class="select" id="em-channel">${textOpts('', 'اختر قناة')}</select>`)}
          ${field('نص فوق الإمبد (اختياري — للمنشن مثلاً)', `<input class="input" id="em-content" maxlength="2000">`)}
          <div class="row">${field('العنوان', `<input class="input" id="em-title" maxlength="256">`)}${field('اللون', `<input class="input ltr" type="color" id="em-color" value="#7950E8">`)}</div>
          ${field('الوصف', `<textarea class="textarea" id="em-desc" rows="6" maxlength="4000" placeholder="بتقدر تستخدم **عريض** و *مائل* و > اقتباس"></textarea>`)}
          <div class="row">${field('صورة كبيرة (رابط)', `<input class="input ltr" id="em-image">`)}${field('صورة صغيرة (رابط)', `<input class="input ltr" id="em-thumb">`)}</div>
          <div class="row">${field('نص أسفل الرسالة', `<input class="input" id="em-footer" maxlength="2048">`)}${field('زر رابط (اسم | رابط)', `<input class="input" id="em-btn" placeholder="موقعنا | https://...">`)}</div>
          <div class="inline-form mt"><button type="button" class="btn primary" id="em-send">${icon('send')} إرسال هلأ</button></div>
          ${premiumBlock(`<div class="group-title" style="margin-top:14px">جدولة وإرسال باسم خاص</div>
            <div class="row">${field('وقت الإرسال', `<input class="input ltr" type="datetime-local" id="em-at">`)}${field('تكرار كل (ساعات، 0 = مرة)', `<input class="input ltr" type="number" id="em-rep" min="0" max="720" value="0">`)}</div>
            <div class="row">${field('اسم المرسل', `<input class="input" id="em-sname" maxlength="80" placeholder="إدارة السيرفر">`)}${field('صورة المرسل (رابط)', `<input class="input ltr" id="em-savatar">`)}</div>
            <button type="button" class="btn ghost" id="em-schedule">${icon('clock')} جدولة</button>
            <div class="gw-list mt" id="em-sched">${sched}</div>`, 'الجدولة والإرسال باسم خاص للبريميوم', 'embedSchedule')}
        </div>
        <div><div class="group-title">معاينة</div><div class="emb-prev" id="em-prev"></div></div>
      </div>`
    );
  }
  function embedData() {
    const v = (x) => document.getElementById(x)?.value || '';
    const [bl, bu] = v('em-btn').split('|').map((t) => t.trim());
    return { content: v('em-content'), title: v('em-title'), description: v('em-desc'), color: v('em-color'), image: v('em-image'), thumbnail: v('em-thumb'), footer: v('em-footer'), buttons: bl && bu ? [{ label: bl, url: bu }] : [] };
  }
  function md(t) {
    return esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/^&gt; (.*)$/gm, '<span class="q">$1</span>')
      .replace(/\n/g, '<br>');
  }
  function drawEmbed() {
    const box = document.getElementById('em-prev');
    if (!box) return;
    const e = embedData();
    const sname = document.getElementById('em-sname')?.value;
    box.innerHTML = `<div class="dc-msg"><div class="dc-ava"></div><div class="dc-body"><div class="dc-name">${esc(sname || 'MarkaBot')} <span class="dc-bot">BOT</span></div>
      ${e.content ? `<div class="dc-text">${md(e.content)}</div>` : ''}
      ${e.title || e.description || e.image ? `<div class="dc-embed" style="border-color:${esc(e.color)}">
        ${e.thumbnail ? `<img class="dc-thumb" src="${esc(e.thumbnail)}" alt="">` : ''}
        ${e.title ? `<div class="dc-title">${esc(e.title)}</div>` : ''}${e.description ? `<div class="dc-desc">${md(e.description)}</div>` : ''}
        ${e.image ? `<img class="dc-img" src="${esc(e.image)}" alt="">` : ''}${e.footer ? `<div class="dc-foot">${esc(e.footer)}</div>` : ''}</div>` : ''}
      ${e.buttons.length ? `<div class="dc-btns">${e.buttons.map((b) => `<span>${esc(b.label)} ↗</span>`).join('')}</div>` : ''}</div></div>`;
  }

  // ---------- community: kafeel, wrapped, prayer ----------
  function sKafeel() {
    const K = S.kafeel;
    return card(
      'sec-kafeel',
      'الكفيل 🤝',
      'كل عضو جديد البوت بيربطه بعضو نشيط يكون كفيله. إذا الجديد تفاعل، الاثنين بياخدوا XP. هيك الجداد ما بيطلعوا بعد يوم.',
      'users',
      `${toggle('kf-enabled', K.enabled, 'تفعيل الكفيل')}
      <div class="row">
        ${field('قناة إعلان الكفالة', `<select class="select" id="kf-channel">${textOpts(K.channelId, 'قناة النظام')}</select>`)}
        ${field('رتبة الكفلاء (اختياري)', `<select class="select" id="kf-role">${roleOpts(K.sponsorRoleId, 'أنشط أعضاء الأسبوع')}</select>`, 'فاضي = البوت بيختار من أنشط أعضاء الأسبوع.')}
      </div>
      <div class="row-3">
        ${field('عدد الرسائل المطلوبة', `<input class="input ltr" type="number" id="kf-goal" min="3" max="500" value="${K.goalMessages}">`)}
        ${field('خلال (أيام)', `<input class="input ltr" type="number" id="kf-days" min="1" max="30" value="${K.days}">`)}
        ${field('المكافأة (XP لكل واحد)', `<input class="input ltr" type="number" id="kf-xp" min="0" max="5000" value="${K.rewardXp}">`)}
      </div>
      ${field('أقصى عدد يكفلهم العضو بنفس الوقت', `<input class="input ltr" type="number" id="kf-max" min="1" max="20" value="${K.maxPerSponsor}" style="max-width:140px">`)}
      <div class="help">لازم نظام المستويات يكون شغال عشان المكافأة توصل. الأعضاء بيشوفوا حالتهم بأمر <code>/kafeel</code>.</div>`,
      'kafeel'
    );
  }
  function sWrapped() {
    const Wr = S.wrapped;
    const cityKey = Object.entries(S.prayerCities).find(([k]) => k === S.prayer.city)?.[0] || 'amman';
    return card(
      'sec-wrapped',
      'ملخص السيرفر 📊',
      'أول كل شهر البوت بينزّل بطاقة فيها: أنشط عضو، ملك الفويس، صاحب أكثر صدى، الأعضاء الجداد، عدد الرسائل، وأكثر ساعة تفاعل.',
      'chart',
      `${toggle('wr-enabled', Wr.enabled, 'تفعيل الملخص الشهري')}
      <div class="row">
        ${field('قناة الملخص', `<select class="select" id="wr-channel">${textOpts(Wr.channelId, 'اختر قناة')}</select>`)}
        ${field('توقيت السيرفر', `<select class="select" id="wr-city">${Object.entries(S.prayerCities).map(([k, n]) => `<option value="${k}" ${k === cityKey ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`, 'لحساب "أكثر ساعة تفاعل".')}
      </div>
      ${premiumBlock(`<div class="row">
          <div>${toggle('wr-weekly', Wr.weekly, 'ملخص أسبوعي كمان', 'كل يوم اثنين')}</div>
          ${field('لون البطاقة', `<input class="input ltr" type="color" id="wr-accent" value="${esc(Wr.accent || '#7950E8')}">`)}
        </div>`, 'الملخص الأسبوعي والتصميم الخاص للبريميوم', 'wrappedPlus')}
      <button type="button" class="btn ghost mt" id="wr-post">${icon('send')} انشر ملخص هالشهر لحد هلأ</button>
      <div class="help">الأعضاء بيقدروا يشوفوا الملخص بأمر <code>/wrapped</code>. الإحصائيات بتبلش تنحسب من يوم ما تحدّث البوت.</div>`,
      'wrapped'
    );
  }
  function sPrayer() {
    const Pr = S.prayer;
    const pn = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    return card(
      'sec-prayer',
      'أوقات الصلاة ورمضان 🕌',
      'تنبيه الأذان بقناة حسب مدينتك. وبرمضان: تذكير السحور، وتنبيه الإفطار بدل المغرب.',
      'clock',
      `${toggle('pr-enabled', Pr.enabled, 'تفعيل تنبيه الأذان')}
      <div class="row">
        ${field('القناة', `<select class="select" id="pr-channel">${textOpts(Pr.channelId, 'اختر قناة')}</select>`)}
        ${field('المدينة', `<select class="select" id="pr-city">${Object.entries(S.prayerCities).map(([k, n]) => `<option value="${k}" ${k === Pr.city ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`)}
      </div>
      ${field('منشن رتبة (اختياري)', `<select class="select" id="pr-role">${roleOpts(Pr.roleId, 'بدون منشن')}</select>`)}
      <div class="field"><label>الصلوات</label><div class="check-grid">${Object.entries(pn).map(([k, n]) => `<label class="check"><input type="checkbox" data-prayer="${k}" ${(Pr.prayers || []).includes(k) ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>
      <div class="row">
        <div>${toggle('pr-ramadan', Pr.ramadan, 'وضع رمضان', 'بيشتغل لحاله بشهر رمضان حسب التقويم الهجري')}</div>
        ${field('تذكير السحور قبل الفجر بـ (دقائق)', `<input class="input ltr" type="number" id="pr-suhoor" min="10" max="120" value="${Pr.suhoorMinutes}">`)}
      </div>
      <div class="help">المواقيت محسوبة فلكياً لكل مدينة، وممكن تختلف دقيقة أو دقيقتين عن إعلان المسجد. الأعضاء بيشوفوا مواقيت اليوم بأمر <code>/prayer</code>.</div>`,
      'prayer'
    );
  }
  function sStaff() {
    const R = S.staffReport;
    return card(
      'sec-staff',
      'تقرير أداء الإدارة 📋',
      'لكل إداري: التذاكر اللي استلمها وسكّرها، تقييماته، رسائله، أيام نشاطه، وقته بالفويس، وآخر نشاط إله — آخر 30 يوم.',
      'chart',
      `<div class="inline-form"><button type="button" class="btn primary" id="st-run">${icon('chart')} اطلع التقرير</button>
        <span class="faint" id="st-note">${paid() || isPrem('staffReport') ? 'بالبريميوم بتطلبه وقت ما بدك.' : R.ok ? 'المجاني: تقرير وحد كل 30 يوم.' : `التقرير الجاي متاح ${new Date(R.nextAt).toLocaleDateString('ar')} — بالبريميوم ${crown} وقت ما بدك.`}</span></div>
      <div id="st-out" class="mt"></div>
      <div class="help">الرسائل بتنحسب من يوم ما تحدّث البوت. الإداري = اللي عنده صلاحية إدارة الرسائل أو رتبة المدراء أو رتبة الدعم. بتقدر كمان تستخدم أمر <code>/staff-report</code>.</div>`
    );
  }

  // ---------- boot ----------
  (async () => {
    await MB.topbar({ guild: true });
    [S, M, EMO, GEMO] = await Promise.all([
      api(`/api/settings/${id}`),
      api(`/api/guild-metadata/${id}`),
      api('/api/emojis').catch(() => null),
      api(`/api/guild-emojis/${id}`).catch(() => null),
    ]);
    P = S.premium;
    if (!P) throw new Error('لوحة التحكم تحدّثت لكن البوت ما زال يعمل بالنسخة القديمة — أعد تشغيل البوت من الاستضافة ثم حدّث الصفحة');
    if (!EMO?.canEdit) EMO = null;
    document.getElementById('cards').innerHTML = [
      sPremium(), sGeneral(), sBotProfile(), sWelcome(), sTickets(), sGwManage(), sGiveaway(), sModNote(), sAutomod(), sVerify(), sProtection(), sJail(), sVanity(), sPurge(), sRoleMenus(), sEmbeds(), sKafeel(), sWrapped(), sPrayer(), sStaff(), sLogs(), sInvites(), sAutoLine(), sFeedback(), sReplies(), sLevels(), sGuildEmojis(), sEmojis(),
    ].join('');
    arrangeGroups();
    renderChips('autoline');
    renderChips('feedback');
    renderChips('lvch');
    renderChips('lvroles');
    renderChips('amch');
    renderChips('amroles');
    renderChips('grch');
    drawEmbed();
    bind();
    bindGiveaways();
    weBind();
    const g = await MB.guildSidebar('settings');
    MB.guildName = g?.name;
    window.addEventListener('hashchange', showGroup);
    showGroup();
    loadStaff();
    loadAnalytics();
  })().catch((e) => toast(e.message, 'error', 6000));
})();
