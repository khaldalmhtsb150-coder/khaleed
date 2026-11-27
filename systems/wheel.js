// Wheel of fortune — panel button opens a private ticket, spins, announces the prize.
const { ActionRowBuilder, ChannelType, PermissionFlagsBits, ButtonStyle, AttachmentBuilder } = require('discord.js');
const wheelImage = require('./wheelImage');
const premium = require('../utils/premium');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const inv = require('./invites');
const { canManageGuild } = require('../utils/perms');

const busy = new Set();
const config = (guildId) => store.guild('wheelConfig', guildId);
/** The wheel is on unless an admin turned it off with /wheel-toggle. */
const isEnabled = (guildId) => store.peek('wheelConfig', guildId)?.enabled !== false;
const openTickets = (guildId) => store.guild('wheelTickets', guildId);
const rewardsOf = (guildId) => {
  const r = store.get('wheelRewards')[guildId];
  // free servers use the first 15; rewards added with premium stay saved and come back on renewal
  return Array.isArray(r) ? r.slice(0, require('../utils/premium').limit(guildId, 'wheelRewards')) : [];
};
const odds = require('../utils/wheelOdds');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildPanel(guild) {
  const rewards = rewardsOf(guild.id);
  const embed = ui
    .embed()
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() || undefined })
    .setDescription(
      [
        `### ${E.wheel} عجلة الحظ`,
        'ادعُ أصدقاءك للسيرفر واجمع النقاط، كل لفة تكلف **نقطة واحدة**.',
        '',
        `${E.dot} اضغط الزر بالأسفل لفتح تذكرة العجلة الخاصة بك.`,
        `${E.dot} البوت يلف العجلة ويعلن جائزتك تلقائياً.`,
        `${E.dot} عدد الجوائز المتاحة: **${rewards.length}**`,
        '',
        ui.hint('النقاط تُحسب فقط للحسابات الحقيقية التي تبقى في السيرفر.'),
      ].join('\n')
    );
  const row = new ActionRowBuilder().addComponents(
    ui.button('wheel_open', 'لف العجلة', { emoji: 'wheel' }),
    ui.button('wheel_balance', 'رصيدي', { emoji: 'coins' })
  );
  return { embeds: [embed], components: [row] };
}

