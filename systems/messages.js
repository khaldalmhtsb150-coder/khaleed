// Feedback channels, auto-line and custom auto replies.
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');

async function feedback(message) {
  const conf = store.peek('feedback', message.guild.id);
  if (!conf?.enabled || !conf.channels?.includes(message.channel.id)) return false;
  const embed = ui
    .embed()
    .setAuthor({ name: message.member?.displayName || message.author.username, iconURL: message.author.displayAvatarURL() })
    .setDescription(message.content || ui.hint('بدون نص'))
    .setTimestamp();
  const img = message.attachments.find((a) => a.contentType?.startsWith('image/'));
  if (img) embed.setImage(img.url);
  await message.delete().catch(() => {});
  const sent = await message.channel.send({ embeds: [embed] });
  const emojis = conf.emojis?.length ? conf.emojis : [E.reaction('upvote'), E.reaction('downvote')].filter(Boolean);
  for (const em of emojis) await sent.react(em).catch(() => {});
  return true;
}

async function autoLine(message) {
  const conf = store.peek('autoLine', message.guild.id);
  if (!conf?.enabled || !conf.imageUrl || !conf.channels?.includes(message.channel.id)) return;
  await message.channel.send(conf.imageUrl).catch(() => {});
}

async function replies(message) {
  const conf = store.peek('customReplies', message.guild.id);
  if (!conf?.enabled || !conf.replies?.length || !message.content) return;
  const text = message.content.toLowerCase();
  const match = conf.replies.find((r) => (r.exact ? text === r.trigger.toLowerCase() : text.includes(r.trigger.toLowerCase())));
  if (match) await message.reply({ content: match.response, allowedMentions: { repliedUser: false } }).catch(() => {});
}

async function handle(message) {
  if (await feedback(message)) return;
  await autoLine(message);
  await replies(message);
}

module.exports = { handle };
