// Bot owner panel — API + page. Owners (OWNER_IDS) get everything; bot admins get a limited view.
const path = require('path');
const express = require('express');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const { isOwner, isBotAdmin, isMainOwner } = require('../utils/perms');
const errors = require('../utils/errors');
const stats = require('../utils/stats');
const premium = require('../utils/premium');
const registry = require('../utils/commands');
const { applyPresence } = require('../utils/presence');
const botlog = require('../utils/botlog');
const who = (req) => ({ id: req.session.user.id, name: req.session.user.globalName || req.session.user.username });

const VIEWS = path.join(__dirname, 'views');
const ID = /^\d{17,21}$/;
const str = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const url = (v) => (typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim() : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// announcement job (one at a time)
let job = null;

module.exports = function registerOwnerPanel(app, { client, needLogin, csrf }) {
  const staff = (req, res, next) => (isBotAdmin(req.session.user.id) ? next() : res.status(403).json({ error: 'لفريق البوت فقط' }));
  const owner = (req, res, next) => (isOwner(req.session.user.id) ? next() : res.status(403).json({ error: 'لمالك البوت فقط' }));
  const mainOwner = (req, res, next) => (isMainOwner(req.session.user.id) ? next() : res.status(403).json({ error: 'للمالك الرئيسي فقط' }));
  const canSeeLogs = (id) => isMainOwner(id) || (store.get('botSettings').logViewers || []).includes(id);
  const logsAccess = (req, res, next) => (canSeeLogs(req.session.user.id) ? next() : res.status(403).json({ error: 'ليس لديك صلاحية رؤية السجلات' }));

  // page
  app.get('/owner', needLogin, (req, res) => {
    if (!isBotAdmin(req.session.user.id)) return res.redirect('/unauthorized');
    res.sendFile(path.join(VIEWS, 'owner.html'));
  });

  app.get('/api/owner/me', staff, (req, res) => {
    res.json({ owner: isOwner(req.session.user.id), admin: true, mainOwner: isMainOwner(req.session.user.id), canSeeLogs: canSeeLogs(req.session.user.id) });
  });

  // 1) overview
  app.get('/api/owner/overview', staff, (req, res) => {
    const mem = process.memoryUsage();
    const up = process.uptime();
    res.json({
      servers: client.guilds.cache.size,
      users: client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
      ping: Math.round(client.ws.ping),
      uptime: `${Math.floor(up / 86400)}ي ${Math.floor((up % 86400) / 3600)}س ${Math.floor((up % 3600) / 60)}د`,
      ramMB: Math.round(mem.rss / 1048576),
      node: process.version,
      commands: registry.commands.size,
      usage: stats.summary(),
      maintenance: Boolean(store.get('botSettings').maintenance?.enabled),
      premium: Object.keys(store.get('premium')).filter((id) => premium.isPremium(id)).length,
      errors: errors.list().length,
    });
  });

  // 2) servers
  app.get('/api/owner/servers', staff, async (req, res) => {
    const guilds = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
    await Promise.all(guilds.map((g) => (client.users.cache.has(g.ownerId) ? null : client.users.fetch(g.ownerId).catch(() => null))));
    res.json(
      guilds.map((g) => {
        const o = client.users.cache.get(g.ownerId);
        return {
          id: g.id,
          name: g.name,
          icon: g.iconURL({ size: 64 }),
          members: g.memberCount,
          ownerId: g.ownerId,
          ownerName: o ? o.username : g.ownerId,
          joinedAt: g.joinedTimestamp,
          premium: premium.isPremium(g.id),
        };
      })
    );
  });

  app.post('/api/owner/servers/:id/leave', owner, csrf, async (req, res) => {
    const g = client.guilds.cache.get(req.params.id);
    if (!g) return res.status(404).json({ error: 'السيرفر غير موجود' });
    await g.leave().catch(() => {});
    botlog.log('owner', `أخرج البوت من سيرفر **${g.name}** (${g.memberCount} عضو)`, { user: who(req), guild: g });
    res.json({ ok: true });
  });

  // 3) blacklist
  app.get('/api/owner/blacklist', staff, (req, res) => {
    const bl = store.get('blacklist');
    const reasons = bl.reasons || {};
    const map = (list, type) =>
      list.map((id) => ({
        id,
        type,
        name: type === 'user' ? client.users.cache.get(id)?.username || null : client.guilds.cache.get(id)?.name || null,
        ...(reasons[id] || {}),
      }));
    res.json([...map(bl.users, 'user'), ...map(bl.servers, 'server')]);
  });

  app.post('/api/owner/blacklist', staff, csrf, async (req, res) => {
    const { action, type } = req.body;
    const id = str(req.body.id, 30);
    if (!ID.test(id)) return res.status(400).json({ error: 'آيدي غير صالح' });
    if (!['user', 'server'].includes(type)) return res.status(400).json({ error: 'نوع غير صالح' });
    if (type === 'user' && isOwner(id)) return res.status(400).json({ error: 'لا يمكن حظر مالك البوت' });
    const bl = store.get('blacklist');
    bl.reasons = bl.reasons || {};
    const list = type === 'user' ? bl.users : bl.servers;
    if (action === 'remove') {
      const i = list.indexOf(id);
      if (i !== -1) list.splice(i, 1);
      delete bl.reasons[id];
    } else {
      if (!list.includes(id)) list.push(id);
      bl.reasons[id] = { reason: str(req.body.reason, 300) || 'بدون سبب', by: req.session.user.id, at: Date.now() };
      if (type === 'server') client.guilds.cache.get(id)?.leave().catch(() => {});
      if (type === 'user') await client.users.fetch(id).catch(() => null);
    }
    store.save('blacklist');
    const target = type === 'user' ? `<@${id}>` : `السيرفر ${client.guilds.cache.get(id)?.name || ''} \`${id}\``;
    botlog.log('owner', action === 'remove' ? `فك الحظر عن ${target}` : `حظر ${target} من البوت — ${bl.reasons[id]?.reason || ''}`, { user: who(req) });
    res.json({ ok: true });
  });

  // 4) bot admins
  app.get('/api/owner/admins', owner, async (req, res) => {
    const ids = store.get('admins');
    await Promise.all(ids.map((id) => client.users.fetch(id).catch(() => null)));
    res.json(ids.map((id) => ({ id, name: client.users.cache.get(id)?.username || null, avatar: client.users.cache.get(id)?.displayAvatarURL({ size: 64 }) || null })));
  });

  app.post('/api/owner/admins', owner, csrf, async (req, res) => {
    const id = str(req.body.id, 30);
    if (!ID.test(id)) return res.status(400).json({ error: 'آيدي غير صالح' });
    const admins = store.get('admins');
    if (req.body.action === 'remove') {
      const i = admins.indexOf(id);
      if (i !== -1) admins.splice(i, 1);
    } else {
      const user = await client.users.fetch(id).catch(() => null);
      if (!user) return res.status(400).json({ error: 'لم يتم العثور على المستخدم' });
      if (!admins.includes(id)) admins.push(id);
    }
    store.save('admins');
    botlog.log('owner', `${req.body.action === 'remove' ? 'أزال' : 'أضاف'} <@${id}> ${req.body.action === 'remove' ? 'من' : 'إلى'} مشرفي البوت`, { user: who(req) });
    res.json({ ok: true });
  });

  // 5) identity
  app.get('/api/owner/identity', owner, (req, res) => {
    const s = store.get('botSettings');
    res.json({
      username: client.user?.username,
      avatar: client.user?.displayAvatarURL({ size: 256 }),
      banner: client.user?.bannerURL?.({ size: 1024 }) || null,
      status: s.status || '/help',
      activityType: s.activityType || 'Watching',
      presence: s.presence || 'online',
    });
  });

  app.post('/api/owner/identity', owner, csrf, async (req, res) => {
    const out = [];
    try {
      const name = str(req.body.username, 32);
      if (name && name !== client.user.username) {
        await client.user.setUsername(name);
        out.push('الاسم');
      }
      const avatar = url(req.body.avatar);
      if (avatar) {
        await client.user.setAvatar(avatar);
        out.push('الصورة');
      }
      const banner = url(req.body.banner);
      if (banner) {
        if (typeof client.user.setBanner !== 'function') throw new Error('نسخة discord.js لا تدعم تغيير البانر، حدّثها');
        await client.user.setBanner(banner);
        out.push('البانر');
      }
    } catch (err) {
      return res.status(400).json({ error: `تعذر التحديث: ${err.message}` });
    }
    const s = store.get('botSettings');
    if (str(req.body.status, 120)) s.status = str(req.body.status, 120);
    if (['Playing', 'Watching', 'Listening', 'Competing', 'Custom'].includes(req.body.activityType)) s.activityType = req.body.activityType;
    if (['online', 'idle', 'dnd'].includes(req.body.presence)) s.presence = req.body.presence;
    store.save('botSettings');
    applyPresence(client);
    botlog.log('owner', `حدّث هوية البوت: ${[...out, 'الحالة'].join('، ')}`, { user: who(req) });
    res.json({ ok: true, changed: out });
  });

  // 6 + 7) maintenance & global command switch
  app.get('/api/owner/control', owner, (req, res) => {
    const s = store.get('botSettings');
    res.json({
      maintenance: s.maintenance || { enabled: false, message: '' },
      globalDisabled: s.globalDisabled || [],
      commands: [...registry.commands.values()].filter((c) => c.category !== 'owner').map((c) => ({ name: c.name, description: c.description })),
    });
  });

  app.post('/api/owner/control', owner, csrf, (req, res) => {
    const s = store.get('botSettings');
    if (req.body.maintenance) {
      s.maintenance = { enabled: Boolean(req.body.maintenance.enabled), message: str(req.body.maintenance.message, 300) };
    }
    if (Array.isArray(req.body.globalDisabled)) {
      s.globalDisabled = req.body.globalDisabled.filter((n) => registry.commands.has(n) && !['help'].includes(n));
    }
    store.save('botSettings');
    botlog.log(
      'owner',
      `وضع الصيانة: ${s.maintenance?.enabled ? 'مفعل' : 'متوقف'} — أوامر متوقفة عالمياً: ${(s.globalDisabled || []).map((n) => `/${n}`).join(' ') || 'لا يوجد'}`,
      { user: who(req) }
    );
    res.json({ ok: true });
  });

  // 8) errors
  app.get('/api/owner/errors', staff, (req, res) => res.json(errors.list().slice(0, 100)));
  app.post('/api/owner/errors/clear', owner, csrf, (req, res) => {
    errors.clear();
    res.json({ ok: true });
  });

  // 9) backup & restore
  app.get('/api/owner/backup', mainOwner, (req, res) => {
    botlog.log('owner', 'حمّل نسخة احتياطية من البيانات', { user: who(req) });
    store.flush();
    const data = {};
    for (const name of Object.keys(store.DEFAULTS).concat(['commandAliases', 'wheelConfig', 'wheelTickets', 'premium', 'premiumCodes', 'commandStats'])) {
      data[name] = store.get(name);
    }
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    res.setHeader('Content-Disposition', `attachment; filename="markabot-backup-${stamp}.json"`);
    res.json({ markabot: 2, createdAt: Date.now(), data });
  });

  app.post('/api/owner/restore', mainOwner, csrf, express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
    let parsed;
    try {
      parsed = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'الملف ليس JSON صالحاً' });
    }
    if (!parsed || parsed.markabot !== 2 || typeof parsed.data !== 'object') return res.status(400).json({ error: 'هذا ليس ملف نسخة احتياطية من MarkaBot' });
    const restored = [];
    for (const [name, value] of Object.entries(parsed.data)) {
      if (!/^[a-zA-Z]+$/.test(name) || value === null || typeof value !== 'object') continue;
      store.set(name, value);
      restored.push(name);
    }
    store.flush();
    botlog.log('owner', `استرجع نسخة احتياطية (${restored.length} ملف)`, { user: who(req) });
    res.json({ ok: true, restored });
  });

  // 10) reconnect (soft restart: reconnects to Discord without stopping the process)
  app.post('/api/owner/reconnect', owner, csrf, async (req, res) => {
    botlog.log('owner', 'أعاد اتصال البوت', { user: who(req) });
    store.flush();
    res.json({ ok: true });
    try {
      await client.destroy();
      await client.login(process.env.DISCORD_TOKEN);
      console.log('[owner] bot reconnected from the dashboard');
    } catch (err) {
      console.error('[owner] reconnect failed:', err.message);
    }
  });

  // 11) announcement → DM every server owner
  app.get('/api/owner/announce', owner, (req, res) => {
    const owners = new Set(client.guilds.cache.map((g) => g.ownerId));
    res.json({ owners: owners.size, job: job && { ...job, cancel: undefined } });
  });

  function buildMessage(body) {
    const embed = ui.embed().setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });
    const title = str(body.title, 200);
    const description = str(body.description, 3500);
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    const image = url(body.image);
    if (image) embed.setImage(image);
    const payload = { embeds: [embed] };
    const link = url(body.buttonUrl);
    if (link && str(body.buttonLabel, 80)) {
      payload.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel(str(body.buttonLabel, 80)))];
    }
    return payload;
  }

  app.post('/api/owner/announce', owner, csrf, async (req, res) => {
    if (!str(req.body.title) && !str(req.body.description)) return res.status(400).json({ error: 'اكتب عنواناً أو نصاً للإعلان' });
    const payload = buildMessage(req.body);

    if (req.body.test) {
      const me = await client.users.fetch(req.session.user.id).catch(() => null);
      const ok = await me?.send(payload).then(() => true).catch(() => false);
      return ok ? res.json({ ok: true, test: true }) : res.status(400).json({ error: 'تعذر الإرسال لك، افتح الخاص' });
    }

    if (job?.running) return res.status(409).json({ error: 'يوجد إعلان قيد الإرسال' });
    const blocked = new Set(store.get('blacklist').users);
    const owners = [...new Set(client.guilds.cache.map((g) => g.ownerId))].filter((id) => !blocked.has(id));
    job = { running: true, total: owners.length, sent: 0, failed: 0, startedAt: Date.now(), cancelled: false };
    botlog.log('owner', `بدأ إرسال إعلان «${str(req.body.title, 100) || 'بدون عنوان'}» إلى ${owners.length} مالك سيرفر`, { user: who(req) });
    res.json({ ok: true, total: owners.length });

    for (const id of owners) {
      if (job.cancelled) break;
      const user = await client.users.fetch(id).catch(() => null);
      const ok = await user?.send(payload).then(() => true).catch(() => false);
      if (ok) job.sent++;
      else job.failed++;
      await sleep(2500); // slow and steady — avoids Discord spam limits
    }
    job.running = false;
    job.finishedAt = Date.now();
    console.log(`[owner] announcement finished: ${job.sent} sent, ${job.failed} failed`);
    botlog.log('owner', `انتهى إرسال الإعلان: وصل ${job.sent}، فشل ${job.failed}${job.cancelled ? ' (تم الإيقاف)' : ''}`, { user: who(req) });
  });

  app.post('/api/owner/announce/cancel', owner, csrf, (req, res) => {
    if (job?.running) job.cancelled = true;
    res.json({ ok: true });
  });

  // 12) premium
  app.get('/api/owner/premium', owner, (req, res) => {
    const all = store.get('premium');
    res.json(
      Object.entries(all).map(([id, p]) => ({
        id,
        name: client.guilds.cache.get(id)?.name || null,
        ...p,
        active: premium.isPremium(id),
      }))
    );
  });

  app.post('/api/owner/premium', owner, csrf, async (req, res) => {
    const id = str(req.body.id, 30);
    if (!ID.test(id)) return res.status(400).json({ error: 'آيدي غير صالح' });
    let p = null;
    if (req.body.action === 'remove') {
      premium.deactivate(id);
      const g = client.guilds.cache.get(id);
      if (g && !premium.has(id, 'botProfile')) await require('../systems/botProfile').reset(g); // saved look comes back on renewal
    } else {
      const days = parseInt(req.body.days, 10);
      p = premium.activate(id, Number.isFinite(days) && days > 0 ? days : 0, { note: str(req.body.note, 200), by: req.session.user.id });
    }
    const gname = client.guilds.cache.get(id)?.name || id;
    botlog.log('owner', req.body.action === 'remove' ? `ألغى البريميوم عن ${gname}` : `فعّل البريميوم لـ ${gname} ${p.until ? `حتى ${new Date(p.until).toLocaleDateString('ar')}` : 'بشكل دائم'}`, { user: who(req) });
    res.json({ ok: true });
  });

  // 12a) launch period, free/premium switches and the shop
  app.get('/api/owner/premium/config', owner, (req, res) => {
    const shop = require('../systems/shop');
    const cfg = premium.config();
    res.json({
      launch: premium.launch(),
      launchActive: premium.launchActive(),
      launchGuilds: Object.keys(store.get('launchGuilds')).length,
      features: premium.FEATURES,
      free: Object.fromEntries(Object.keys(premium.FEATURES).map((f) => [f, premium.isFree(f)])),
      defaultFree: premium.DEFAULT_FREE,
      shop: shop.config(),
      shopStats: shop.stats(),
      guilds: [...client.guilds.cache.values()].map((g) => ({ id: g.id, name: g.name })).sort((a, b) => a.name.localeCompare(b.name)),
      hasCustomFree: Boolean(cfg.free && Object.keys(cfg.free).length),
    });
  });

  app.post('/api/owner/premium/config', owner, csrf, async (req, res) => {
    const cfg = premium.config();
    const d = req.body || {};
    const shop = require('../systems/shop');
    try {
      if (d.action === 'launch') {
        const endsAt = d.endsAt ? new Date(d.endsAt).getTime() : null;
        if (d.enabled && endsAt && endsAt < Date.now() + 3_600_000) throw new Error('تاريخ النهاية لازم يكون بالمستقبل');
        const prev = premium.launch();
        cfg.launch = { ...prev, enabled: Boolean(d.enabled), endsAt, giftDays: Math.min(365, Math.max(0, parseInt(d.giftDays, 10) || 30)), noticeSent: prev.endsAt === endsAt ? prev.noticeSent : false, giftGiven: false };
        store.save('premiumConfig');
        if (cfg.launch.enabled) require('../systems/premiumWatch').trackLaunch(client);
        botlog.log('owner', cfg.launch.enabled ? `شغّل فترة الإطلاق${endsAt ? ` لحد ${new Date(endsAt).toLocaleDateString('ar')}` : ''}` : 'أوقف فترة الإطلاق', { user: who(req) });
      } else if (d.action === 'endLaunch') {
        // start the 7-day countdown now
        const l = premium.launch();
        if (!l.enabled) throw new Error('فترة الإطلاق مش شغالة');
        cfg.launch = { ...l, endsAt: Date.now() + 7 * 86_400_000, noticeSent: false };
        store.save('premiumConfig');
        botlog.log('owner', 'بدأ إنهاء فترة الإطلاق (7 أيام)', { user: who(req) });
        require('../systems/premiumWatch').launchTick(client).catch(() => {});
      } else if (d.action === 'free') {
        const free = {};
        for (const f of Object.keys(premium.FEATURES)) if (f in (d.free || {})) free[f] = Boolean(d.free[f]);
        cfg.free = free;
        store.save('premiumConfig');
        botlog.log('owner', `عدّل الميزات المجانية: ${Object.keys(free).filter((f) => free[f]).join('، ') || 'لا شيء'}`, { user: who(req) });
      } else if (d.action === 'shop') {
        const s = d.shop || {};
        const plans = (Array.isArray(s.plans) ? s.plans : [])
          .map((p, i) => ({ id: str(p.id, 20) || `p${i}`, label: str(p.label, 40).trim(), days: Math.max(0, parseInt(p.days, 10) || 0), price: Math.max(1, parseInt(String(p.price).replace(/[^\d]/g, ''), 10) || 0), ...(parseInt(p.stock, 10) > 0 ? { stock: parseInt(p.stock, 10) } : {}) }))
          .filter((p) => p.label && p.price)
          .slice(0, 10);
        if (s.enabled && !client.guilds.cache.has(s.guildId)) throw new Error('اختار سيرفر المتجر');
        if (s.recipientId && !ID.test(s.recipientId)) throw new Error('آيدي المستلم غير صالح');
        cfg.shop = {
          enabled: Boolean(s.enabled),
          guildId: str(s.guildId, 30),
          recipientId: str(s.recipientId, 30),
          logChannelId: str(s.logChannelId, 30),
          taxPercent: Math.min(50, Math.max(0, Number(s.taxPercent) || 0)),
          minutes: Math.min(30, Math.max(1, parseInt(s.minutes, 10) || 5)),
          launchDiscount: Math.min(90, Math.max(0, parseInt(s.launchDiscount, 10) || 0)),
          probotId: ID.test(s.probotId) ? s.probotId : shop.PROBOT_ID,
          plans: plans.length ? plans : shop.DEFAULT_PLANS,
        };
        store.save('premiumConfig');
        botlog.log('owner', `عدّل إعدادات متجر البريميوم (${cfg.shop.enabled ? 'شغال' : 'متوقف'})`, { user: who(req) });
      } else throw new Error('إجراء غير معروف');
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // 12b) premium activation codes
  app.get('/api/owner/premium/codes', owner, (req, res) => {
    const all = premium.codes();
    res.json(
      Object.entries(all)
        .map(([code, c]) => ({ code, ...c, usedGuildName: c.usedGuild ? client.guilds.cache.get(c.usedGuild)?.name || null : null }))
        .sort((a, b) => b.createdAt - a.createdAt)
    );
  });

  app.post('/api/owner/premium/codes', owner, csrf, (req, res) => {
    if (req.body.action === 'delete') {
      premium.deleteCode(str(req.body.code, 40).toUpperCase());
      return res.json({ ok: true });
    }
    const count = Math.min(50, Math.max(1, parseInt(req.body.count, 10) || 1));
    const days = Math.max(0, parseInt(req.body.days, 10) || 0);
    const list = premium.generateCodes(count, days, { by: req.session.user.id, note: str(req.body.note, 200) });
    botlog.log('owner', `أنشأ ${count} كود بريميوم (${days ? `${days} يوم` : 'دائم'})`, { user: who(req) });
    res.json({ ok: true, codes: list });
  });

  // 13) activity logs
  app.get('/api/owner/logs', staff, logsAccess, (req, res) => {
    const type = str(req.query.type, 30);
    const q = str(req.query.q, 100).toLowerCase();
    const limit = Math.min(500, parseInt(req.query.limit, 10) || 200);
    const out = [];
    for (const e of botlog.list()) {
      if (type && e.type !== type) continue;
      if (q && !`${e.text} ${e.userName || ''} ${e.userId || ''} ${e.guildName || ''} ${e.guildId || ''}`.toLowerCase().includes(q)) continue;
      out.push({
        ...e,
        text: e.text
          .replace(/<#(\d+)>/g, (m, id) => `<#${client.channels.cache.get(id)?.name || id}>`)
          .replace(/<@!?(\d+)>/g, (m, id) => `<@${client.users.cache.get(id)?.username || id}>`),
      });
      if (out.length >= limit) break;
    }
    res.json({ types: botlog.TYPES, entries: out, total: botlog.list().length });
  });

  app.get('/api/owner/logs/settings', mainOwner, (req, res) => {
    const s = store.get('botSettings');
    res.json({ logChannelId: s.logChannelId || '', logTypes: s.logTypes || botlog.DEFAULT_CHANNEL_TYPES, types: botlog.TYPES });
  });

  app.post('/api/owner/logs/settings', mainOwner, csrf, async (req, res) => {
    const s = store.get('botSettings');
    const id = str(req.body.logChannelId, 30);
    if (id) {
      const ch = await client.channels.fetch(id).catch(() => null);
      if (!ch?.isTextBased()) return res.status(400).json({ error: 'لم يتم العثور على القناة أو البوت لا يراها' });
      s.logChannelId = id;
    } else s.logChannelId = '';
    if (Array.isArray(req.body.logTypes)) s.logTypes = req.body.logTypes.filter((t) => botlog.TYPES[t]);
    store.save('botSettings');
    botlog.log('owner', s.logChannelId ? `ربط سجلات البوت بالقناة <#${s.logChannelId}>` : 'أوقف إرسال السجلات لديسكورد', { user: who(req) });
    res.json({ ok: true });
  });

  // who can see the activity logs (chosen by the main owner)
  app.get('/api/owner/logs/viewers', mainOwner, async (req, res) => {
    const ids = store.get('botSettings').logViewers || [];
    await Promise.all(ids.map((id) => client.users.fetch(id).catch(() => null)));
    res.json(ids.map((id) => ({ id, name: client.users.cache.get(id)?.username || null, avatar: client.users.cache.get(id)?.displayAvatarURL({ size: 64 }) || null })));
  });

  app.post('/api/owner/logs/viewers', mainOwner, csrf, async (req, res) => {
    const id = str(req.body.id, 30);
    if (!ID.test(id)) return res.status(400).json({ error: 'آيدي غير صالح' });
    const s = store.get('botSettings');
    s.logViewers = s.logViewers || [];
    if (req.body.action === 'remove') s.logViewers = s.logViewers.filter((x) => x !== id);
    else {
      if (!isBotAdmin(id)) return res.status(400).json({ error: 'يجب أن يكون الشخص مالكاً أو مشرفاً للبوت أولاً' });
      if (!s.logViewers.includes(id)) s.logViewers.push(id);
    }
    store.save('botSettings');
    botlog.log('owner', `${req.body.action === 'remove' ? 'سحب' : 'منح'} صلاحية رؤية السجلات ${req.body.action === 'remove' ? 'من' : 'لـ'} <@${id}>`, { user: who(req) });
    res.json({ ok: true });
  });
};
