// Drop / Box: a giveaway where the FIRST member to press the button wins.
const { Events, ActionRowBuilder, ButtonStyle } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const logs = require('./logs');

const EXPIRE_MS = 24 * 3_600_000; // unclaimed drops close after a day
const claiming = new Set(); // in-memory lock: one winner even if many click at the same instant

const all = () => store.get('drops');
const save = () => store.save('drops');

const cards = require('../utils/cards');
const { AttachmentBuilder } = require('discord.js');
const ACCENT = { open: 0xff5fa8, waiting: 0xff5fa8, won: 0xffcb47, expired: 0x8b8fb8 };
const stateOf = (d) => (d.winnerId ? 'won' : d.expired ? 'expired' : Date.now() < d.openAt ? 'waiting' : 'open');

/** Embed + button for the box. With `withCard`, also draws the card for the current state. */
async function render(d, { withCard = true, winner = null } = {}) {
  const state = stateOf(d);
  const line = {
    waiting: `${E.timer} بينفتح <t:${Math.ceil(d.openAt / 1000)}:R> — جهّز إيدك!`,
    open: `${E.gift} **${d.prize}** — أول واحد بيكبس الزر بيفوز`,
    won: `${E.crown} <@${d.winnerId}> فاز بـ **${d.prize}**`,
    expired: '• خلص الوقت وما حدا كبس.',
  }[state];
  const embed = ui.embed().setColor(ACCENT[state]).setDescription(line);
  const card = withCard
    ? await cards
        .boxCard({ state, prize: d.prize, host: d.hostName, winner: winner || (d.winnerName ? { name: d.winnerName, avatar: d.winnerAvatar } : null), ms: d.claimedAt ? d.claimedAt - d.openAt : null })
        .catch(() => null)
    : null;
  if (card || !withCard) embed.setImage('attachment://box.png'); // without a new card, keep pointing at the current one
  const label = { waiting: 'استنى…', open: 'اكبس بسرعة!', won: 'انفتح البوكس', expired: 'انتهى' }[state];
  const row = new ActionRowBuilder().addComponents(
    ui.button('drop_claim', label, { emoji: 'gift', style: state === 'open' ? ButtonStyle.Success : ButtonStyle.Secondary, disabled: state !== 'open' })
  );
  return { embeds: [embed], components: [row], ...(card ? { files: [new AttachmentBuilder(card, { name: 'box.png' })], attachments: [] } : {}) };
}

async function start(channel, { prize, hostId, hostName, waitMs = 0 }) {
  const d = { guildId: channel.guild.id, channelId: channel.id, prize, hostId, hostName, createdAt: Date.now(), openAt: Date.now() + waitMs, winnerId: null };
  const { attachments, ...first } = await render(d);
  const msg = await channel.send({ ...first, allowedMentions: { parse: [] } });
  d.messageId = msg.id;
  all()[msg.id] = d;
  save();
  if (waitMs > 0) setTimeout(() => open(channel.client, msg.id), waitMs);
  return msg;
}

async function refresh(client, d) {
  const ch = client.channels.cache.get(d.channelId);
  const msg = ch ? await ch.messages.fetch(d.messageId).catch(() => null) : null;
  if (msg) await msg.edit({ ...(await render(d)), allowedMentions: { parse: [] } }).catch(() => {});
  return { ch, msg };
}

async function open(client, id) {
  const d = all()[id];
  if (d && !d.winnerId && !d.expired) await refresh(client, d);
}

async function onClaim(interaction) {
  const id = interaction.message.id;
  const d = all()[id];
  if (!d) return interaction.reply({ content: '• هالبوكس مش موجود.', ephemeral: true });
  if (d.winnerId) return interaction.reply({ content: `• سبقك <@${d.winnerId}>!`, ephemeral: true, allowedMentions: { parse: [] } });
  if (d.expired) return interaction.reply({ content: '• هالبوكس انتهى.', ephemeral: true });
  if (Date.now() < d.openAt) return interaction.reply({ content: '• لسا ما انفتح، استنى شوي.', ephemeral: true });
  if (interaction.user.bot) return interaction.deferUpdate().catch(() => {});
  if (interaction.user.id === d.hostId) return interaction.reply({ content: '• ما بتقدر تفوز بالبوكس اللي نزلته.', ephemeral: true });
  if (claiming.has(id)) return interaction.reply({ content: '• سبقك حدا بأجزاء من الثانية!', ephemeral: true });

  claiming.add(id);
  try {
    d.winnerId = interaction.user.id;
    d.claimedAt = Date.now();
    d.winnerName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
    d.winnerAvatar = interaction.user.displayAvatarURL?.({ extension: 'png', size: 256 }) || null;
    save();
    // lock the button first (fast), then swap in the winner card
    await interaction.update({ ...(await render(d, { withCard: false })), allowedMentions: { parse: [] } }).catch(() => {});
    render(d)
      .then((p) => interaction.message?.edit?.({ ...p, allowedMentions: { parse: [] } }))
      .catch(() => {});
    await interaction.channel
      .send({ content: `🎉 مبروك <@${d.winnerId}>، فزت بـ **${d.prize}**! تواصل مع <@${d.hostId}> عشان تستلمها.`, reply: { messageReference: id, failIfNotExists: false }, components: [require('./growth').brandRow(interaction.guild.id)].filter(Boolean), allowedMentions: { users: [d.winnerId] } })
      .catch(() => {});
    interaction.user.send({ content: `🎁 مبروك! فزت بـ **${d.prize}** بسيرفر **${interaction.guild.name}**. تواصل مع <@${d.hostId}> عشان تستلم جائزتك.` }).catch(() => {});
    logs.send(interaction.guild, 'moderation_actions', {
      content: `${E.gift} بوكس **${d.prize}** — الفائز <@${d.winnerId}> (${interaction.user.username}) · نزّله <@${d.hostId}>`,
    });
  } finally {
    claiming.delete(id);
  }
}

function tick(client) {
  const now = Date.now();
  let changed = false;
  for (const [id, d] of Object.entries(all())) {
    if (!d.winnerId && !d.expired && now - d.createdAt > EXPIRE_MS) {
      d.expired = true;
      changed = true;
      refresh(client, d).catch(() => {});
    }
    // clean up old finished drops after 3 days
    if ((d.winnerId || d.expired) && now - d.createdAt > 3 * 86_400_000) {
      delete all()[id];
      changed = true;
    }
  }
  if (changed) save();
}

function init(client) {
  client.once(Events.ClientReady, () => {
    // re-open any drop whose wait timer was lost on restart
    for (const d of Object.values(all())) {
      if (d.winnerId || d.expired) continue;
      const left = d.openAt - Date.now();
      if (left > 0) setTimeout(() => open(client, d.messageId), left);
      else open(client, d.messageId);
    }
    setInterval(() => tick(client), 60_000);
  });
}

module.exports = { start, render, init, all, components: [{ prefix: 'drop_claim', type: 'button', handle: onClaim }] };
