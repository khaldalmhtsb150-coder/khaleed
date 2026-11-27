// Ban appeals: whoever gets banned through MarkaBot gets a DM (sent just before the ban) with an
// "appeal" button → a short form → the staff review it in a channel with Accept / Reject.
// Accepting unbans and DMs a one-time invite. One open appeal per person; 7 days wait after a rejection.
const { Events, ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const { canManageGuild } = require('../utils/perms');

const DEFAULT = { enabled: false, channelId: '', cooldownDays: 7 };
const config = (gid) => ({ ...DEFAULT, ...(store.peek('appealsConfig', gid) || {}) });
const recOf = (gid) => store.guild('appeals', gid); // userId → { status, at, reason, answers }
const DAY = 86_400_000;

function dmPayload(guild, reason) {
  const art = require('../utils/art');
  const b = art.banner('appeal');
  const e = ui
    .embed()
    .setColor(art.accentInt('appeal'))
    .setAuthor({ name: guild.name, iconURL: guild.iconURL?.() || undefined })
    .setDescription([`انحظرت من **${guild.name}**`, reason ? `-# السبب: ${reason}` : null, '', 'إذا بتشوف الحظر غلط أو بدك فرصة ثانية، قدّم طلب والإدارة بتراجعه.'].filter((x) => x !== null).join('\n'));
  if (b) e.setImage('attachment://appeal.jpg');
  return {
    embeds: [e],
    files: b ? [b] : [],
    components: [new ActionRowBuilder().addComponents(ui.button(`appeal:open:${guild.id}`, 'طلب فك الحظر', { emoji: 'appeal', style: ButtonStyle.Primary }))],
  };
}

/** Called by the ban command before banning (DMs only reach members who still share a server with the bot). */
async function notify(guild, user, reason) {
  const conf = config(guild.id);
  if (!conf.enabled || !conf.channelId) return false;
  const r = recOf(guild.id);
  r[user.id] = { ...(r[user.id] || {}), status: 'banned', at: Date.now(), reason: reason || '' };
  store.save('appeals');
  return Boolean(await user.send(dmPayload(guild, reason)).catch(() => null));
}

async function onComponent(i) {
  const [, action, gid, uid] = i.customId.split(':');
  const client = i.client;
  const guild = client.guilds.cache.get(gid);
  if (!guild) return i.reply({ content: '• السيرفر ما عاد موجود.', ephemeral: true });
  const conf = config(gid);
  const recs = recOf(gid);

  if (action === 'open') {
    if (!conf.enabled) return i.reply({ content: '• طلبات فك الحظر موقفة بهالسيرفر.', ephemeral: true });
    const r = recs[i.user.id];
    if (r?.status === 'pending') return i.reply({ content: '• طلبك عند الإدارة، استنى ردهم.', ephemeral: true });
    if (r?.status === 'rejected' && Date.now() - r.decidedAt < conf.cooldownDays * DAY) {
      return i.reply({ content: `• انرفض طلبك. بتقدر تقدّم من جديد <t:${Math.ceil((r.decidedAt + conf.cooldownDays * DAY) / 1000)}:R>.`, ephemeral: true });
    }
    const ban = await guild.bans.fetch(i.user.id).catch(() => null);
    if (!ban) return i.reply({ content: '• إنت مش محظور من هالسيرفر', ephemeral: true });
    const q = (id, label, style, max) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(max).setRequired(true));
    return i.showModal(
      new ModalBuilder()
        .setCustomId(`appeal:submit:${gid}`)
        .setTitle('طلب فك الحظر')
        .addComponents(q('why', 'ليش انحظرت برأيك؟', TextInputStyle.Paragraph, 600), q('fix', 'ليش لازم نفك الحظر عنك؟', TextInputStyle.Paragraph, 800), q('promise', 'شو رح تعمل مختلف إذا رجعت؟', TextInputStyle.Short, 200))
    );
  }

  if (action === 'submit') {
    const ch = guild.channels.cache.get(conf.channelId);
    if (!ch) return i.reply({ content: '• الإدارة ما حددت روم للطلبات. حاول بعدين.', ephemeral: true });
    const answers = { why: i.fields.getTextInputValue('why'), fix: i.fields.getTextInputValue('fix'), promise: i.fields.getTextInputValue('promise') };
    recs[i.user.id] = { ...(recs[i.user.id] || {}), status: 'pending', submittedAt: Date.now(), answers };
    store.save('appeals');
    const ban = await guild.bans.fetch(i.user.id).catch(() => null);
    await ch.send({
      embeds: [
        ui
          .embed()
          .setDescription(
            ui.trim(
              [
                `### طلب فك حظر من <@${i.user.id}> \`${i.user.id}\``,
                `**سبب الحظر:** ${ban?.reason || recs[i.user.id].reason || 'غير مذكور'}`,
                '',
                `**ليش انحظر برأيه؟**\n> ${answers.why.replace(/\n/g, '\n> ')}`,
                `**ليش نفك الحظر؟**\n> ${answers.fix.replace(/\n/g, '\n> ')}`,
                `**شو رح يعمل مختلف؟**\n> ${answers.promise}`,
              ].join('\n'),
              4000
            )
          )
          .setThumbnail(i.user.displayAvatarURL?.() || null),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          ui.button(`appeal:accept:${gid}:${i.user.id}`, 'قبول وفك الحظر', { emoji: 'check', style: ButtonStyle.Success }),
          ui.button(`appeal:reject:${gid}:${i.user.id}`, 'رفض', { emoji: 'cancel', style: ButtonStyle.Danger })
        ),
      ],
      allowedMentions: { parse: [] },
    });
    return i.reply({ content: '✅ وصل طلبك للإدارة. رح يوصلك الرد هون بالخاص.', ephemeral: true });
  }

  if (action === 'accept' || action === 'reject') {
    if (!canManageGuild(i.member)) return i.reply({ content: '• بس الإدارة بتقرر.', ephemeral: true });
    const r = recs[uid];
    if (!r || r.status !== 'pending') return i.reply({ content: '• هالطلب انحسم قبل.', ephemeral: true });
    r.status = action === 'accept' ? 'accepted' : 'rejected';
    r.decidedAt = Date.now();
    r.by = i.user.id;
    store.save('appeals');
    const user = await client.users.fetch(uid).catch(() => null);
    let note = '';
    if (action === 'accept') {
      await guild.bans.remove(uid, `فك حظر بطلب، وافق ${i.user.username}`).catch(() => {});
      const inviteCh = guild.systemChannel || guild.channels.cache.find((c) => c.isTextBased?.() && c.permissionsFor?.(guild.members.me)?.has('CreateInstantInvite'));
      const inv = inviteCh ? await inviteCh.createInvite({ maxUses: 1, maxAge: 7 * 86400, unique: true, reason: 'فك حظر' }).catch(() => null) : null;
      await user?.send(`✅ انقبل طلبك وانفك الحظر عنك من **${guild.name}**.${inv ? `\nرابط الرجوع (لمرة وحدة، 7 أيام): ${inv.url}` : ''}`).catch(() => {});
      note = `✅ قبله <@${i.user.id}> وانفك الحظر`;
    } else {
      await user?.send(`❌ انرفض طلب فك الحظر من **${guild.name}**. بتقدر تقدّم من جديد بعد ${config(gid).cooldownDays} أيام.`).catch(() => {});
      note = `❌ رفضه <@${i.user.id}>`;
    }
    return i.update({ components: [], content: note, allowedMentions: { parse: [] } });
  }
  return i.reply({ content: '• غير معروف.', ephemeral: true });
}

function init(client) {
  // bans done by hand or by other bots: try the DM anyway (works when the user still shares a server with us)
  client.on(Events.GuildBanAdd, async (ban) => {
    const conf = config(ban.guild.id);
    const r = recOf(ban.guild.id)[ban.user.id];
    if (!conf.enabled || !conf.channelId || (r && Date.now() - r.at < 60_000)) return;
    await notify(ban.guild, ban.user, ban.reason || '').catch(() => {});
  });
}

module.exports = { init, config, DEFAULT, notify, dmPayload, components: [{ prefix: 'appeal:', handle: onComponent }] };
