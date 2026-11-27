// Unified context so every command is written once and works as /slash and as a text prefix command.
const { ChannelType } = require('discord.js');

const ID = (s) => (String(s).match(/^(?:<[@#][!&]?)?(\d{17,21})>?$/) || [])[1];

const BOOL = {
  true: true, on: true, yes: true, enable: true, '1': true, تفعيل: true, تشغيل: true, نعم: true,
  false: false, off: false, no: false, disable: false, '0': false, تعطيل: false, ايقاف: false, إيقاف: false, لا: false,
};

async function resolveToken(def, token, message) {
  const guild = message.guild;
  switch (def.type) {
    case 'user': {
      const id = ID(token);
      return id ? message.client.users.fetch(id).catch(() => null) : null;
    }
    case 'member': {
      const id = ID(token);
      return id && guild ? guild.members.fetch(id).catch(() => null) : null;
    }
    case 'channel': {
      const id = ID(token);
      const ch = id ? guild?.channels.cache.get(id) : null;
      if (!ch) return null;
      if (def.channelTypes && !def.channelTypes.includes(ch.type)) return null;
      return ch;
    }
    case 'role': {
      const id = ID(token);
      if (id) return guild?.roles.cache.get(id) || null;
      return guild?.roles.cache.find((r) => r.name.toLowerCase() === token.toLowerCase()) || null;
    }
    case 'integer': {
      if (!/^-?\d+$/.test(token)) return null;
      const n = parseInt(token, 10);
      if (def.min !== undefined && n < def.min) return null;
      if (def.max !== undefined && n > def.max) return null;
      return n;
    }
    case 'number': {
      const n = Number(token);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean': {
      const v = BOOL[token.toLowerCase()];
      return v === undefined ? null : v;
    }
    default: {
      if (def.choices) {
        const c = def.choices.find(
          (ch) => String(ch.value).toLowerCase() === token.toLowerCase() || ch.name === token
        );
        return c ? c.value : null;
      }
      return token;
    }
  }
}

async function parsePrefixOptions(command, message, args) {
  const out = {};
  let i = 0;
  for (const def of command.options || []) {
    if (def.rest) {
      const rest = args.slice(i).join(' ').trim();
      i = args.length;
      if (rest) out[def.name] = rest;
      else if (def.required) return { missing: def };
      continue;
    }
    const token = args[i];
    if (token === undefined) {
      if (def.required) return { missing: def };
      continue;
    }
    const value = await resolveToken(def, token, message);
    if (value === null || value === undefined) {
      if (def.required) return { invalid: def };
      continue; // optional & not matching: leave the token for the next option
    }
    out[def.name] = value;
    i++;
  }
  return { options: out };
}

function parseSlashOptions(command, interaction) {
  const out = {};
  const o = interaction.options;
  for (const def of command.options || []) {
    let v = null;
    switch (def.type) {
      case 'user': v = o.getUser(def.name); break;
      case 'member': v = o.getMember(def.name); break;
      case 'channel': v = o.getChannel(def.name); break;
      case 'role': v = o.getRole(def.name); break;
      case 'integer': v = o.getInteger(def.name); break;
      case 'number': v = o.getNumber(def.name); break;
      case 'boolean': v = o.getBoolean(def.name); break;
      case 'attachment': v = o.getAttachment(def.name); break;
      default: v = o.getString(def.name);
    }
    if (v !== null && v !== undefined) out[def.name] = v;
  }
  return out;
}

class CommandContext {
  constructor({ client, command, interaction = null, message = null, prefix = '/', options = {} }) {
    this.client = client;
    this.command = command;
    this.interaction = interaction;
    this.message = message;
    this.prefix = prefix;
    this.options = options;
    this._deferEdited = false;
  }

  get isSlash() { return Boolean(this.interaction); }
  get source() { return this.interaction || this.message; }
  get guild() { return this.source.guild; }
  get channel() { return this.source.channel; }
  get member() { return this.source.member; }
  get user() { return this.interaction ? this.interaction.user : this.message.author; }

  get(name) {
    return this.options[name] ?? null;
  }

  usage() {
    const p = this.isSlash ? '/' : this.prefix;
    const args = (this.command.options || [])
      .map((o) => (o.required ? `<${o.label || o.name}>` : `[${o.label || o.name}]`))
      .join(' ');
    return `${p}${this.isSlash ? this.command.name : this.command.prefixName || this.command.name} ${args}`.trim();
  }

  async defer(ephemeral = false) {
    if (this.interaction) {
      if (!this.interaction.deferred && !this.interaction.replied) await this.interaction.deferReply({ ephemeral });
    } else {
      await this.channel.sendTyping().catch(() => {});
    }
  }

  async reply(payload, { ephemeral = false } = {}) {
    const data = typeof payload === 'string' ? { content: payload } : { ...payload };
    if (this.interaction) {
      const i = this.interaction;
      if (i.deferred && !this._deferEdited) {
        this._deferEdited = true;
        return i.editReply(data);
      }
      if (i.replied || i.deferred) return i.followUp({ ...data, ephemeral });
      await i.reply({ ...data, ephemeral });
      return i.fetchReply();
    }
    return this.message.reply({
      ...data,
      allowedMentions: { repliedUser: false, ...(data.allowedMentions || {}) },
    });
  }

  // ---- the four response styles (utils/ui.notice): one look for every command ----
  /** Error: red side, ephemeral on slash. */
  fail(text, opts = {}) {
    return this.reply({ embeds: [require('./ui').notice('danger', text, opts)], allowedMentions: { parse: [] } }, { ephemeral: true });
  }
  /** Done: green side. */
  ok(text, opts = {}) {
    return this._notice('success', text, opts);
  }
  /** Careful: amber side. */
  warn(text, opts = {}) {
    return this._notice('warning', text, opts);
  }
  /** Neutral information: blue side. */
  info(text, opts = {}) {
    return this._notice('info', text, opts);
  }
  _notice(kind, text, { ephemeral = false, components, files, allowedMentions, ...rest } = {}) {
    const data = { embeds: [require('./ui').notice(kind, text, rest)], allowedMentions: allowedMentions || { parse: [] } };
    if (components) data.components = components;
    if (files) data.files = files;
    return this.reply(data, { ephemeral });
  }
}

module.exports = { CommandContext, parsePrefixOptions, parseSlashOptions, ChannelType };