async function open(interaction) {
  const { guild, user } = interaction;
  const conf = config(guild.id);
  if (!isEnabled(guild.id)) return interaction.reply({ content: `${E.lock} عجلة الحظ متوقفة حالياً.`, ephemeral: true });
  const category = conf.categoryId ? guild.channels.cache.get(conf.categoryId) : null;
  if (!category) return interaction.reply({ content: '• نظام العجلة غير مُعد بعد، تواصل مع الإدارة.', ephemeral: true });

  const rewards = rewardsOf(guild.id);
  if (!rewards.length) return interaction.reply({ content: '• لا توجد جوائز في العجلة حالياً.', ephemeral: true });
  if (odds.table(rewards).total <= 0) return interaction.reply({ content: '• كل جوائز العجلة نسبتها 0% حالياً، كلّم الإدارة.', ephemeral: true });

  const tickets = openTickets(guild.id);
  if (tickets[user.id] && guild.channels.cache.has(tickets[user.id]))
    return interaction.reply({ content: `• عندك تذكرة عجلة مفتوحة: <#${tickets[user.id]}>`, ephemeral: true });

  const e = inv.entry(guild.id, user.id);
  if (e.points < 1) return interaction.reply({ content: `• لا تملك نقاطاً كافية. رصيدك: **${e.points}** — ادعُ أعضاء جدد لتحصل على نقاط.`, ephemeral: true });

  if (busy.has(user.id)) return interaction.reply({ content: '• طلبك قيد التنفيذ.', ephemeral: true });
  busy.add(user.id);
  await interaction.deferReply({ ephemeral: true });

  try {
    const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages];
    const channel = await guild.channels.create({
      name: `wheel-${user.username}`.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 90) || `wheel-${user.id}`,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `عجلة الحظ · ${user.id}`,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow },
        { id: guild.members.me.id, allow: [...allow, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] },
      ],
    });

    e.points -= 1;
    store.save('invites');
    tickets[user.id] = channel.id;
    store.save('wheelTickets');

    await interaction.editReply(`${E.success} انفتحت تذكرة العجلة: ${channel}`);

    const reward = odds.pick(rewards);
    const closeRow = new ActionRowBuilder().addComponents(ui.button('wheel_close', 'إغلاق التذكرة', { emoji: 'lock', style: ButtonStyle.Danger }));
    const resultEmbed = () =>
      ui
        .embed()
        .setDescription(
          [
            `### ${E.gift} ${reward}`,
            `مبروك ${user}! هذه جائزتك من عجلة الحظ.`,
            '',
            `${E.coins} رصيدك المتبقي: **${e.points}** نقطة`,
            ui.hint('سيتواصل معك فريق الإدارة لتسليم الجائزة.'),
          ].join('\n')
        );

    // spinning picture: the MarkaBot wheel, or the server's own picture on premium
    const pic = await wheelImage
      .render(rewards.map(odds.nameOf), reward, { background: premium.has(guild.id, 'wheelImage') ? conf.image || '' : '' })
      .catch((err) => (console.error('[wheel image]', err.message), null));

    if (pic) {
      const msg = await channel.send({
        content: `${user}`,
        embeds: [ui.embed().setDescription(`### ${E.wheel} العجلة تدور...`).setImage('attachment://wheel.gif')],
        files: [new AttachmentBuilder(pic.gif, { name: 'wheel.gif' })],
      });
      await sleep(pic.duration + 600);
      // swap to a still picture so the spin doesn't replay every time someone opens the chat
      await msg
        .edit({ embeds: [resultEmbed().setImage('attachment://wheel.png')], files: [new AttachmentBuilder(pic.png, { name: 'wheel.png' })], attachments: [], components: [closeRow] })
        .catch(() => {});
    } else {
      // no canvas on the host: the old text animation
      const msg = await channel.send({
        content: `${user}`,
        embeds: [ui.embed().setDescription(`### ${E.wheel} العجلة تدور ${E.loading}\n${ui.hint('حظاً موفقاً!')}`)],
      });
      for (let i = 0; i < 4; i++) {
        await sleep(800);
        const r = odds.nameOf(rewards[Math.floor(Math.random() * rewards.length)]);
        await msg.edit({ embeds: [ui.embed().setDescription(`### ${E.wheel} العجلة تدور ${E.loading}\n\`${r}\``)] }).catch(() => {});
      }
      await sleep(900);
      await msg.edit({ embeds: [resultEmbed()], components: [closeRow] });
    }

    const results = conf.resultsChannelId ? guild.channels.cache.get(conf.resultsChannelId) : null;
    if (results?.isTextBased()) {
      await results
        .send({
          content: `${E.wheel} مبروك ${user}! ربحت من عجلة الحظ: **${reward}**`,
          allowedMentions: { users: [user.id] },
          files: pic ? [new AttachmentBuilder(pic.png, { name: 'wheel.png' })] : [],
        })
        .catch(() => {});
    }
  } catch (err) {
    console.error('[wheel]', err.message);
    await interaction.editReply('• ما قدرت أفتح التذكرة، تأكد إنه البوت معه صلاحية إدارة القنوات.').catch(() => {});
  } finally {
    busy.delete(user.id);
  }
}

async function close(interaction) {
  const tickets = openTickets(interaction.guild.id);
  const ownerId = Object.keys(tickets).find((uid) => tickets[uid] === interaction.channelId);
  if (interaction.user.id !== ownerId && !canManageGuild(interaction.member))
    return interaction.reply({ content: '• لا تملك صلاحية إغلاق هذه التذكرة.', ephemeral: true });
  if (ownerId) {
    delete tickets[ownerId];
    store.save('wheelTickets');
  }
  await interaction.reply({ content: `${E.lock} التذكرة رح تتسكّر خلال 5 ثواني…` });
  setTimeout(() => interaction.channel.delete('Wheel ticket closed').catch(() => {}), 5000);
}

async function route(interaction) {
  if (!interaction.guild) return;
  if (interaction.customId === 'wheel_open') return open(interaction);
  if (interaction.customId === 'wheel_close') return close(interaction);
  if (interaction.customId === 'wheel_balance') {
    const e = inv.entry(interaction.guild.id, interaction.user.id);
    return interaction.reply({ content: `${E.coins} رصيدك: **${e.points}** نقطة ${E.dot} دعواتك: **${e.regular + e.bonus}**`, ephemeral: true });
  }
}

module.exports = { buildPanel, config, isEnabled, components: [{ prefix: 'wheel_', type: 'button', handle: route }] };
