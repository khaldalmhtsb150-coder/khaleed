/* MarkaBot — public landing page */
(function () {
  const L = MB.lang;
  const S = {
    ar: {
      home: 'الرئيسية', commands: 'الأوامر', features: 'المميزات', pricing: 'الأسعار', login: 'تسجيل الدخول', dashboard: 'لوحة التحكم',
      made: 'صُنع في ماركا — عمّان، الأردن',
      h1a: 'سيرفرك.', h1b: 'مملكتك.',
      sub: 'كل اللي يحتاجه مجتمعك على ديسكورد — بمنصة وحدة قوية، عربية من الأساس، وبلوحة تحكم بتدير منها كل إشي.',
      explore: 'استكشف لوحة التحكم', inviteBot: 'أضف MarkaBot',
      live: { servers: 'سيرفر', users: 'عضو', commands: 'أمر', ping: 'زمن الاستجابة' },
      credHero: 'الصورة: العبدلي، عمّان — Daniel Qura / Unsplash',
      fK: 'المميزات', fH: 'كل الأنظمة اللي بتحتاجها، شغالة فعلاً', fP: 'كل ميزة هون موجودة بالبوت اليوم ومربوطة بلوحة التحكم.',
      aK: 'من عمّان', aH: 'هوية أردنية، بمعايير عالمية', aP: 'MarkaBot انبنى بماركا — وهاي المدينة اللي ألهمت شكله.',
      capMosque: 'مسجد الملك المؤسس عبدالله الأول', capAbdali: 'العبدلي — عمّان الجديدة', capHills: 'بيوت عمّان على التلال',
      altMosque: 'مسجد الملك عبدالله الأول في عمّان ليلاً بقبته الزرقاء', altAbdali: 'أبراج مشروع العبدلي في عمّان', altHills: 'مباني عمّان الحجرية على التلال',
      dK: 'لوحة التحكم', dH: 'تحكم كامل، بدون أوامر', dP: 'لقطة حقيقية من واجهة لوحة التحكم (ببيانات تجريبية) — كل قسم إله صفحته، وكل تغيير بيوصل للبوت فوراً.',
      dList: ['نظرة عامة بإحصائيات وأحداث السيرفر الحقيقية', 'إنشاء وإدارة القيفاواي وإعادة السحب', 'محرر صورة الترحيب بالسحب', 'عربي وإنجليزي، على الكمبيوتر والجوال'],
      cK: 'الأوامر', cH: 'أوامر جاهزة لكل شغلة', cPn: (n) => `${n} أمر — سلاش ($) وبادئة، ومعها اختصارات خاصة بكل سيرفر.`,
      cat: { channels: 'القنوات', config: 'الإعدادات', general: 'عام', giveaway: 'القيفاواي', greetings: 'الترحيب', invites: 'الدعوات والعجلة', levels: 'المستويات', community: 'المجتمع', logs: 'السجلات', moderation: 'الإشراف', tickets: 'التذاكر' },
      pK: 'الأسعار', pH: 'ابدأ مجاناً، ورقّي لما تكبر', pP: 'المجاني فيه كل الأنظمة الأساسية. البريميوم بيفتح التخصيص والحماية المتقدمة.',
      free: 'مجاني', premium: 'بريميوم', freeD: 'لكل السيرفرات', premD: 'لكل سيرفر، بكود تفعيل', startFree: 'أضف البوت مجاناً', getPrem: 'اطلب كود بريميوم',
      freeF: ['AutoMod أساسي، تحقق بزر، وAnti-Nuke', 'تذاكر (4 أقسام) وقيفاواي بلا حدود', 'مستويات XP كاملة مع الصدى', 'الكفيل، أوقات الصلاة، وملخص شهري', 'صانع الإمبد و3 لوحات رتب', 'تقرير أداء الإدارة مرة بالشهر'],
      premF: ['شكل البوت باسمك وصورتك وإيموجياتك', 'Anti-Raid وكشف انتحال الإدارة', 'AutoMod متقدم وكابتشا بالصورة', '25 قسم تذاكر، فورم أسئلة وإحصائيات', 'جدولة الإمبد، رتب مؤقتة، ومضاعفة XP', 'تقرير الإدارة وقت ما بدك، وملخص أسبوعي'],
      qH: 'أسئلة شائعة',
      faqs: [
        ['هل البوت مجاني؟', 'نعم. كل الأنظمة الأساسية مجانية. البريميوم اختياري ويتفعّل لكل سيرفر بكود.'],
        ['هل يدعم العربي بالكامل؟', 'البوت ولوحة التحكم مبنيين بالعربي من الأساس، مع دعم الإنجليزي بالموقع.'],
        ['كيف أفعّل البريميوم؟', 'بعد ما تحصل على كود، اكتب /premium code: بسيرفرك أو فعّله من صفحة البريميوم بلوحة التحكم.'],
        ['مين بيقدر يدخل لوحة التحكم؟', 'أي حدا عنده صلاحية إدارة السيرفر، أو رتبة المدراء اللي بتحددها من الإعدادات.'],
      ],
      endH: 'جاهز تبني مملكتك؟', footTag: 'بوت ديسكورد عربي متكامل — صُنع في عمّان.', product: 'المنتج', support: 'الدعم', invite: 'إضافة البوت', supportServer: 'سيرفر الدعم', faq: 'الأسئلة الشائعة', photos: 'حقوق الصور', rights: 'جميع الحقوق محفوظة',
      errState: 'انتهت صلاحية طلب الدخول، حاول مجدداً.', errOauth: 'تعذر تسجيل الدخول عبر ديسكورد، تحقق من إعدادات OAuth2.',
    },
    en: {
      home: 'Home', commands: 'Commands', features: 'Features', pricing: 'Pricing', login: 'Log in', dashboard: 'Dashboard',
      made: 'Made in Marka — Amman, Jordan',
      h1a: 'Your Server.', h1b: 'Your Kingdom.',
      sub: 'Everything your Discord community needs. One powerful platform — Arabic-first, with a dashboard that runs it all.',
      explore: 'Explore Dashboard', inviteBot: 'Invite MarkaBot',
      live: { servers: 'servers', users: 'members', commands: 'commands', ping: 'latency' },
      credHero: 'Photo: Abdali, Amman — Daniel Qura / Unsplash',
      fK: 'Features', fH: 'Every system you need — and it actually works', fP: 'Everything here exists in the bot today and is wired to the dashboard.',
      aK: 'From Amman', aH: 'A Jordanian identity, built to world standards', aP: 'MarkaBot was built in Marka — this is the city that shaped its look.',
      capMosque: 'King Abdullah I Mosque', capAbdali: 'Abdali — Amman’s new downtown', capHills: 'Amman’s stone houses on the hills',
      altMosque: 'King Abdullah I Mosque in Amman at night with its blue dome', altAbdali: 'Towers of the Abdali project in Amman', altHills: 'Amman stone buildings on the hills',
      dK: 'Dashboard', dH: 'Full control, no commands needed', dP: 'A real screenshot of the dashboard interface (with sample data) — every section has its own page, and every change reaches the bot instantly.',
      dList: ['Overview with your server’s real stats and events', 'Create, end and reroll giveaways', 'Drag-and-drop welcome image editor', 'Arabic and English, on desktop and mobile'],
      cK: 'Commands', cH: 'A command for everything', cPn: (n) => `${n} commands — slash and prefix, plus per-server shortcuts.`,
      cat: { channels: 'Channels', config: 'Configuration', general: 'General', giveaway: 'Giveaways', greetings: 'Welcome', invites: 'Invites & wheel', levels: 'Levels', community: 'Community', logs: 'Logs', moderation: 'Moderation', tickets: 'Tickets' },
      pK: 'Pricing', pH: 'Start free, upgrade as you grow', pP: 'Free includes every core system. Premium unlocks customization and advanced protection.',
      free: 'Free', premium: 'Premium', freeD: 'For every server', premD: 'Per server, with an activation code', startFree: 'Add the bot for free', getPrem: 'Request a premium code',
      freeF: ['Basic AutoMod, button verification and Anti-Nuke', 'Tickets (4 categories) and unlimited giveaways', 'Full XP levels with Echo', 'Sponsors, prayer times and a monthly summary', 'Embed builder and 3 role menus', 'Staff report once a month'],
      premF: ['Your own bot name, avatar and emojis', 'Anti-Raid and impersonation detection', 'Advanced AutoMod and image captcha', '25 ticket categories, forms and stats', 'Scheduled embeds, temporary roles, XP boosts', 'Staff report any time, and a weekly summary'],
      qH: 'FAQ',
      faqs: [
        ['Is the bot free?', 'Yes. Every core system is free. Premium is optional and activated per server with a code.'],
        ['Does it fully support Arabic?', 'The bot and dashboard are built Arabic-first, and the website also supports English.'],
        ['How do I activate premium?', 'Once you have a code, run /premium code: in your server or activate it from the Premium page in the dashboard.'],
        ['Who can use the dashboard?', 'Anyone with Manage Server permission, or the manager role you choose in settings.'],
      ],
      endH: 'Ready to build your kingdom?', footTag: 'An all-in-one, Arabic-first Discord bot — made in Amman.', product: 'Product', support: 'Support', invite: 'Invite the bot', supportServer: 'Support server', faq: 'FAQ', photos: 'Photo credits', rights: 'All rights reserved',
      errState: 'Your login request expired — please try again.', errOauth: 'Discord login failed — check the OAuth2 settings.',
    },
  }[L];

  const $ = (id) => document.getElementById(id);
  const ic = MB.icon;

  // static text
  document.querySelectorAll('[data-i]').forEach((el) => {
    const v = S[el.dataset.i];
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll('[data-alt]').forEach((img) => (img.alt = S[img.dataset.alt] || ''));
  $('logo').innerHTML = MB.logo('/');
  $('logo2').innerHTML = MB.logo('/');
  $('lang').innerHTML = MB.langSwitch();
  $('lang2').innerHTML = MB.langSwitch();
  $('year').textContent = new Date().getFullYear();
  $('burger').innerHTML = ic('menu');
  const ctaDash = `${S.explore} ${ic('arrowRight')}`;
  $('ctaDash').innerHTML = ctaDash;
  $('ctaDash2').innerHTML = ctaDash;
  $('ctaDash3').innerHTML = S.explore;
  $('ctaInvite').innerHTML = `${ic('plus')} ${S.inviteBot}`;
  $('ctaInvite2').innerHTML = `${ic('plus')} ${S.inviteBot}`;
  $('shotImg').src = `/static/img/dashboard-overview-${L}.png`;
  $('shotImg').alt = L === 'ar' ? 'لقطة حقيقية من صفحة النظرة العامة في لوحة التحكم' : 'Real screenshot of the dashboard overview page';
  $('shot2').alt = L === 'ar' ? 'لقطة حقيقية من محرر صورة الترحيب' : 'Real screenshot of the welcome image editor';
  document.title = `MarkaBot — ${S.h1a} ${S.h1b}`;

  // features (real systems only)
  const F = L === 'ar'
    ? [
        ['shield', 'إشراف وAutoMod', 'فلاتر الكلمات والروابط والسبام، تحقق للأعضاء الجداد، سجن بحفظ الرتب، وAnti-Nuke.'],
        ['ticket', 'نظام تذاكر', 'أقسام، استلام وإغلاق، نسخ HTML للمحادثات، تقييم للدعم وتقرير أداء الإدارة.'],
        ['gift', 'إدارة القيفاواي', 'إنشاء وإنهاء وإعادة سحب من الأوامر أو اللوحة، بشروط ورسائل مخصصة.'],
        ['trophy', 'مستويات و«الصدى»', 'XP للكتابة والفويس، بطاقة رانك، توب، رتب مكافآت — والصدى بيكافئ اللي بيفتح سوالف.'],
        ['users', 'المجتمع', 'الكفيل للأعضاء الجداد، ملخص السيرفر الشهري، وأوقات الصلاة ووضع رمضان.'],
        ['wave', 'الترحيب', 'صورة ترحيب بتصممها بالسحب، ورسالة بمتغيرات الدعوات.'],
        ['edit', 'رسائل ورتب', 'صانع إمبد بمعاينة حية، ولوحات رتب بالأزرار.'],
        ['terminal', 'أدوات ودعوات', 'ردود تلقائية، سجلات كاملة، مسح تلقائي، تتبع الدعوات وعجلة جوائز.'],
      ]
    : [
        ['shield', 'Moderation & AutoMod', 'Word, link and spam filters, verification for new members, jail with role restore, and Anti-Nuke.'],
        ['ticket', 'Ticket system', 'Categories, claim and close, HTML transcripts, staff ratings and a staff performance report.'],
        ['gift', 'Giveaway management', 'Create, end and reroll from commands or the dashboard, with requirements and custom messages.'],
        ['trophy', 'Levels & Echo', 'Text and voice XP, rank cards, leaderboards, role rewards — and Echo, which rewards members who start conversations.'],
        ['users', 'Community', 'Sponsors for new members, a monthly server summary, and prayer times with Ramadan mode.'],
        ['wave', 'Welcome', 'A drag-and-drop welcome image and a message with invite variables.'],
        ['edit', 'Messages & roles', 'An embed builder with live preview, and button role menus.'],
        ['terminal', 'Utilities & invites', 'Auto responses, full logging, auto purge, invite tracking and a reward wheel.'],
      ];
  $('feats').innerHTML = F.map(([i, t, d], k) => `<article class="lp-feat reveal" style="--d:${k * 50}ms"><span class="ic">${ic(i)}</span><h3>${t}</h3><p>${d}</p></article>`).join('');

  $('dList').innerHTML = S.dList.map((x) => `<li>${ic('check')}<span>${x}</span></li>`).join('');

  // pricing
  const plan = (name, desc, feats, cta, href, hi) => `<div class="lp-plan ${hi ? 'hi' : ''} reveal">
      <div class="lp-plan-top">${hi ? `<span class="pill ice">${ic('crown')} ${S.premium}</span>` : `<span class="pill">${S.free}</span>`}<h3>${name}</h3><p>${desc}</p></div>
      <ul>${feats.map((f) => `<li>${ic('check')}<span>${f}</span></li>`).join('')}</ul>
      <a class="btn ${hi ? 'primary' : 'ghost'}" href="${href}" ${href.startsWith('http') || href === '/invite' ? 'target="_blank" rel="noopener"' : ''}>${cta}</a>
    </div>`;

  // FAQ
  $('faqList').innerHTML = S.faqs.map(([q, a]) => `<details class="reveal"><summary>${q}${ic('plus')}</summary><p>${a}</p></details>`).join('');

  // live data from the bot
  fetch('/api/stats').then((r) => r.json()).then((s) => {
    if (s.ready) {
      const d = $('live');
      d.innerHTML = [['servers', s.servers], ['users', s.users], ['commands', s.commands]]
        .map(([k, v]) => `<div><dt>${S.live[k]}</dt><dd>${MB.num(v)}</dd></div>`)
        .join('') + `<div><dt>${S.live.ping}</dt><dd>${s.ping}ms</dd></div>`;
      d.hidden = false;
    }
    if (s.launch?.active) launchBar(s.launch);
    const sup = $('supportLink');
    if (s.support) { sup.href = s.support; sup.hidden = false; }
    $('plans').innerHTML = plan(S.free, S.freeD, S.freeF, S.startFree, '/invite') + plan(S.premium, S.premD, S.premF, S.getPrem, s.support || '/login', true);
    observe();
  }).catch(() => {
    $('plans').innerHTML = plan(S.free, S.freeD, S.freeF, S.startFree, '/invite') + plan(S.premium, S.premD, S.premF, S.getPrem, '/login', true);
    observe();
  });

  fetch('/api/public/commands').then((r) => r.json()).then((cats) => {
    const total = Object.values(cats).reduce((a, l) => a + l.length, 0);
    $('cP').textContent = S.cPn(total);
    const icons = { community: 'users', levels: 'trophy', channels: 'hash', config: 'sliders', general: 'grid', giveaway: 'gift', greetings: 'wave', invites: 'link', logs: 'log', moderation: 'shield', tickets: 'ticket' };
    $('cmds').innerHTML = Object.entries(cats)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([cat, list]) => `<div class="lp-cmd reveal"><div class="lp-cmd-h"><span class="ic">${ic(icons[cat] || 'terminal')}</span><b>${S.cat[cat] || cat}</b><span class="pill">${list.length}</span></div>
        <ul>${list.slice(0, 6).map((c) => `<li><code>/${MB.esc(c.name)}</code><span>${MB.esc(c.description)}</span></li>`).join('')}</ul></div>`)
      .join('');
    observe();
  }).catch(() => { $('cmds').innerHTML = ''; });

  // launch period banner with a live countdown
  function launchBar(l) {
    const bar = document.createElement('div');
    bar.className = 'launch-bar';
    const nav = $('nav');
    nav.prepend(bar);
    const tick = () => {
      const ms = l.endsAt ? l.endsAt - Date.now() : null;
      const d = ms ? Math.floor(ms / 864e5) : 0;
      const h = ms ? Math.floor((ms % 864e5) / 36e5) : 0;
      const m = ms ? Math.floor((ms % 36e5) / 6e4) : 0;
      const left = ms && ms > 0 ? (L === 'ar' ? `باقي <b>${d}ي ${h}س ${m}د</b>` : `<b>${d}d ${h}h ${m}m</b> left`) : '';
      bar.innerHTML = L === 'ar'
        ? `🎉 فترة الإطلاق: كل ميزات البريميوم مجانية! ${left}${l.giftDays ? ` · وبعدها ${l.giftDays} يوم بريميوم هدية` : ''}`
        : `🎉 Launch period: every premium feature is free! ${left}${l.giftDays ? ` · then a ${l.giftDays}-day premium gift` : ''}`;
    };
    tick();
    setInterval(tick, 30_000);
  }

  // login errors
  const e = new URLSearchParams(location.search).get('error');
  if (e) {
    $('err').style.display = 'block';
    $('err').textContent = e === 'state' ? S.errState : S.errOauth;
    document.querySelector('.lp-final').scrollIntoView();
  }

  // ---------- motion ----------
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // "seven hills" contour lines under the dashboard
  (function hills() {
    const svg = $('hills');
    let out = '';
    for (let i = 0; i < 7; i++) {
      const y = 60 + i * 28;
      let d = `M0 ${y}`;
      for (let x = 0; x <= 1200; x += 20) d += ` L${x} ${(y + 16 * Math.sin(x / 140 + i * 0.6) + 8 * Math.sin(x / 47 - i)).toFixed(1)}`;
      out += `<path d="${d}" fill="none" stroke="${i % 2 ? '#91C8FF' : '#A78BFA'}" stroke-opacity="${0.08 + i * 0.02}" stroke-width="1"/>`;
    }
    svg.innerHTML = out;
  })();

  // light trail draws itself
  const trail = $('trail');
  if (trail && !reduce) {
    const len = trail.getTotalLength();
    trail.style.strokeDasharray = `${len}`;
    trail.style.strokeDashoffset = `${len}`;
    requestAnimationFrame(() => {
      trail.style.transition = 'stroke-dashoffset 2.4s cubic-bezier(.2,.7,.2,1) .3s';
      trail.style.strokeDashoffset = '0';
    });
  }

  // photo parallax + nav state
  const photo = $('heroPhoto');
  const nav = $('nav');
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      nav.classList.toggle('scrolled', y > 12);
      if (!reduce && y < innerHeight * 1.2) photo.style.transform = `translate3d(0, ${y * 0.25}px, 0) scale(1.06)`;
      ticking = false;
    });
  }, { passive: true });

  // dashboard screenshot tilts gently with the pointer
  const shot = $('shot');
  if (!reduce && matchMedia('(pointer: fine)').matches) {
    document.querySelector('.lp-hero').addEventListener('pointermove', (ev) => {
      const nx = ev.clientX / innerWidth - 0.5;
      const ny = ev.clientY / innerHeight - 0.5;
      shot.style.transform = `perspective(1400px) rotateX(${(6 - ny * 4).toFixed(2)}deg) rotateY(${(nx * 5).toFixed(2)}deg)`;
    });
  }

  // mobile menu
  $('burger').addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    $('burger').setAttribute('aria-expanded', String(open));
  });
  $('sheet').addEventListener('click', (ev) => { if (ev.target.closest('a')) nav.classList.remove('open'); });

  // reveal on scroll
  let io = null;
  function observe() {
    if (reduce || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
      return;
    }
    io = io || new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
  }
  observe();

  // hide broken images gracefully
  document.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.closest('figure, .lp-shot')?.classList.add('img-missing')));
})();
