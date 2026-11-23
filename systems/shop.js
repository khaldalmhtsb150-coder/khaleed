// Premium shop: buy premium with ProBot credits inside a ticket.
// Flow: buyer opens a ticket in a "shop" department → picks a plan → transfers credits to the owner with ProBot →
// the bot sees ProBot's confirmation in the same channel → generates a code → DMs it with the duration.
const { Events, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const premium = require('../utils/premium');
const botlog = require('../utils/botlog');

const PROBOT_ID = '282859044593598464';
const DEFAULT_PLANS = [
  { id: 'm1', label: 'شهر', days: 30, price: 500_000_000 },
  { id: 'm3', label: '3 شهور', days: 90, price: 1_250_000_000 },
  { id: 'm6', label: '6 شهور', days: 180, price: 2_250_000_000 },
  { id: 'y1', label: 'سنة', days: 365, price: 4_000_000_000 },
  { id: 'life', label: 'دائم', days: 0, price: 7_500_000_000, stock: 50 },
];
const DEFAULT = {
  enabled: false,
  guildId: '', // the support server where the shop works
  recipientId: '', // who receives the credits (defaults to the bot owner)
  logChannelId: '',
  taxPercent: 5, // ProBot transfer tax — buyer sends price + tax so the owner receives the full price
  minutes: 5, // time to transfer after picking a plan
  probotId: PROBOT_ID,
  plans: DEFAULT_PLANS,
  launchDiscount: 0, // % off every plan (0 = none)
};

function config() {
  const c = premium.config().shop || {};
  return { ...DEFAULT, ...c, plans: Array.isArray(c.plans) && c.plans.length ? c.plans : DEFAULT_PLANS };
}

const fmt = (n) => {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(n);
};
const priceOf = (plan, conf) => Math.round(plan.price * (1 - (conf.launchDiscount || 0) / 100));
/** What the buyer must type so the recipient gets `net` after ProBot's tax. */
const withTax = (net, tax) => (tax > 0 ? Math.ceil(net / (1 - tax / 100)) : net);
const soldOf = (planId) => Object.values(store.get('shopOrders')).filter((o) => o.planId === planId && o.status === 'paid').length;
const left = (plan) => (plan.stock ? Math.max(0, plan.stock - soldOf(plan.id)) : Infinity);
const durationText = (days) => (days ? `${days} يوم` : 'دائم');

const recipientOf = (conf, client) => conf.recipientId || process.env.OWNER_ID?.split(',')[0]?.trim() || client.application?.owner?.id || '';

// pending purchases by channel id (also persisted so a restart doesn't lose a paid order)
const pending = () => store.get('shopOrders');

// ---------- panel ----------
function panel(conf) {
  const options = conf.plans
    .filter((p) => left(p) > 0)
    .slice(0, 25)
    .map((p) => ({
      label: `${p.label} — ${fmt(priceOf(p, conf))} كريدت`,
      description: `${durationText(p.days)}${p.stock ? ` · باقي ${left(p)} نسخة` : ''}`.slice(0, 100),
      value: p.id,
      emoji: '👑',
    }));
  const lines = conf.plans.map((p) => {
    const price = priceOf(p, conf);
    const was = conf.launchDiscount ? ` ~~${fmt(p.price)}~~` : '';
    const stock = p.stock ? (left(p) ? ` · باقي ${left(p)}` : ' · **نفدت**') : '';
    return `${E.dot} **${p.label}** — \`${fmt(price)}\`${was} كريدت${stock}`;
  });
  return {
    embeds: [
      ui
        .embed()
        .setDescription(
          [
            `### 👑 شراء MarkaBot Premium`,
            ...lines,
            conf.launchDiscount ? `\n🎉 **خصم ${conf.launchDiscount}%** على كل الخطط!` : '',
            '',
            `${E.dot} اختار الخطة من القائمة، وبعدها البوت بيحكيلك كم تحوّل بالزبط.`,
            `${E.dot} بعد التحويل بيوصلك **كود التفعيل على الخاص** فوراً.`,
            ui.hint('تأكد إن الخاص عندك مفتوح. الكود بتفعّله بسيرفرك بأمر /premium'),
          ]
            .filter((l) => l !== '')
            .join('\n')
        ),
    ],
    components: options.length
      ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('shop_plan').setPlaceholder('اختار الخطة...').addOptions(options))]
      : [],
  };
}

