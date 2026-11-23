/* Owner panel page */
(function () {
  const { api, toast, esc } = MB;
  let isOwner = false;
  let servers = [];
  const $ = (id) => document.getElementById(id);
  const fmtDate = (t) => (t ? new Date(t).toLocaleDateString('ar') : '—');
  const fmtTime = (t) => new Date(t).toLocaleString('ar');

  async function busy(btn, fn) {
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      await fn();
    } catch (e) {
      toast(e.message, 'error', 5000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }

  // ---------- 1 overview ----------
  async function loadOverview() {
    const o = await api('/api/owner/overview');
    $('oServers').textContent = o.servers.toLocaleString('ar');
    $('oUsers').textContent = o.users.toLocaleString('ar');
    $('oToday').textContent = o.usage.today.toLocaleString('ar');
    $('oWeek').textContent = o.usage.week.toLocaleString('ar');
    $('oUptime').textContent = o.uptime;
    $('oRam').textContent = `${o.ramMB}MB`;
    $('oPing').textContent = `${o.ping}ms`;
    $('oPremium').textContent = o.premium;
    $('maintPill').style.display = o.maintenance ? '' : 'none';
    const max = Math.max(1, ...o.usage.daily.map((d) => d.total));
    $('oBars').innerHTML = o.usage.daily.length
      ? o.usage.daily.map((d) => `<div title="${d.day}: ${d.total}" style="height:${Math.max(3, (d.total / max) * 100)}%"><span>${d.day.slice(5)}</span></div>`).join('')
      : '<div class="faint" style="background:none">لا توجد بيانات بعد</div>';
    const topMax = Math.max(1, ...o.usage.top.map((t) => t.count));
    $('oTop').innerHTML = o.usage.top.length
      ? o.usage.top.map((t) => `<div class="row-item"><code>/${esc(t.name)}</code><div class="meter"><i style="width:${(t.count / topMax) * 100}%"></i></div><b>${t.count}</b></div>`).join('')
      : '<div class="faint">لا توجد بيانات بعد</div>';
  }

  // ---------- 2 servers ----------
  function renderServers() {
    const q = $('srvQ').value.trim().toLowerCase();
    const list = servers.filter((s) => !q || s.name.toLowerCase().includes(q) || s.id.includes(q) || String(s.ownerName).toLowerCase().includes(q));
    $('srvCount').textContent = `${servers.length} سيرفر`;
    $('srvTable').innerHTML = list.length
      ? `<table class="table"><thead><tr><th>السيرفر</th><th>الأعضاء</th><th>المالك</th><th>دخل البوت</th><th></th></tr></thead><tbody>${list
          .map(
            (s) => `<tr>
          <td><div class="person">${s.icon ? `<img src="${esc(s.icon)}" alt="">` : ''}<div><b>${esc(s.name)}</b>${s.premium ? ' <span class="pill on">Premium</span>' : ''}<br><small class="faint ltr">${s.id}</small></div></div></td>
          <td>${s.members.toLocaleString('ar')}</td>
          <td>${esc(s.ownerName)}<br><small class="faint">${s.ownerId}</small></td>
          <td>${fmtDate(s.joinedAt)}</td>
          <td style="text-align:left;white-space:nowrap">
            <a class="btn ghost sm" href="/dashboard/${s.id}">لوحته</a>
            <button class="btn ghost sm" data-ban-server="${s.id}">حظر</button>
            ${isOwner ? `<button class="btn danger sm" data-leave="${s.id}">إخراج</button>` : ''}
          </td></tr>`
          )
          .join('')}</tbody></table>`
      : '<div class="empty">لا توجد نتائج.</div>';
  }
  async function loadServers() {
    servers = await api('/api/owner/servers');
    renderServers();
  }

  // ---------- 3 blacklist ----------
  async function loadBlacklist() {
    const list = await api('/api/owner/blacklist');
    $('blList').innerHTML = list.length
      ? `<table class="table"><thead><tr><th>النوع</th><th>الآيدي</th><th>السبب</th><th>التاريخ</th><th></th></tr></thead><tbody>${list
          .map(
            (b) => `<tr><td>${b.type === 'user' ? 'مستخدم' : 'سيرفر'}</td><td>${b.name ? `${esc(b.name)}<br>` : ''}<small class="faint">${b.id}</small></td>
          <td>${esc(b.reason || '—')}</td><td>${fmtDate(b.at)}</td>
          <td style="text-align:left"><button class="btn ghost sm" data-unban="${b.id}" data-type="${b.type}">فك الحظر</button></td></tr>`
          )
          .join('')}</tbody></table>`
      : '<div class="empty" style="padding:18px">القائمة السوداء فارغة.</div>';
  }
  async function blacklist(action, type, id, reason) {
    await api('/api/owner/blacklist', { method: 'POST', body: { action, type, id, reason } });
    toast(action === 'remove' ? 'تم فك الحظر' : 'تمت الإضافة للقائمة السوداء', 'success');
    await loadBlacklist();
    if (type === 'server') await loadServers();
  }

  // ---------- 13 activity logs ----------
  let logTypes = {};
  const mention = (t) => esc(t).replace(/&lt;@!?([^&]+)&gt;/g, '<b>@$1</b>').replace(/&lt;#([^&]+)&gt;/g, '<b>#$1</b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  async function loadLogs() {
    const params = new URLSearchParams({ type: $('lgType').value, q: $('lgQ').value.trim(), limit: '300' });
    const r = await api(`/api/owner/logs?${params}`);
    if (!Object.keys(logTypes).length) {
      logTypes = r.types;
      $('lgType').insertAdjacentHTML('beforeend', Object.entries(r.types).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join(''));
    }
    $('lgCount').textContent = `${r.total.toLocaleString('ar')} حدث محفوظ — يعرض آخر ${r.entries.length}`;
    $('lgList').innerHTML = r.entries.length
      ? `<div class="log-wrap">${r.entries
          .map(
            (e) => `<div class="log-item"><span class="tag t-${e.type}">${esc(logTypes[e.type] || e.type)}</span>
          <div class="body"><div>${mention(e.text)}</div>
          <div class="meta">${fmtTime(e.at)}${e.userName || e.userId ? ` • ${esc(e.userName || '')} <span class="ltr">${e.userId || ''}</span>` : ''}${e.guildName || e.guildId ? ` • ${esc(e.guildName || e.guildId)}` : ''}</div></div></div>`
          )
          .join('')}</div>`
      : '<div class="empty" style="padding:18px">لا توجد سجلات.</div>';
  }
  async function loadViewers() {
    const list = await api('/api/owner/logs/viewers');
    $('lvList').innerHTML = list.length
      ? `<table class="table"><tbody>${list
          .map(
            (v) => `<tr><td><div class="person">${v.avatar ? `<img src="${esc(v.avatar)}" alt="">` : ''}<span>${esc(v.name || 'غير معروف')}</span></div></td>
          <td><small class="faint">${v.id}</small></td><td style="text-align:left"><button class="btn ghost sm" data-rm-viewer="${v.id}">سحب الصلاحية</button></td></tr>`
          )
          .join('')}</tbody></table>`
      : '<div class="faint" style="font-size:13px">لا أحد غيرك يرى السجلات حالياً.</div>';
  }
  async function loadLogSettings() {
    const r = await api('/api/owner/logs/settings');
    $('lgChannel').value = r.logChannelId;
    $('lgTypes').innerHTML = Object.entries(r.types)
      .map(([k, v]) => `<label><span>${esc(v)}</span><span class="switch"><input type="checkbox" data-lgt="${k}" ${r.logTypes.includes(k) ? 'checked' : ''}><span></span></span></label>`)
      .join('');
  }

  // ---------- 8 errors ----------
  async function loadErrors() {
    const list = await api('/api/owner/errors');
    $('errList').innerHTML = list.length
      ? list.map((e) => `<div class="err-item"><small>${fmtTime(e.at)}</small><pre>${esc(e.text)}</pre></div>`).join('')
      : '<div class="empty" style="padding:18px">لا توجد أخطاء.</div>';
  }

  // ---------- 4 admins ----------
  async function loadAdmins() {
    const list = await api('/api/owner/admins');
    $('adList').innerHTML = list.length
      ? `<table class="table"><tbody>${list
          .map(
            (a) => `<tr><td><div class="person">${a.avatar ? `<img src="${esc(a.avatar)}" alt="">` : ''}<span>${esc(a.name || 'غير معروف')}</span></div></td>
          <td><small class="faint">${a.id}</small></td><td style="text-align:left"><button class="btn ghost sm" data-rm-admin="${a.id}">إزالة</button></td></tr>`
          )
          .join('')}</tbody></table>`
      : '<div class="empty" style="padding:18px">لا يوجد مشرفون.</div>';
  }

  // ---------- 5 identity ----------
  async function loadIdentity() {
    const i = await api('/api/owner/identity');
    $('idAvatar').src = i.avatar || '';
    $('idName').textContent = i.username || '';
    $('idUsername').value = i.username || '';
    $('idStatus').value = i.status || '';
    $('idType').value = i.activityType;
    $('idPresence').value = i.presence;
  }

  // ---------- 6+7 control ----------
  let control = null;
  async function loadControl() {
    control = await api('/api/owner/control');
    $('mtEnabled').checked = control.maintenance.enabled;
    $('mtMessage').value = control.maintenance.message || '';
    $('gdList').innerHTML = control.commands
      .filter((c) => c.name !== 'help')
      .map(
        (c) => `<label title="${esc(c.description)}"><code>/${esc(c.name)}</code>
        <span class="switch"><input type="checkbox" data-gd="${c.name}" ${control.globalDisabled.includes(c.name) ? '' : 'checked'}><span></span></span></label>`
      )
      .join('');
  }

  // ---------- 11 announce ----------
  let poll = null;
  async function loadAnnounce() {
    const a = await api('/api/owner/announce');
    $('anOwners').textContent = `سيصل الإعلان إلى ${a.owners} مالك سيرفر (بدون تكرار).`;
    showJob(a.job);
    if (a.job?.running && !poll) poll = setInterval(loadAnnounce, 3000);
    if (!a.job?.running && poll) {
      clearInterval(poll);
      poll = null;
    }
  }
  function showJob(j) {
    if (!j) return;
    $('anJob').style.display = '';
    const done = j.sent + j.failed;
    $('anBar').style.width = `${j.total ? (done / j.total) * 100 : 100}%`;
    $('anText').textContent = j.running
      ? `جاري الإرسال... ${done} / ${j.total} (وصل ${j.sent}، فشل ${j.failed})`
      : `${j.cancelled ? 'تم الإيقاف' : 'اكتمل الإرسال'}: وصل ${j.sent}، فشل ${j.failed} (الخاص مغلق)`;
    $('anCancel').style.display = j.running ? '' : 'none';
    $('anSend').disabled = j.running;
  }
  const announceBody = () => ({
    title: $('anTitle').value,
    description: $('anDesc').value,
    image: $('anImage').value,
    buttonLabel: $('anBtnLabel').value,
    buttonUrl: $('anBtnUrl').value,
  });

  // ---------- 12 premium ----------
  async function loadPremium() {
    const list = await api('/api/owner/premium');
    $('prList').innerHTML = list.length
      ? `<table class="table"><thead><tr><th>السيرفر</th><th>الحالة</th><th>ينتهي</th><th>ملاحظة</th><th></th></tr></thead><tbody>${list
          .map(
            (p) => `<tr><td>${esc(p.name || '—')}<br><small class="faint">${p.id}</small></td>
          <td><span class="pill ${p.active ? 'on' : 'off'}">${p.active ? 'فعال' : 'منتهي'}</span></td>
          <td>${p.until ? fmtDate(p.until) : 'دائم'}</td><td>${esc(p.note || '—')}</td>
          <td style="text-align:left"><button class="btn ghost sm" data-rm-premium="${p.id}">إلغاء</button></td></tr>`
          )
          .join('')}</tbody></table>`
      : '<div class="empty" style="padding:18px">لا توجد سيرفرات بريميوم.</div>';
  }

  // ---------- 12a launch / free switches / shop ----------
  const big = (n) => (n >= 1e9 ? `${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
  const planRow = (p = {}) => `<div class="list-item shop-plan" data-plan>
      <input class="input" data-k="label" placeholder="الاسم (شهر)" maxlength="40" value="${esc(p.label || '')}">
      <input class="input ltr" data-k="days" type="number" min="0" placeholder="أيام" value="${p.days ?? 30}">
      <input class="input ltr" data-k="price" placeholder="السعر 500000000" value="${p.price || ''}" title="${p.price ? big(p.price) : ''}">
      <input class="input ltr" data-k="stock" type="number" min="0" placeholder="الكمية" value="${p.stock || ''}">
      <input type="hidden" data-k="id" value="${esc(p.id || '')}">
      <button type="button" class="icon-btn" data-rm-plan>×</button></div>`;
  const localInput = (t) => {
    if (!t) return '';
    const d = new Date(t);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  let PC = null;
  async function loadPremiumConfig() {
    PC = await api('/api/owner/premium/config');
    const l = PC.launch;
    $('lnOn').checked = l.enabled;
    $('lnEnd').value = localInput(l.endsAt);
    $('lnGift').value = l.giftDays;
    $('lnState').innerHTML = PC.launchActive
      ? `<div class="pill on">شغالة</div> <span class="faint">${l.endsAt ? `تنتهي ${new Date(l.endsAt).toLocaleString('ar')}${l.noticeSent ? ' · تم إرسال الإنذار' : ''}` : 'بدون تاريخ نهاية'} · ${PC.launchGuilds} سيرفر مسجلين للهدية</span>`
      : `<div class="pill off">متوقفة</div>${l.giftGiven ? ' <span class="faint">انتهت وتم توزيع الهدايا</span>' : ''}`;
    $('frList').innerHTML = Object.entries(PC.features)
      .map(([k, label]) => `<label class="check"><input type="checkbox" data-free="${k}" ${PC.free[k] ? 'checked' : ''}> ${esc(label)}${PC.defaultFree[k] ? ' <small class="faint">(مجاني افتراضياً)</small>' : ''}</label>`)
      .join('');
    const sh = PC.shop;
    $('shGuild').innerHTML = `<option value="">— اختار —</option>${PC.guilds.map((g) => `<option value="${g.id}" ${g.id === sh.guildId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}`;
    $('shRecipient').value = sh.recipientId || '';
    $('shTax').value = sh.taxPercent;
    $('shMin').value = sh.minutes;
    $('shDisc').value = sh.launchDiscount || 0;
    $('shLog').value = sh.logChannelId || '';
    $('shProbot').value = sh.probotId;
    $('shOn').checked = sh.enabled;
    $('shPlans').innerHTML = sh.plans.map(planRow).join('');
    const st = PC.shopStats;
    $('shStats').innerHTML = `<div class="stat-grid"><div class="stat-mini"><b>${st.sales}</b><small>مبيعات</small></div><div class="stat-mini"><b>${big(st.credits)}</b><small>كريدت</small></div></div>${
      st.recent.length
        ? `<table class="table mt"><thead><tr><th>المشتري</th><th>المدة</th><th>المبلغ</th><th>الكود</th><th>التاريخ</th></tr></thead><tbody>${st.recent
            .map((o) => `<tr><td class="ltr">${o.userId}</td><td>${o.days ? `${o.days} يوم` : 'دائم'}</td><td>${big(o.amount)}</td><td class="ltr">${esc(o.code)}</td><td>${fmtDate(o.paidAt)}</td></tr>`)
            .join('')}</tbody></table>`
        : ''
    }`;
  }

  async function loadCodes() {
    const list = await api('/api/owner/premium/codes');
    $('pcList').innerHTML = list.length
      ? `<table class="table"><thead><tr><th>الكود</th><th>المدة</th><th>الحالة</th><th>ملاحظة</th><th></th></tr></thead><tbody>${list
          .map(
            (c) => `<tr><td class="ltr" style="text-align:right"><button class="btn ghost sm ltr" data-copy="${esc(c.code)}" title="نسخ">${esc(c.code)}</button></td>
          <td>${c.days ? `${c.days} يوم` : 'دائم'}</td>
          <td>${c.usedAt ? `<span class="pill off">مستخدم</span><br><small class="faint">${esc(c.usedGuildName || c.usedGuild)} · ${fmtDate(c.usedAt)}</small>` : '<span class="pill on">متاح</span>'}</td>
          <td>${esc(c.note || '—')}</td>
          <td style="text-align:left"><button class="btn ghost sm" data-rm-code="${esc(c.code)}">حذف</button></td></tr>`
          )
          .join('')}</tbody></table>`
      : '<div class="empty" style="padding:18px">لا توجد أكواد بعد.</div>';
  }

  // ---------- events ----------
  function bind() {
    $('srvQ').addEventListener('input', renderServers);

    document.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;

      if (t.dataset.leave) {
        if (!confirmAction(t, 'تأكيد الإخراج؟')) return;
        return busy(t, async () => {
          await api(`/api/owner/servers/${t.dataset.leave}/leave`, { method: 'POST', body: {} });
          toast('خرج البوت من السيرفر', 'success');
          await loadServers();
        });
      }
      if (t.dataset.banServer) {
        if (!confirmAction(t, 'تأكيد الحظر؟')) return;
        return busy(t, () => blacklist('add', 'server', t.dataset.banServer, 'من لوحة المالك'));
      }
      if (t.dataset.unban) return busy(t, () => blacklist('remove', t.dataset.type, t.dataset.unban));
      if (t.dataset.rmAdmin)
        return busy(t, async () => {
          await api('/api/owner/admins', { method: 'POST', body: { action: 'remove', id: t.dataset.rmAdmin } });
          toast('تمت إزالة المشرف', 'success');
          await loadAdmins();
        });
      if (t.dataset.rmViewer)
        return busy(t, async () => {
          await api('/api/owner/logs/viewers', { method: 'POST', body: { action: 'remove', id: t.dataset.rmViewer } });
          toast('تم سحب الصلاحية', 'success');
          await loadViewers();
        });
      if (t.dataset.copy) {
        navigator.clipboard?.writeText(t.dataset.copy);
        return toast('تم نسخ الكود', 'success');
      }
      if (t.dataset.rmCode)
        return busy(t, async () => {
          await api('/api/owner/premium/codes', { method: 'POST', body: { action: 'delete', code: t.dataset.rmCode } });
          toast('تم حذف الكود', 'success');
          await loadCodes();
        });
      if (t.dataset.rmPremium)
        return busy(t, async () => {
          await api('/api/owner/premium', { method: 'POST', body: { action: 'remove', id: t.dataset.rmPremium } });
          toast('تم إلغاء البريميوم', 'success');
          await loadPremium();
        });
    });

    $('blAdd').onclick = (e) =>
      busy(e.currentTarget, async () => {
        await blacklist('add', $('blType').value, $('blId').value.trim(), $('blReason').value);
        $('blId').value = '';
        $('blReason').value = '';
      });

    $('errRefresh').onclick = (e) => busy(e.currentTarget, loadErrors);
    $('lgRefresh').onclick = (e) => busy(e.currentTarget, loadLogs);
    $('lvAdd').onclick = (e) =>
      busy(e.currentTarget, async () => {
        await api('/api/owner/logs/viewers', { method: 'POST', body: { action: 'add', id: $('lvId').value.trim() } });
        $('lvId').value = '';
        toast('تم منح صلاحية رؤية السجلات', 'success');
        await loadViewers();
      });
    $('lgType').onchange = () => loadLogs().catch((err) => toast(err.message, 'error'));
    let lgTimer;
    $('lgQ').addEventListener('input', () => {
      clearTimeout(lgTimer);
      lgTimer = setTimeout(() => loadLogs().catch((err) => toast(err.message, 'error')), 350);
    });
    $('errClear').onclick = (e) =>
      busy(e.currentTarget, async () => {
        await api('/api/owner/errors/clear', { method: 'POST', body: {} });
        await loadErrors();
      });

    if (!isOwner) return;

    $('lgSave').onclick = (e) =>
      busy(e.currentTarget, async () => {
        const logTypes = [...document.querySelectorAll('[data-lgt]')].filter((c) => c.checked).map((c) => c.dataset.lgt);
        await api('/api/owner/logs/settings', { method: 'POST', body: { logChannelId: $('lgChannel').value.trim(), logTypes } });
        toast('تم حفظ إعدادات السجلات', 'success');
        loadLogs();
      });

    $('adAdd').onclick = (e) =>
      busy(e.currentTarget, async () => {
        await api('/api/owner/admins', { method: 'POST', body: { action: 'add', id: $('adId').value.trim() } });
        $('adId').value = '';
        toast('تمت إضافة المشرف', 'success');
        await loadAdmins();
      });

    $('idSave').onclick = (e) =>
      busy(e.currentTarget, async () => {
        const r = await api('/api/owner/identity', {
          method: 'POST',
          body: {
            username: $('idUsername').value,
            status: $('idStatus').value,
            avatar: $('idAvatarUrl').value,
            banner: $('idBannerUrl').value,
            activityType: $('idType').value,
            presence: $('idPresence').value,
          },
        });
        $('idAvatarUrl').value = '';
        $('idBannerUrl').value = '';
        toast(r.changed.length ? `تم تحديث: ${r.changed.join('، ')} والحالة` : 'تم تحديث الحالة', 'success');
        await loadIdentity();
      });

    $('ctlSave').onclick = (e) =>
      busy(e.currentTarget, async () => {
        const globalDisabled = [...document.querySelectorAll('[data-gd]')].filter((c) => !c.checked).map((c) => c.dataset.gd);
        await api('/api/owner/control', {
          method: 'POST',
          body: { maintenance: { enabled: $('mtEnabled').checked, message: $('mtMessage').value }, globalDisabled },
        });
        toast('تم الحفظ', 'success');
        loadOverview();
      });

    $('reconnect').onclick = (e) => {
      if (!confirmAction(e.currentTarget, 'تأكيد إعادة الاتصال؟')) return;
      busy(e.currentTarget, async () => {
        await api('/api/owner/reconnect', { method: 'POST', body: {} });
        toast('يتم إعادة اتصال البوت الآن، انتظر بضع ثوانٍ', 'success', 5000);
      });
    };

    $('anTest').onclick = (e) =>
      busy(e.currentTarget, async () => {
        await api('/api/owner/announce', { method: 'POST', body: { ...announceBody(), test: true } });
        toast('تم إرسال التجربة إلى خاصك', 'success');
      });
    $('anSend').onclick = (e) => {
      if (!confirmAction(e.currentTarget, 'متأكد؟ اضغط مرة ثانية')) return;
      busy(e.currentTarget, async () => {
        const r = await api('/api/owner/announce', { method: 'POST', body: announceBody() });
        toast(`بدأ الإرسال إلى ${r.total} مالك`, 'success');
        await loadAnnounce();
      });
    };
    $('anCancel').onclick = (e) =>
      busy(e.currentTarget, async () => {
        await api('/api/owner/announce/cancel', { method: 'POST', body: {} });
        await loadAnnounce();
      });

    $('lnSave').onclick = (e) =>
      busy(e.currentTarget, async () => {
        await api('/api/owner/premium/config', { method: 'POST', body: { action: 'launch', enabled: $('lnOn').checked, endsAt: $('lnEnd').value ? new Date($('lnEnd').value).toISOString() : null, giftDays: $('lnGift').value } });
        toast('تم الحفظ', 'success');
        await loadPremiumConfig();
      });
    $('lnEndNow').onclick = (e) => {
      if (!confirmAction(e.currentTarget, 'رح يبعت إنذار لكل أصحاب السيرفرات! اضغط مرة ثانية')) return;
      busy(e.currentTarget, async () => {
        await api('/api/owner/premium/config', { method: 'POST', body: { action: 'endLaunch' } });
        toast('بدأ العد التنازلي — العرض بينتهي بعد 7 أيام', 'success');
        await loadPremiumConfig();
      });
    };
    $('frSave').onclick = (e) =>
      busy(e.currentTarget, async () => {
        const free = {};
        document.querySelectorAll('[data-free]').forEach((c) => (free[c.dataset.free] = c.checked));
        await api('/api/owner/premium/config', { method: 'POST', body: { action: 'free', free } });
        toast('تم حفظ الميزات', 'success');
        await loadPremiumConfig();
      });
    $('shPlanAdd').onclick = () => $('shPlans').insertAdjacentHTML('beforeend', planRow({ days: 30 }));
    $('shPlans').addEventListener('click', (e) => e.target.closest('[data-rm-plan]')?.closest('[data-plan]').remove());
    $('shSave').onclick = (e) =>
      busy(e.currentTarget, async () => {
        const plans = [...document.querySelectorAll('[data-plan]')].map((row) => Object.fromEntries([...row.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])));
        await api('/api/owner/premium/config', {
          method: 'POST',
          body: { action: 'shop', shop: { enabled: $('shOn').checked, guildId: $('shGuild').value, recipientId: $('shRecipient').value.trim(), taxPercent: $('shTax').value, minutes: $('shMin').value, launchDiscount: $('shDisc').value, logChannelId: $('shLog').value.trim(), probotId: $('shProbot').value.trim(), plans } },
        });
        toast('تم حفظ المتجر', 'success');
        await loadPremiumConfig();
      });

    $('pcGen').onclick = (e) =>
      busy(e.currentTarget, async () => {
        const r = await api('/api/owner/premium/codes', { method: 'POST', body: { count: $('pcCount').value, days: $('pcDays').value, note: $('pcNote').value } });
        navigator.clipboard?.writeText(r.codes.join('\n')).catch(() => {});
        toast(`تم إنشاء ${r.codes.length} كود ونسخها`, 'success');
        $('pcNote').value = '';
        await loadCodes();
      });

    $('prAdd').onclick = (e) =>
      busy(e.currentTarget, async () => {
        await api('/api/owner/premium', { method: 'POST', body: { action: 'add', id: $('prId').value.trim(), days: $('prDays').value, note: $('prNote').value } });
        $('prId').value = '';
        $('prDays').value = '';
        $('prNote').value = '';
        toast('تم تفعيل البريميوم', 'success');
        await loadPremium();
        loadServers();
      });

    $('bkRestore').onclick = (e) => {
      if (!confirmAction(e.currentTarget, 'سيستبدل كل البيانات! اضغط مرة ثانية')) return;
      $('bkFile').click();
    };
    $('bkFile').onchange = async () => {
      const file = $('bkFile').files[0];
      if (!file) return;
      try {
        const res = await fetch('/api/owner/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': MB.me.csrf },
          body: await file.text(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل الاسترجاع');
        toast(`تم استرجاع ${data.restored.length} ملف`, 'success', 5000);
        loadOverview();
        loadServers();
      } catch (err) {
        toast(err.message, 'error', 5000);
      } finally {
        $('bkFile').value = '';
      }
    };
  }

  // two-click confirmation instead of alert()
  function confirmAction(btn, text) {
    if (btn.dataset.armed) {
      delete btn.dataset.armed;
      btn.innerHTML = btn.dataset.label;
      return true;
    }
    btn.dataset.armed = '1';
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = text;
    setTimeout(() => {
      if (btn.dataset.armed) {
        delete btn.dataset.armed;
        btn.innerHTML = btn.dataset.label;
      }
    }, 3500);
    return false;
  }

  // ---------- boot ----------
  (async () => {
    await MB.topbar({ guild: true });
    const me = await api('/api/owner/me');
    isOwner = me.owner;
    document.body.classList.toggle('is-owner', isOwner);
    document.body.classList.toggle('can-logs', Boolean(me.canSeeLogs));
    document.body.classList.toggle('is-main', Boolean(me.mainOwner));
    $('roleLabel').textContent = isOwner ? 'مالك البوت' : 'مشرف البوت';
    document.querySelectorAll('.sidebar a[href^="#"]').forEach((a) => a.addEventListener('click', () => document.querySelector('.sidebar').classList.remove('open')));
    bind();
 const tasks = [loadOverview(), loadServers(), loadBlacklist(), loadErrors()];
    if (me.canSeeLogs) tasks.push(loadLogs());
    if (me.mainOwner) tasks.push(loadLogSettings(), loadViewers());
    if (isOwner) tasks.push(loadAdmins(), loadIdentity(), loadControl(), loadAnnounce(), loadPremium(), loadPremiumConfig(), loadCodes());
    await Promise.all(tasks.map((p) => p.catch((e) => toast(e.message, 'error'))));
  })().catch((e) => toast(e.message, 'error', 6000));
})();
