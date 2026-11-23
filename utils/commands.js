const fs = require('fs');
const path = require('path');
const {
  Collection,
  SlashCommandBuilder,
  PermissionsBitField,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const store = require('./store');
const ui = require('./ui');
const { isOwner, isBotAdmin, isBlacklisted, hasManagerRole } = require('./perms');
const { CommandContext, parsePrefixOptions, parseSlashOptions } = require('./context');
const aliases = require('./aliases');
const stats = require('./stats');
const botlog = require('./botlog');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

const CATEGORIES = {
  general: 'عام',
  giveaway: 'القيفاواي',
  invites: 'الدعوات والعجلة',
  levels: 'المستويات',
  community: 'المجتمع',
  greetings: 'الترحيب',
  channels: 'التحكم بالقنوات',
  moderation: 'الإدارة والسجن',
  logs: 'السجلات',
  tickets: 'التذاكر',
  config: 'إعدادات السيرفر',
  owner: 'المالك',
};

const commands = new Collection(); // canonical name → command
const lookup = new Collection(); // name + aliases → command
const cooldowns = new Map();

function load() {
  commands.clear();
  lookup.clear();
  for (const category of fs.readdirSync(COMMANDS_DIR)) {
    const dir = path.join(COMMANDS_DIR, category);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_'))) {
      const cmd = require(path.join(dir, file));
      cmd.category = cmd.category || category;
      commands.set(cmd.name, cmd);
      lookup.set(cmd.name.toLowerCase(), cmd);
      for (const alias of cmd.aliases || []) lookup.set(alias.toLowerCase(), cmd);
    }
  }
  return commands;
}

function buildSlash(cmd) {
  const b = new SlashCommandBuilder()
    .setName(cmd.name)
    .setDescription(cmd.description.slice(0, 100))
    .setDMPermission(false);

  if (cmd.ownerOnly || cmd.adminOnly) b.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  else if (cmd.perms?.length) b.setDefaultMemberPermissions(PermissionsBitField.resolve(cmd.perms));

  for (const opt of cmd.options || []) {
    const base = (o) => {
      o.setName(opt.name).setDescription((opt.description || opt.name).slice(0, 100)).setRequired(Boolean(opt.required));
      return o;
    };
    switch (opt.type) {
      case 'user':
      case 'member':
        b.addUserOption((o) => base(o));
        break;
      case 'channel':
        b.addChannelOption((o) => {
          base(o);
          if (opt.channelTypes) o.addChannelTypes(...opt.channelTypes);
          return o;
        });
        break;
      case 'role':
        b.addRoleOption((o) => base(o));
        break;
      case 'integer':
        b.addIntegerOption((o) => {
          base(o);
          if (opt.min !== undefined) o.setMinValue(opt.min);
          if (opt.max !== undefined) o.setMaxValue(opt.max);
          return o;
        });
        break;
      case 'number':
        b.addNumberOption((o) => base(o));
        break;
      case 'boolean':
        b.addBooleanOption((o) => base(o));
        break;
      default:
        b.addStringOption((o) => {
          base(o);
          if (opt.choices) o.addChoices(...opt.choices.map((c) => ({ name: c.name, value: String(c.value) })));
          if (opt.maxLength) o.setMaxLength(opt.maxLength);
          return o;
        });
    }
  }
  return b.toJSON();
}

function slashPayload() {
  return [...commands.values()].filter((c) => !c.prefixOnly).map(buildSlash);
}

async function register(client) {
  const body = slashPayload();
  await client.application.commands.set(body);
  console.log(`[commands] registered ${body.length} slash commands`);
}

function isDisabled(guildId, name) {
  return Boolean(guildId && store.get('disabledCommands')[guildId]?.includes(name));
}

/** Returns an Arabic error line or null when allowed. */
function checkAccess(ctx) {
  const { command: cmd, user, member, guild } = ctx;

  if (isBlacklisted(user.id, guild?.id)) return 'أنت محظور من استخدام هذا البوت.';
  const settings = store.get('botSettings');
  if (settings.maintenance?.enabled && !isOwner(user.id)) return settings.maintenance.message || 'البوت تحت الصيانة حالياً، حاول لاحقاً.';
  if (settings.globalDisabled?.includes(cmd.name)) return 'هذا الأمر متوقف مؤقتاً في جميع السيرفرات.';
  if (cmd.ownerOnly && !isOwner(user.id)) return 'هذا الأمر مخصص لمالك البوت فقط.';
  if (cmd.adminOnly && !isBotAdmin(user.id)) return 'هذا الأمر مخصص لإدارة البوت فقط.';
  if (!guild) return cmd.dmAllowed ? null : 'هذا الأمر يعمل داخل السيرفرات فقط.';
  if (!cmd.ownerOnly && isDisabled(guild.id, cmd.name)) return 'هذا الأمر معطّل في هذا السيرفر.';

  if (cmd.perms?.length && !isOwner(user.id)) {
    const allowed = member.permissions.has(cmd.perms) || hasManagerRole(member);
    if (!allowed) return 'لا تملك الصلاحيات الكافية لاستخدام هذا الأمر.';
  }

  if (cmd.botPerms?.length) {
    const me = guild.members.me;
    const missing = cmd.botPerms.filter((p) => !me.permissions.has(p));
    if (missing.length) return `أحتاج صلاحية ${ui.permName(missing[0])} لتنفيذ هذا الأمر.`;
  }

  const cd = (cmd.cooldown ?? 3) * 1000;
  if (cd && !isOwner(user.id)) {
    const key = `${cmd.name}:${user.id}`;
    const until = cooldowns.get(key) || 0;
    if (until > Date.now()) {
      const left = Math.ceil((until - Date.now()) / 1000);
      return `يرجى الانتظار ${left} ثانية قبل استخدام الأمر مجدداً.`;
    }
    cooldowns.set(key, Date.now() + cd);
  }
  return null;
}

