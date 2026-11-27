const ui = require('../../utils/ui');
const E = require('../../utils/emojis');
const ai = require('../../utils/ai');
const store = require('../../utils/store');
const assistant = require('../../systems/aiStaff');

module.exports = {
  name: 'ai',
  aliases: ['مساعد', 'المساعد'],
  description: 'المساعد الذكي: تشغيل، تعليم، تجربة، والدروس اللي تعلّمها من الإدارة',
  perms: ['ManageGuild'],
  cooldown: 3,
  options: [
    {
      name: 'action',
      type: 'string',
      description: 'شو بدك؟',
      required: true,
      choices: [
        { name: 'الحالة', value: 'status' },
        { name: 'تشغيل', value: 'on' },
        { name: 'إيقاف', value: 'off' },
        { name: 'علّمه معلومة', value: 'teach' },
        { name: 'المعلومات اللي بيعرفها', value: 'facts' },
        { name: 'انسى معلومة (رقمها)', value: 'forget' },
        { name: 'الدروس الجديدة', value: 'pending' },
        { name: 'جرّبه (سؤال)', value: 'test' },
        { name: 'رجّعه يرد بهالتذكرة', value: 'resume' },
      ],
    },
    { name: 'text', type: 'string', description: 'المعلومة، أو رقمها، أو سؤال التجربة', rest: true },
  ],
  async run(ctx) {
    const gid = ctx.guild.id;
    const action = ctx.get('action');
    const text = (ctx.get('text') || '').trim();
    const conf = store.guild('aiConfig', gid, { ...assistant.DEFAULT });
    const b = assistant.brain(gid);

    if (action === 'status') {
      const c = assistant.config(gid);
      const u = ai.usage(gid);
      const lines = [
        `### ${c.enabled ? '🟢' : '⚪'} ${c.name}`,
        ai.available() ? `-# شغّال على ${ai.providerName()} • ${u.n}/${ai.limitFor(gid)} رد اليوم` : `${E.warning} مفتاح الذكاء الاصطناعي مش مضاف بالبوت — لازم صاحب البوت يحطه بملف .env`,
        '',
        `${E.dot} بيرد: ${[c.tickets ? 'التذاكر' : null, c.channels.length ? `${c.channels.length} روم مساعدة` : null, c.mention ? 'لما حدا يمنشنه' : null].filter(Boolean).join('، ') || 'ولا مكان'}`,
        `${E.dot} اللهجة: ${assistant.DIALECT_AR[c.dialect] || c.dialect}`,
        `${E.dot} بيعرف **${b.facts.length}** معلومة${b.pending.length ? ` • **${b.pending.length}** درس بيستنى موافقتك` : ''}`,
        `${E.dot} رد **${b.stats.replies}** مرة • نفّذ **${b.stats.actions}** إجراء • حوّل للإدارة **${b.stats.handoffs}** مرة`,
        c.instructions?.trim() ? '' : ui.hint('اكتبله تعليماته من الداشبورد (قسم المساعد الذكي) عشان يعرف سيرفرك.'),
      ];
      return ctx.reply({ embeds: [ui.embed().setDescription(lines.filter((x) => x !== null).join('\n'))], allowedMentions: { parse: [] } });
    }
    if (action === 'on' || action === 'off') {
      if (action === 'on' && !ai.available()) return ctx.fail('مفتاح الذكاء الاصطناعي مش مضاف بالبوت لسا.');
      conf.enabled = action === 'on';
      store.save('aiConfig');
      return ctx.reply(conf.enabled ? `${E.success} المساعد شغّال. علّمه عن سيرفرك من الداشبورد أو بـ \`/ai action:علّمه معلومة\`.` : `${E.success} وقّفت المساعد.`);
    }
    if (action === 'teach') {
      if (!text) return ctx.fail('اكتب المعلومة بخانة text، مثلاً: سعر البريميوم 5 دولار بالشهر.');
      try {
        const f = assistant.addFact(gid, text, { source: 'admin', by: ctx.user.id });
        return ctx.reply(f ? `${E.success} حفظتها 🧠` : `${E.dot} بيعرفها من قبل.`);
      } catch (e) {
        return ctx.fail(e.message);
      }
    }
    if (action === 'facts') {
      if (!b.facts.length) return ctx.info(`لسا ما علّمته ولا معلومة.`);
      const lines = b.facts.slice(0, 40).map((f, k) => `\`${k + 1}\` ${ui.trim(f.text, 140)}${f.source !== 'admin' ? ' 🧠' : ''}`);
      return ctx.reply({ embeds: [ui.embed().setDescription(ui.trim([`### اللي بيعرفه ${assistant.config(gid).name}`, ...lines, '', ui.hint('🧠 = تعلّمها من الإدارة. لحذف وحدة: /ai action:انسى معلومة text:رقمها')].join('\n'), 4000))] }, { ephemeral: true });
    }
    if (action === 'forget') {
      const n = Number(text);
      const f = b.facts[n - 1];
      if (!f) return ctx.fail('اكتب رقم المعلومة من القائمة.');
      assistant.removeFact(gid, f.id);
      return ctx.ok(`نسيها: ${ui.trim(f.text, 120)}`);
    }
    if (action === 'pending') return ctx.reply(assistant.pendingPayload(ctx.guild), { ephemeral: true });
    if (action === 'resume') {
      const t = store.peek('tickets', gid)?.[ctx.channel.id];
      if (!t) return ctx.fail('استخدمها جوا التذكرة.');
      t.aiOff = false;
      t.claimedBy = t.claimedBy || null;
      store.save('tickets');
      return ctx.ok(`${assistant.config(gid).name} رجع يرد بهالتذكرة.`);
    }
    if (action === 'test') {
      if (!text) return ctx.fail('اكتب سؤال كأنك عضو.');
      if (!ai.canUse(gid)) return ctx.fail(ai.available() ? 'وصل المساعد حده اليومي.' : 'مفتاح الذكاء الاصطناعي مش مضاف بالبوت لسا.');
      await ctx.defer(true);
      try {
        const system = assistant.systemPrompt(ctx.guild, assistant.config(gid), { member: ctx.member, channel: ctx.channel, about: text });
        const r = await ai.chat({ guildId: gid, system, messages: [{ role: 'user', content: `${ctx.member.displayName}: ${text}` }], maxTokens: 500 });
        return ctx.reply({ embeds: [ui.embed().setDescription(`**سؤالك:** ${ui.trim(text, 300)}\n\n${ui.trim(r.text || '—', 3500)}`).setFooter({ text: 'تجربة — ما انبعت لحدا' })] });
      } catch (e) {
        return ctx.fail(`ما زبط: ${e.message}`);
      }
    }
  },
};
