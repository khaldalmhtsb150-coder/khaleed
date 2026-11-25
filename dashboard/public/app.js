const AVA_FB = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#1e2236"/><circle cx="16" cy="13" r="5" fill="#a78bfa"/><path d="M7 27c1.6-4.6 5-7 9-7s7.4 2.4 9 7" fill="#a78bfa"/></svg>');
/* MarkaBot dashboard — shared client helpers (shell, icons, i18n, api) */
(function () {
  // Lucide-style icons (24×24, stroke)
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    grid: '<rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/>',
    terminal: '<path d="m5 8 4 4-4 4M12 16h7"/><rect x="2" y="3" width="20" height="18" rx="2"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    voice: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    wave: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    line: '<path d="M3 12h18"/><path d="M3 7h18M3 17h18" opacity=".35"/>',
    chat: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
    reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12" stroke-dasharray="2 2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 9M22 21a7 7 0 0 0-4-6.3"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9M12 8S10 3 7.5 4.5 9 8 12 8zm0 0s2-5 4.5-3.5S15 8 12 8z"/>',
    log: '<path d="M15 12h-5M15 8h-5M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    arrow: '<path d="M15 6l-6 6 6 6"/>',
    arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    role: '<circle cx="12" cy="8" r="5"/><path d="M3 21a9 9 0 0 1 18 0"/>',
    discord: '<path d="M8.5 12.5h.01M15.5 12.5h.01"/><path d="M7 17c-2 0-4-1-4-1s0-6 2-10c2-1.5 4-2 4-2l1 2h4l1-2s2 .5 4 2c2 4 2 10 2 10s-2 1-4 1l-1.5-2.5M7.5 15.5c3 1.5 6 1.5 9 0"/>',
    crown: '<path d="m3 8 4 4 5-7 5 7 4-4-2 11H5z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c1 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.6-1.7h2a5.6 5.6 0 0 0 5.6-5.5C22 6 17.5 2 12 2z"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    chevrons: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>',
    stop: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    chart: '<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>',
    gavel: '<path d="m14 13-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  };
  const icon = (name, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // the MarkaBot emblem: an "M" drawn as two towers joined by a roofline, with an ice-blue light on top
  const logoSvg = () =>
    '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="9" fill="#141733" stroke="rgba(167,139,250,.35)"/><path d="M8.5 23.5V10l7.5 6.5 7.5-6.5v13.5" fill="none" stroke="#A78BFA" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 23.5V10" stroke="#7950E8" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="8.4" r="1.7" fill="#91C8FF"/></svg>';
  const logo = (href = '/') => `<a class="mk-logo" href="${href}">${logoSvg()}<b>Marka<em>Bot</em></b></a>`;

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- language ----------
  const DICT = {
    ar: {
      home: 'الرئيسية', servers: 'السيرفرات', invite: 'إضافة البوت', login: 'تسجيل الدخول', logout: 'تسجيل الخروج', myServers: 'سيرفراتي', ownerPanel: 'لوحة المالك',
      allServers: 'كل السيرفرات', general: 'عام', management: 'الإدارة', engagement: 'التفاعل', bot: 'البوت',
      overview: 'نظرة عامة', settings: 'إعدادات السيرفر', moderation: 'الإشراف والحماية', giveaways: 'القيفاواي', tickets: 'التذاكر', welcome: 'الترحيب',
      responses: 'الردود التلقائية', invites: 'الدعوات والعجلة', levels: 'المستويات', rolemenus: 'رتب بالأزرار', embeds: 'صانع الإمبد', community: 'المجتمع', staff: 'أداء الإدارة', logs: 'السجلات', customization: 'التخصيص', commands: 'الأوامر', premium: 'البريميوم', more: 'المزيد', members: 'عضو',
    },
    en: {
      home: 'Home', servers: 'Servers', invite: 'Invite bot', login: 'Log in', logout: 'Log out', myServers: 'My servers', ownerPanel: 'Owner panel',
      allServers: 'All servers', general: 'General', management: 'Management', engagement: 'Engagement', bot: 'Bot',
      overview: 'Overview', settings: 'Server settings', moderation: 'Moderation', giveaways: 'Giveaways', tickets: 'Tickets', welcome: 'Welcome',
      responses: 'Auto responses', invites: 'Invites & wheel', levels: 'Levels', rolemenus: 'Role menus', embeds: 'Embed builder', community: 'Community', staff: 'Staff report', logs: 'Logs', customization: 'Customization', commands: 'Commands', premium: 'Premium', more: 'More', members: 'members',
    },
  };
  let lang = 'ar';
  try {
    lang = localStorage.getItem('mk-lang') || 'ar'; // Arabic first; English from the language switch
  } catch {}
  if (!DICT[lang]) lang = 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const t = (k) => DICT[lang][k] ?? DICT.ar[k] ?? k;
  const setLang = (l) => {
    try {
      localStorage.setItem('mk-lang', l);
    } catch {}
    location.reload();
  };
  // ---------- theme ----------
  const THEMES = ['night', 'light', 'noir'];
  let theme = 'night';
  try {
    theme = localStorage.getItem('mk-theme') || 'night';
  } catch {}
  if (!THEMES.includes(theme)) theme = 'night';
  document.documentElement.dataset.theme = theme;
  const themeLabel = { night: lang === 'ar' ? 'ليلي' : 'Night', light: lang === 'ar' ? 'فاتح' : 'Light', noir: lang === 'ar' ? 'أسود وذهبي' : 'Noir' };
  const themePick = () => `<div class="theme-pick" role="group" aria-label="Theme">${THEMES.map((k) => `<button type="button" data-theme-set="${k}" class="${theme === k ? 'on' : ''}" title="${themeLabel[k]}" aria-label="${themeLabel[k]}"></button>`).join('')}</div>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]');
    if (!b) return;
    theme = b.dataset.themeSet;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('mk-theme', theme);
    } catch {}
    document.querySelectorAll('[data-theme-set]').forEach((x) => x.classList.toggle('on', x.dataset.themeSet === theme));
  });

  const langSwitch = () =>
    `<div class="lang-switch" role="group" aria-label="Language"><button type="button" data-lang="ar" class="${lang === 'ar' ? 'on' : ''}">ع</button><button type="button" data-lang="en" class="${lang === 'en' ? 'on' : ''}">EN</button></div>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (b && b.dataset.lang !== lang) setLang(b.dataset.lang);
  });
  const num = (n) => Number(n || 0).toLocaleString(lang === 'ar' ? 'ar' : 'en');

  // ---------- api ----------
  let me = null;
  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    if (init.method !== 'GET') {
      if (!me) await loadMe();
      init.headers['X-CSRF-Token'] = me?.csrf || '';
    }
    const res = await fetch(path, init);
    if (res.status === 401) {
      location.href = '/login';
      throw new Error('unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || (lang === 'ar' ? 'حدث خطأ غير متوقع' : 'Something went wrong'));
    return data;
  }
  async function loadMe() {
    me = await api('/api/me');
    return me;
  }

  function toast(message, type = 'info', ms = 3200) {
    let box = document.querySelector('.toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="bar"></span><span>${esc(message)}</span>`;
    box.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }, ms);
  }

  // ---------- top bar ----------
  async function topbar({ active = '', guild = false } = {}) {
    const stats = await fetch('/api/stats').then((r) => r.json()).catch(() => ({}));
    const user = await loadMe().catch(() => null);
    const el = document.createElement('header');
    el.className = 'topbar';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        ${guild ? `<button class="btn ghost sm mobile-toggle" id="sideToggle" aria-label="${esc(t('more'))}">${icon('menu')}</button>` : ''}
        ${logo('/home')}
      </div>
      <nav class="nav" aria-label="Main">
        <a href="/home" class="${active === 'home' ? 'active' : ''}">${t('home')}</a>
        <a href="/servers" class="${active === 'servers' ? 'active' : ''}">${t('servers')}</a>
        <a href="/invite" target="_blank" rel="noopener">${t('invite')}</a>
      </nav>
      <div class="top-actions">
        ${themePick()}
        ${langSwitch()}
        ${
          user
            ? `<div class="user-chip" id="userChip" role="button" tabindex="0" aria-haspopup="true"><span>${esc(user.username)}</span><img src="${esc(user.avatar || AVA_FB)}" alt="" onerror="this.onerror=null;this.src=AVA_FB">
                <div class="menu" id="userMenu">
                  <a href="/home">${icon('home')} ${t('home')}</a>
                  <a href="/servers">${icon('server')} ${t('myServers')}</a>
                  <a href="/owner" id="ownerLink" style="display:none">${icon('crown')} ${t('ownerPanel')}</a>
                  <a href="/logout" class="danger">${icon('logout')} ${t('logout')}</a>
                </div></div>`
            : `<a class="btn primary sm" href="/login">${t('login')}</a>`
        }
      </div>`;
    document.body.prepend(el);
    const chip = el.querySelector('#userChip');
    if (chip) {
      const toggle = (e) => {
        e.stopPropagation();
        el.querySelector('#userMenu').classList.toggle('open');
      };
      chip.addEventListener('click', toggle);
      chip.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && toggle(e));
      document.addEventListener('click', () => el.querySelector('#userMenu')?.classList.remove('open'));
    }
    el.querySelector('#sideToggle')?.addEventListener('click', () => toggleSide());
    if (user) {
      fetch('/api/owner/me', { credentials: 'same-origin' })
        .then((r) => (r.ok ? (el.querySelector('#ownerLink').style.display = '') : null))
        .catch(() => {});
    }
    document.addEventListener('click', (e) => {
      if (e.target.closest('.sidebar a')) toggleSide(false);
    });
    return { stats, user };
  }

  function toggleSide(open) {
    const side = document.querySelector('.sidebar');
    if (!side) return;
    let bd = document.querySelector('.side-backdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.className = 'side-backdrop';
      bd.addEventListener('click', () => toggleSide(false));
      document.body.appendChild(bd);
    }
    const state = open ?? !side.classList.contains('open');
    side.classList.toggle('open', state);
    bd.classList.toggle('show', state);
  }

  const guildIdFromPath = () => (location.pathname.match(/\/dashboard\/(\d+)/) || [])[1];

  // sidebar items: [key, icon, href(id), group]
  const NAV = [
    ['overview', 'grid', (id) => `/dashboard/${id}/overview`, 'general'],
    ['settings', 'sliders', (id) => `/dashboard/${id}#settings`, 'general'],
    ['commands', 'terminal', (id) => `/dashboard/${id}/commands`, 'general'],
    ['moderation', 'shield', (id) => `/dashboard/${id}#moderation`, 'management'],
    ['tickets', 'ticket', (id) => `/dashboard/${id}#tickets`, 'management'],
    ['logs', 'log', (id) => `/dashboard/${id}#logs`, 'management'],
    ['giveaways', 'gift', (id) => `/dashboard/${id}#giveaways`, 'engagement'],
    ['welcome', 'wave', (id) => `/dashboard/${id}#welcome`, 'engagement'],
    ['responses', 'chat', (id) => `/dashboard/${id}#responses`, 'engagement'],
    ['levels', 'trophy', (id) => `/dashboard/${id}#levels`, 'engagement'],
    ['rolemenus', 'layers', (id) => `/dashboard/${id}#rolemenus`, 'engagement'],
    ['embeds', 'edit', (id) => `/dashboard/${id}#embeds`, 'management'],
    ['staff', 'chart', (id) => `/dashboard/${id}#staff`, 'management'],
    ['community', 'users', (id) => `/dashboard/${id}#community`, 'engagement'],
    ['invites', 'link', (id) => `/dashboard/${id}#invites`, 'engagement'],
    ['customization', 'palette', (id) => `/dashboard/${id}#customization`, 'bot'],
    ['premium', 'crown', (id) => `/dashboard/${id}#premium`, 'bot'],
  ];

  /** Renders the server sidebar + mobile bottom nav. active = one of NAV keys. */
  async function guildSidebar(active) {
    const id = guildIdFromPath();
    const g = await api(`/api/guild/${id}`);
    document.title = `${g.name} — MarkaBot`;
    const side = document.querySelector('.sidebar');
    const groups = ['general', 'management', 'engagement', 'bot'];
    side.setAttribute('aria-label', 'Server navigation');
    side.innerHTML = `
      <button type="button" class="guild-switch" id="guildSwitch" aria-haspopup="true">
        ${g.icon ? `<img src="${esc(g.icon)}" alt="">` : `<span class="ph">${esc(g.name[0])}</span>`}
        <span style="min-width:0"><b>${esc(g.name)}</b><small>${num(g.memberCount)} ${t('members')}</small></span>
        ${icon('chevrons', 'icon chev')}
        <span class="guild-menu" id="guildMenu"><a href="/servers">${icon('arrow')} ${t('allServers')}</a></span>
      </button>
      ${groups
        .map(
          (gr) => `<div class="side-label">${t(gr)}</div>` +
            NAV.filter((n) => n[3] === gr)
              .map(([key, ic, href]) => `<a class="side-link ${active === key ? 'active' : ''}" data-nav="${key}" href="${href(id)}">${icon(ic)} ${t(key)}</a>`)
              .join('')
        )
        .join('')}
      <div class="side-lang">${langSwitch()}</div>`;

    // server switcher: lazy-load the user's servers
    const sw = side.querySelector('#guildSwitch');
    const menu = side.querySelector('#guildMenu');
    sw.addEventListener('click', async (e) => {
      if (e.target.closest('#guildMenu a')) return;
      e.stopPropagation();
      menu.classList.toggle('open');
      if (!menu.dataset.loaded) {
        menu.dataset.loaded = '1';
        const list = await api('/api/guilds').catch(() => []);
        menu.innerHTML =
          list
            .filter((x) => x.hasBot)
            .map(
              (x) => `<a href="/dashboard/${x.id}/overview" class="${x.id === id ? 'cur' : ''}">${x.icon ? `<img src="${esc(x.icon)}" alt="">` : `<span class="ph">${esc(x.name[0])}</span>`}<span>${esc(x.name)}</span></a>`
            )
            .join('') + `<a href="/servers">${icon('arrow')} ${t('allServers')}</a>`;
      }
    });
    document.addEventListener('click', () => menu.classList.remove('open'));

    // mobile bottom nav
    if (!document.querySelector('.mnav')) {
      const m = document.createElement('nav');
      m.className = 'mnav';
      m.setAttribute('aria-label', 'Quick navigation');
      const items = ['overview', 'tickets', 'giveaways', 'welcome'];
      m.innerHTML =
        items
          .map((k) => {
            const n = NAV.find((x) => x[0] === k);
            return `<a href="${n[2](id)}" data-nav="${k}" class="${active === k ? 'active' : ''}">${icon(n[1])}<span>${t(k)}</span></a>`;
          })
          .join('') + `<button type="button" id="mnavMore">${icon('more')}<span>${t('more')}</span></button>`;
      document.body.appendChild(m);
      m.querySelector('#mnavMore').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSide(true);
      });
    }
    return g;
  }

  /** Marks the active nav item (used by the settings page when the hash changes). */
  function setActiveNav(key) {
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
    document.documentElement.dataset.sec = key || '';
  }

  function options(list, selected, { placeholder = 'بدون', label = (x) => x.name, prefix = '' } = {}) {
    return [`<option value="">${esc(placeholder)}</option>`]
      .concat(list.map((x) => `<option value="${x.id}" ${String(selected) === x.id ? 'selected' : ''}>${esc(prefix + label(x))}</option>`))
      .join('');
  }

  /** "3 minutes ago" in the current language */
  function ago(ts) {
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    const s = Math.round((ts - Date.now()) / 1000);
    const abs = Math.abs(s);
    if (abs < 60) return rtf.format(s, 'second');
    if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    return rtf.format(Math.round(s / 86400), 'day');
  }

  window.MB = {
    api, toast, icon, esc, topbar, guildSidebar, setActiveNav, guildIdFromPath, options, loadMe, logo, logoSvg, langSwitch, t, num, ago, setLang,
    get lang() { return lang; },
    get me() { return me; },
  };
})();
