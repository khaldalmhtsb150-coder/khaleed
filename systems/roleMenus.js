// Role menus: members pick roles with buttons (free, 3 menus) — dropdown menus, temporary roles and up to 50 menus are premium ("roleMenusPlus").
const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const store = require('../utils/store');
const ui = require('../utils/ui');
const E = require('../utils/emojis');
const premium = require('../utils/premium');

const STYLES = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };

// menus: { [guildId]: { [menuId]: { id, channelId, messageId, title, description, color, image, mode: 'buttons'|'select', exclusive, tempMinutes, roles: [{ roleId, label, emoji, style }] } } }
const menusOf = (guildId) => store.guild('roleMenus', guildId);

function build(menu, guild) {
  const color = /^#?[0-9a-f]{6}$/i.test(menu.color || '') ? parseInt(menu.color.replace('#', ''), 16) : undefined;
  const embed = ui.embed().setDescription(`### ${menu.title || 'اختار رتبك'}\n${menu.description || ''}`.trim());
  if (color !== undefined) embed.setColor(color);
  if (/^https:\/\/\S+$/.test(menu.image || '')) embed.setImage(menu.image);
  const roles = menu.roles.filter((r) => guild.roles.cache.has(r.roleId)).slice(0, 25);
  const components = [];
  if (menu.mode === 'select' && premium.has(guild.id, 'roleMenusPlus')) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`rm_s_${menu.id}`)
      .setPlaceholder('اختار الرتب...')
      .setMinValues(0)
      .setMaxValues(menu.exclusive ? 1 : roles.length)
      .addOptions(roles.map((r) => ({ label: (r.label || guild.roles.cache.get(r.roleId).name).slice(0, 100), value: r.roleId, ...(r.emoji ? { emoji: r.emoji } : {}) })));
    components.push(new ActionRowBuilder().addComponents(select));
  } else {
    for (let i = 0; i < roles.length; i += 5) {
      const row = new ActionRowBuilder();
      for (const r of roles.slice(i, i + 5)) {
        const b = new ButtonBuilder()
          .setCustomId(`rm_b_${menu.id}_${r.roleId}`)
          .setLabel((r.label || guild.roles.cache.get(r.roleId).name).slice(0, 80))
          .setStyle(STYLES[r.style] || ButtonStyle.Secondary);
        if (r.emoji) b.setEmoji(r.emoji);
        row.addComponents(b);
      }
      components.push(row);
    }
  }
  return { embeds: [embed], components };
}

/** Posts or updates a menu message. */
async function publish(guild, menuId) {
  const menu = menusOf(guild.id)[menuId];
  if (!menu) throw new Error('القائمة مش موجودة');
  const channel = guild.channels.cache.get(menu.channelId);
  if (!channel?.isTextBased()) throw new Error('اختار قناة صحيحة');
  if (!menu.roles.length) throw new Error('ضيف رتبة وحدة على الأقل');
  const bad = menu.roles.map((r) => guild.roles.cache.get(r.roleId)).find((r) => r && !r.editable);
  if (bad) throw new Error(`الرتبة ${bad.name} أعلى من رتبة البوت`);
  const payload = build(menu, guild);
  const old = menu.messageId && (await channel.messages.fetch(menu.messageId).catch(() => null));
  const msg = old ? await old.edit(payload) : await channel.send(payload);
  menu.messageId = msg.id;
  store.save('roleMenus');
  return msg;
}

// temporary roles: { [guildId]: [{ userId, roleId, until }] }
function addTemp(guildId, userId, roleId, minutes) {
  const all = store.get('tempRoles');
  const arr = Array.isArray(all[guildId]) ? all[guildId] : [];
  all[guildId] = arr.filter((t) => !(t.userId === userId && t.roleId === roleId)).concat({ userId, roleId, until: Date.now() + minutes * 60_000 });
  store.save('tempRoles');
}

async function sweepTemp(client) {
  const all = store.get('tempRoles');
  let changed = false;
  for (const [gid, list] of Object.entries(all)) {
    if (!Array.isArray(list)) continue;
    const guild = client.guilds.cache.get(gid);
    const keep = [];
    for (const t of list) {
      if (t.until > Date.now()) keep.push(t);
      else if (guild) {
        const m = await guild.members.fetch(t.userId).catch(() => null);
        await m?.roles.remove(t.roleId, 'انتهت مدة الرتبة المؤقتة').catch(() => {});
      }
    }
    if (keep.length !== list.length) {
      all[gid] = keep;
      changed = true;
    }
  }
  if (changed) store.save('tempRoles');
}

async function onButton(interaction) {
  const [, kind, menuId, roleId] = interaction.customId.split('_');
  const menu = menusOf(interaction.guild.id)[menuId];
  if (!menu) return interaction.reply({ content: '• هاي القائمة انحذفت.', ephemeral: true });
  const member = interaction.member;
  const plus = premium.has(interaction.guild.id, 'roleMenusPlus');
  const temp = plus && menu.tempMinutes > 0 ? menu.tempMinutes : 0;
  const ids = menu.roles.map((r) => r.roleId).filter((id) => interaction.guild.roles.cache.has(id));
  const added = [];
  const removed = [];

  const wanted = kind === 's' ? interaction.values : [roleId];
  const toggle = kind === 'b';
  const hadClicked = toggle && member.roles.cache.has(roleId);
  for (const id of ids) {
    const has = member.roles.cache.has(id);
    const want = wanted.includes(id);
    if (toggle) {
      if (id === roleId) {
        if (has) {
          await member.roles.remove(id).catch(() => {});
          removed.push(id);
        } else {
          await member.roles.add(id).catch(() => {});
          added.push(id);
          if (temp) addTemp(interaction.guild.id, member.id, id, temp);
        }
      } else if (menu.exclusive && has && !hadClicked) {
        await member.roles.remove(id).catch(() => {});
        removed.push(id);
      }
    } else if (want && !has) {
      await member.roles.add(id).catch(() => {});
      added.push(id);
      if (temp) addTemp(interaction.guild.id, member.id, id, temp);
    } else if (!want && has) {
      await member.roles.remove(id).catch(() => {});
      removed.push(id);
    }
  }
  const lines = [];
  if (added.length) lines.push(`${E.success} أخذت: ${added.map((r) => `<@&${r}>`).join(' ')}${temp ? ` (لمدة ${temp >= 60 ? `${Math.round(temp / 60)} ساعة` : `${temp} دقيقة`})` : ''}`);
  if (removed.length) lines.push(`${E.dot} انشالت: ${removed.map((r) => `<@&${r}>`).join(' ')}`);
  return interaction.reply({ content: lines.join('\n') || '• ما تغيّر إشي.', ephemeral: true, allowedMentions: { parse: [] } });
}

function init(client) {
  client.once(Events.ClientReady, () => setInterval(() => sweepTemp(client).catch(() => {}), 60_000).unref());
}

const components = [{ prefix: 'rm_', handle: onButton }];

module.exports = { init, components, menusOf, publish, build, STYLES };
