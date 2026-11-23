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

function render(d) {
  const lines = [`### ${E.gift} بوكس!`, '', `**الجائزة:** ${d.prize}`];
  let label = 'اكبس بسرعة!';
  let disabled = false;
  let style = ButtonStyle.Success;
  if (d.winnerId) {
    lines.push('', `${E.crown} الفائز: <@${d.winnerId}>`, ui.hint(`كبس خلال ${((d.claimedAt - d.openAt) / 1000).toFixed(2)} ثانية`));
    label = 'انفتح البوكس';
    disabled = true;
    style = ButtonStyle.Secondary;
  } else if (d.expired) {
    lines.push('', '• انتهى البوكس بدون ما حدا يكبس.');
    label = 'انتهى';
    disabled = true;
    style = ButtonStyle.Secondary;
  } else if (Date.now() < d.openAt) {
    lines.push('', `${E.timer} البوكس بينفتح <t:${Math.ceil(d.openAt / 1000)}:R> — جهز إيدك!`);
    label = 'استنى...';
    disabled = true;
    style = ButtonStyle.Secondary;
  } else {
    lines.push('', '• أول واحد يكبس الزر بيفوز.');
  }
  lines.push(ui.hint(`بواسطة ${d.hostName}`));
  const embed = ui.embed().setDescription(lines.join('\n'));
  const row = new ActionRowBuilder().addComponents(ui.button(`drop_claim`, label, { emoji: 'gift', style, disabled }));
  return { embeds: [embed], components: [row] };
}

async function start(channel, { prize, hostId, hostName, waitMs = 0 }) {
  const d = { guildId: channel.guild.id, channelId: channel.id, prize, hostId, hostName, createdAt: Date.now(), openAt: Date.now() + waitMs, winnerId: null };
  const msg = await channel.send({ ...render(d), allowedMentions: { parse: [] } });
  d.messageId = msg.id;
  all()[msg.id] = d;
  save();
  if (waitMs > 0) setTimeout(() => open(channel.client, msg.id), waitMs);
  return msg;
}

async function refresh(client, d) {
  const ch = client.channels.cache.get(d.channelId);
  const msg = ch ? await ch.messages.fetch(d.messageId).catch(() => null) : null;
  if (msg) await msg.edit({ ...render(d), allowedMentions: { parse: [] } }).catch(() => {});
  return { ch, msg };
}

async function open(client, id) {
  const d = all()[id];
  if (d && !d.winnerId && !d.expired) await refresh(client, d);
}

async function onClaim(interaction) {
  const id = interaction.message.id;
  const d = all()[id];
  if (!d) return interaction.reply({ content: '• هذا البوكس مش موجود.', ephemeral: true });
  if (d.winnerId) return interaction.reply({ content: `• سبقك <@${d.winnerId}>!`, ephemeral: true, allowedMentions: { parse: [] } });
  if (d.expired) return interaction.reply({ content: '• هذا البوكس انتهى.', ephemeral: true });
  if (Date.now() < d.openAt) return interaction.reply({ content: '• لسا ما انفتح، استنى شوي.', ephemeral: true });
  if (interaction.user.bot) return interaction.deferUpdate().catch(() => {});
  if (interaction.user.id === d.hostId) return interaction.reply({ content: '• ما بتقدر تفوز بالبوكس اللي نزلته.', ephemeral: true });
  if (claiming.has(id)) return interaction.reply({ content: '• سبقك حدا بأجزاء من الثانية!', ephemeral: true });

  claiming.add(id);
  try {
    d.winnerId = interaction.user.id;
    d.claimedAt = Date.now();
    save();
    await interaction.update({ ...render(d), allowedMentions: { parse: [] } }).catch(() => {});
    await interaction.channel
      .send({ content: `${E.gift} مبروك <@${d.winnerId}>! فزت بـ **${d.prize}** 🎉`, reply: { messageReference: id, failIfNotExists: false }, allowedMentions: { users: [d.winnerId] } })
      .catch(() => {});
    interaction.user.send({ content: `${E.gift} مبروك! فزت بـ **${d.prize}** في سيرفر **${interaction.guild.name}**. تواصل مع <@${d.hostId}> لاستلام الجائزة.` }).catch(() => {});
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