/** Called by the ticket system when a ticket opens in a shop department. */
async function openPanel(channel, user) {
  const conf = config();
  if (!conf.enabled || channel.guild.id !== conf.guildId) return false;
  pending()[channel.id] = { channelId: channel.id, guildId: channel.guild.id, userId: user.id, status: 'choosing', at: Date.now() };
  store.save('shopOrders');
  await channel.send(panel(conf)).catch(() => {});
  return true;
}

// ---------- plan picked ----------
async function onPick(interaction) {
  const conf = config();
  const order = pending()[interaction.channelId];
  if (!conf.enabled || !order) return interaction.reply({ content: '• المتجر مش شغال بهاي القناة.', ephemeral: true });
  if (interaction.user.id !== order.userId) return interaction.reply({ content: '• هاي القائمة لصاحب التذكرة بس.', ephemeral: true });
  if (order.status === 'paid') return interaction.reply({ content: '• تم الدفع لهالتذكرة. افتح تذكرة جديدة لشراء ثاني.', ephemeral: true });

  const plan = conf.plans.find((p) => p.id === interaction.values[0]);
  if (!plan || left(plan) <= 0) return interaction.reply({ content: '• هاي الخطة مش متاحة.', ephemeral: true });

  const recipient = recipientOf(conf, interaction.client);
  if (!recipient) return interaction.reply({ content: '• المتجر مش مُعد (ما في مستلم للكريدت). تواصل مع الإدارة.', ephemeral: true });

  const net = priceOf(plan, conf);
  const pay = withTax(net, conf.taxPercent);
  Object.assign(order, { status: 'waiting', planId: plan.id, days: plan.days, net, pay, recipient, expires: Date.now() + conf.minutes * 60_000 });
  store.save('shopOrders');

  await interaction.reply({
    embeds: [
      ui
        .embed()
        .setDescription(
          [
            `### ${E.gift} خطة ${plan.label} — ${durationText(plan.days)}`,
            `حوّل المبلغ لـ <@${recipient}> خلال **${conf.minutes} دقائق**:`,
            '```',
            `#credit ${recipient} ${pay}`,
            '```',
            `${E.dot} المبلغ مع ضريبة بروبوت (${conf.taxPercent}%): **${pay.toLocaleString('en')}**`,
            `${E.dot} لازم يوصل: **${net.toLocaleString('en')}** كريدت`,
            `${E.dot} حوّل **بنفس هالتذكرة**، والبوت بيتأكد لحاله.`,
            ui.hint(`الوقت بينتهي ${`<t:${Math.floor(order.expires / 1000)}:R>`}. إذا خلص، اختار الخطة مرة ثانية.`),
          ].join('\n')
        ),
    ],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('shop_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Secondary))],
  });
}

async function onCancel(interaction) {
  const order = pending()[interaction.channelId];
  if (!order || interaction.user.id !== order.userId) return interaction.reply({ content: '• مش إلك.', ephemeral: true });
  if (order.status === 'paid') return interaction.reply({ content: '• الطلب مدفوع، ما بنفع يتلغى.', ephemeral: true });
  order.status = 'choosing';
  store.save('shopOrders');
  return interaction.update({ components: [], embeds: [ui.embed().setDescription(`${E.dot} تم الإلغاء. اختار خطة ثانية من القائمة فوق.`)] });
}

// ---------- ProBot confirmation ----------
/** Pulls the transferred amount from ProBot's message text (any language). */
function parseTransfer(message) {
  const text = [message.content, ...message.embeds.map((e) => `${e.title || ''} ${e.description || ''}`)].join(' ');
  const amount = text.match(/\$\s?([\d,]+)/);
  return { text, amount: amount ? parseInt(amount[1].replace(/,/g, ''), 10) : null };
}

async function onMessage(message) {
  const conf = config();
  if (!conf.enabled || !message.guild || message.guild.id !== conf.guildId) return;
  if (message.author.id !== conf.probotId || !message.author.bot) return;
  const order = pending()[message.channel.id];
  if (!order || order.status !== 'waiting') return;
  if (Date.now() > order.expires) return;

  const { text, amount } = parseTransfer(message);
  if (!amount) return;
  // must be to the recipient…
  if (!new RegExp(`<@!?${order.recipient}>`).test(text)) return;
  // …and from the buyer (ProBot writes the sender's username, or a mention)
  const buyer = await message.client.users.fetch(order.userId).catch(() => null);
  const names = [buyer?.username, buyer?.globalName, message.guild.members.cache.get(order.userId)?.displayName].filter(Boolean).map((n) => n.toLowerCase());
  const lower = text.toLowerCase();
  if (!new RegExp(`<@!?${order.userId}>`).test(text) && !names.some((n) => lower.includes(n))) return;

  if (amount < order.net) {
    return message.channel
      .send(`${E.error} وصل **${amount.toLocaleString('en')}** بس، والمطلوب **${order.net.toLocaleString('en')}**. حوّل الفرق أو تواصل مع الإدارة.`)
      .catch(() => {});
  }
  await complete(message.client, order, amount, message.channel);
}

async function complete(client, order, amount, channel) {
  const conf = config();
  const plan = conf.plans.find((p) => p.id === order.planId);
  const [code] = premium.generateCodes(1, order.days, { by: order.userId, note: `شراء ${plan?.label || order.planId} بالكريدت (${amount})` });
  Object.assign(order, { status: 'paid', paidAt: Date.now(), amount, code });
  store.save('shopOrders');

  const buyer = await client.users.fetch(order.userId).catch(() => null);
  const dm = await buyer
    ?.send({
      embeds: [
        ui
          .embed()
          .setDescription(
            [
              `### 👑 شكراً لشرائك MarkaBot Premium!`,
              `${E.dot} الخطة: **${plan?.label || '—'}**`,
              `${E.dot} المدة: **${durationText(order.days)}**${order.days ? ' — بتبلش من لحظة التفعيل' : ''}`,
              '',
              '**كود التفعيل:**',
              '```',
              code,
              '```',
              '**كيف تفعّله:**',
              `${E.dot} بسيرفرك اكتب: \`/premium code:${code}\``,
              `${E.dot} أو من لوحة التحكم ← البريميوم ← الصق الكود.`,
              ui.hint('الكود بيشتغل مرة وحدة لسيرفر واحد. لا تشاركه مع حدا.'),
            ].join('\n')
          ),
      ],
    })
    .then(() => true)
    .catch(() => false);

  await channel
    .send({
      content: `<@${order.userId}>`,
      embeds: [
        ui
          .embed()
          .setDescription(
            dm
              ? `### ${E.success} تم الدفع!\nبعتنالك **كود التفعيل على الخاص** (${durationText(order.days)}). فعّله بسيرفرك بأمر \`/premium\`.`
              : `### ${E.success} تم الدفع!\nالخاص عندك مسكّر، فهاي كود التفعيل (${durationText(order.days)}):\n\`\`\`\n${code}\n\`\`\`\nفعّله بسيرفرك بأمر \`/premium\`.`
          ),
      ],
      allowedMentions: { users: [order.userId] },
    })
    .catch(() => {});

  const text = `بيع بريميوم ${plan?.label || ''} لـ <@${order.userId}> مقابل ${amount.toLocaleString('en')} كريدت — الكود ${code}`;
  botlog.log('owner', text.replace(/<@\d+>/, buyer?.username || order.userId));
  const log = conf.logChannelId ? client.channels.cache.get(conf.logChannelId) : null;
  log?.send({ content: `${E.gift} ${text}`, allowedMentions: { parse: [] } }).catch(() => {});
}

function stats() {
  const orders = Object.values(store.get('shopOrders')).filter((o) => o.status === 'paid');
  return {
    sales: orders.length,
    credits: orders.reduce((a, o) => a + (o.amount || 0), 0),
    recent: orders.sort((a, b) => b.paidAt - a.paidAt).slice(0, 20).map(({ userId, planId, amount, paidAt, code, days }) => ({ userId, planId, amount, paidAt, code, days })),
  };
}

function init(client) {
  client.on(Events.MessageCreate, (m) => onMessage(m).catch((e) => console.error('[shop]', e.message)));
  // ProBot sometimes edits its message after a confirmation step
  client.on(Events.MessageUpdate, (_, m) => (m.partial ? m.fetch().then(onMessage) : onMessage(m)).catch(() => {}));
  // clean old unpaid orders once a day
  setInterval(() => {
    const all = pending();
    const cutoff = Date.now() - 3 * 86_400_000;
    for (const [id, o] of Object.entries(all)) if (o.status !== 'paid' && o.at < cutoff) delete all[id];
    store.save('shopOrders');
  }, 86_400_000).unref();
}

async function handleComponent(interaction) {
  if (interaction.customId === 'shop_plan') return onPick(interaction);
  if (interaction.customId === 'shop_cancel') return onCancel(interaction);
  return false;
}

const components = [{ prefix: 'shop_', handle: handleComponent }];

module.exports = { init, components, config, openPanel, handleComponent, panel, parseTransfer, withTax, priceOf, stats, DEFAULT, DEFAULT_PLANS, PROBOT_ID, complete };