async function run(ctx, { silent = false } = {}) {
  const denied = checkAccess(ctx);
  if (denied) return silent ? null : ctx.fail(denied);
  stats.record(ctx.command.name);
  botlog.log('command', `استخدم /${ctx.command.name}${ctx.channel?.id ? ` في <#${ctx.channel.id}>` : ''}`, {
    user: { id: ctx.user.id, name: ctx.user.username },
    guild: ctx.guild,
  });
  try {
    await ctx.command.run(ctx);
  } catch (err) {
    console.error(`[command:${ctx.command.name}]`, err);
    await ctx.fail('حدث خطأ غير متوقع أثناء تنفيذ الأمر.').catch(() => {});
  }
}

async function handleInteraction(interaction) {
  const cmd = commands.get(interaction.commandName);
  if (!cmd) return;
  const ctx = new CommandContext({
    client: interaction.client,
    command: cmd,
    interaction,
    options: parseSlashOptions(cmd, interaction),
  });
  return run(ctx);
}

function getPrefix(message) {
  const mention = new RegExp(`^<@!?${message.client.user.id}>\\s*`);
  const m = message.content.match(mention);
  // Mention-prefix: always available for bot owners (owner tools stay reachable), and in DMs.
  if (m && (isOwner(message.author.id) || !message.guild)) return m[0];
  if (!message.guild) return null;
  const custom = store.get('prefixes')[message.guild.id];
  if (custom && message.content.startsWith(custom)) return custom;
  return null;
}

async function handleMessage(message) {
  const prefix = getPrefix(message);
  let args;
  let cmd;
  let silent = false;

  if (prefix) {
    args = message.content.slice(prefix.length).trim().split(/\s+/);
    const name = (args.shift() || '').toLowerCase();
    const custom = aliases.resolve(message.guild?.id, name);
    cmd = custom ? commands.get(custom) : lookup.get(name);
  } else if (message.guild) {
    // server shortcuts work without a prefix too (e.g. "باند @user")
    args = message.content.trim().split(/\s+/);
    const custom = aliases.resolve(message.guild.id, args.shift() || '');
    if (!custom) return false;
    cmd = commands.get(custom);
    silent = true; // ignore quietly when a normal member types the word in chat
  } else {
    return false;
  }
  if (!cmd || cmd.slashOnly) return false;

  const ctx = new CommandContext({
    client: message.client,
    command: cmd,
    message,
    prefix: prefix ? (prefix.startsWith('<@') ? `@${message.client.user.username} ` : prefix) : '',
  });

  if (silent && checkSilent(ctx)) return false;

  const parsed = await parsePrefixOptions(cmd, message, args);
  if (parsed.missing || parsed.invalid) {
    const def = parsed.missing || parsed.invalid;
    return ctx.reply(
      `• ${parsed.missing ? 'معطيات ناقصة' : 'قيمة غير صالحة'}: ${def.description || def.name}\n${ui.hint(`الاستخدام: ${ctx.usage()}`)}`
    );
  }
  ctx.options = parsed.options;
  await run(ctx, { silent });
  return true;
}

/** For prefix-less shortcuts: true when the member clearly isn't allowed (skip without replying). */
function checkSilent(ctx) {
  const { command: cmd, user, member, guild } = ctx;
  if (isBlacklisted(user.id, guild.id)) return true;
  const settings = store.get('botSettings');
  if (settings.maintenance?.enabled && !isOwner(user.id)) return true;
  if (settings.globalDisabled?.includes(cmd.name)) return true;
  if (cmd.ownerOnly && !isOwner(user.id)) return true;
  if (cmd.adminOnly && !isBotAdmin(user.id)) return true;
  if (isDisabled(guild.id, cmd.name)) return true;
  if (cmd.perms?.length && !isOwner(user.id) && !(member.permissions.has(cmd.perms) || hasManagerRole(member))) return true;
  return false;
}

module.exports = {
  CATEGORIES,
  commands,
  lookup,
  load,
  register,
  slashPayload,
  handleInteraction,
  handleMessage,
  isDisabled,
  ChannelType,
};
