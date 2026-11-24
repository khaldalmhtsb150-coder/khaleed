// Verification: new members press a button to get the verified role (free).
// Premium ("captcha"): an image captcha before the role, and a minimum account age.
const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const premium = require('../utils/premium');

const DEFAULT = {
  enabled: false,
  channelId: '',
  roleId: '', // given after verifying
  removeRoleId: '', // optional "unverified" role removed after verifying
  messageId: '',
  title: 'التحقق',
  text: 'اضغط الزر تحت عشان تتحقق وتشوف باقي السيرفر.',
  mode: 'button', // button | captcha (premium)
  minAccountDays: 0, // premium
};
const config = (gid) => ({ ...DEFAULT, ...(store.peek('verifyConfig', gid) || {}) });

let canvas = null;
for (const n of ['canvas', '@napi-rs/canvas']) {
  try {
    canvas = require(n);
    break;
  } catch {}
}

const pendingCodes = new Map(); // guild:user → { code, until, tries }
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

function captchaImage(code) {
  if (!canvas) return null;
  const c = canvas.createCanvas(320, 110);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111321';
  ctx.fillRect(0, 0, 320, 110);
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(${140 + Math.random() * 100},${120 + Math.random() * 100},255,.5)`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 320, Math.random() * 110);
    ctx.bezierCurveTo(Math.random() * 320, Math.random() * 110, Math.random() * 320, Math.random() * 110, Math.random() * 320, Math.random() * 110);
    ctx.stroke();
  }
  [...code].forEach((ch, i) => {
    ctx.save();
    ctx.translate(40 + i * 56, 62 + (Math.random() * 16 - 8));
    ctx.rotate((Math.random() - 0.5) * 0.6);
    ctx.font = 'bold 46px sans-serif';
    ctx.fillStyle = ['#F5F5FA', '#A78BFA', '#91C8FF'][i % 3];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * 320, Math.random() * 110, 2, 2);
  }
  return new AttachmentBuilder(c.toBuffer('image/png'), { name: 'captcha.png' });
}

async function publish(guild) {
  const conf = config(guild.id);
  const channel = guild.channels.cache.get(conf.channelId);
  if (!channel?.isTextBased()) throw new Error('اختار قناة التحقق');
  const role = guild.roles.cache.get(conf.roleId);
  if (!role) throw new Error('اختار رتبة التحقق');
  if (!role.editable) throw new Error('رتبة التحقق أعلى من رتبة البوت');
  const art = require('../utils/art');
  const b = art.banner('verify');
  const e = ui.embed().setColor(art.accentInt('verify')).setDescription(`### ${conf.title}\n${conf.text}`);
  if (b) e.setImage('attachment://verify.jpg');
  const btn = new ButtonBuilder().setCustomId('vf_start').setLabel('تحقق').setStyle(ButtonStyle.Success);
  btn.setEmoji(art.icon('verify') || '✅');
  const payload = { embeds: [e], files: b ? [b] : [], attachments: [], components: [new ActionRowBuilder().addComponents(btn)] };
  const old = conf.messageId && (await channel.messages.fetch(conf.messageId).catch(() => null));
  const msg = old ? await old.edit(payload) : await channel.send(payload);
  store.guild('verifyConfig', guild.id).messageId = msg.id;
  store.save('verifyConfig');
  return msg;
}

async function grant(interaction, conf) {
  const m = interaction.member;
  await m.roles.add(conf.roleId, 'تحقق').catch(() => {});
  if (conf.removeRoleId) await m.roles.remove(conf.removeRoleId, 'تحقق').catch(() => {});
}

async function onStart(interaction) {
  const conf = config(interaction.guild.id);
  if (!conf.enabled || !interaction.guild.roles.cache.has(conf.roleId)) return interaction.reply({ content: '• التحقق مش مُعد.', ephemeral: true });
  if (interaction.member.roles.cache.has(conf.roleId)) return interaction.reply({ content: `${E.success} إنت متحقق أصلاً.`, ephemeral: true });
  const plus = premium.has(interaction.guild.id, 'captcha');
  if (plus && conf.minAccountDays > 0) {
    const age = (Date.now() - interaction.user.createdTimestamp) / 86_400_000;
    if (age < conf.minAccountDays)
      return interaction.reply({ content: `${E.error} حسابك جديد كثير (عمره ${Math.floor(age)} يوم). السيرفر بيطلب حساب عمره ${conf.minAccountDays} يوم على الأقل.`, ephemeral: true });
  }
  if (plus && conf.mode === 'captcha' && canvas) {
    const code = randCode();
    pendingCodes.set(`${interaction.guild.id}:${interaction.user.id}`, { code, until: Date.now() + 5 * 60_000, tries: 0 });
    return interaction.reply({
      content: 'اكتب الحروف اللي بالصورة:',
      files: [captchaImage(code)],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('vf_answer').setLabel('اكتب الكود').setStyle(ButtonStyle.Primary))],
      ephemeral: true,
    });
  }
  await grant(interaction, conf);
  return interaction.reply({ content: `${E.success} تم التحقق، أهلاً فيك!`, ephemeral: true });
}

async function onAnswerButton(interaction) {
  const modal = new ModalBuilder().setCustomId('vf_modal').setTitle('التحقق');
  modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('الحروف اللي بالصورة').setStyle(TextInputStyle.Short).setMinLength(5).setMaxLength(5).setRequired(true)));
  return interaction.showModal(modal);
}

async function onModal(interaction) {
  const key = `${interaction.guild.id}:${interaction.user.id}`;
  const p = pendingCodes.get(key);
  if (!p || p.until < Date.now()) return interaction.reply({ content: '• انتهى الوقت، اضغط "تحقق" مرة ثانية.', ephemeral: true });
  const answer = interaction.fields.getTextInputValue('code').trim().toUpperCase();
  if (answer !== p.code) {
    p.tries++;
    if (p.tries >= 3) pendingCodes.delete(key);
    return interaction.reply({ content: `${E.error} الكود غلط.${p.tries >= 3 ? ' اضغط "تحقق" من جديد.' : ''}`, ephemeral: true });
  }
  pendingCodes.delete(key);
  await grant(interaction, config(interaction.guild.id));
  return interaction.reply({ content: `${E.success} تم التحقق، أهلاً فيك!`, ephemeral: true });
}

async function handle(interaction) {
  if (interaction.customId === 'vf_start') return onStart(interaction);
  if (interaction.customId === 'vf_answer') return onAnswerButton(interaction);
  if (interaction.customId === 'vf_modal') return onModal(interaction);
}

function init(client) {
  setInterval(() => {
    for (const [k, v] of pendingCodes) if (v.until < Date.now()) pendingCodes.delete(k);
  }, 60_000).unref();
}

const components = [{ prefix: 'vf_', handle }];

module.exports = { init, components, config, publish, DEFAULT, hasCanvas: () => Boolean(canvas), captchaImage };
