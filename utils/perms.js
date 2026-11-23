const { PermissionFlagsBits } = require('discord.js');
const store = require('./store');

const OWNER_IDS = new Set(
  (process.env.OWNER_IDS || '1392792427051614249,1229657759717523487')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

const isOwner = (id) => OWNER_IDS.has(id);
// main owner: MAIN_OWNER_ID in .env, otherwise the first id in OWNER_IDS
const MAIN_OWNER_ID = (process.env.MAIN_OWNER_ID || [...OWNER_IDS][0] || '').trim();
const isMainOwner = (id) => id === MAIN_OWNER_ID;
const isBotAdmin = (id) => isOwner(id) || store.get('admins').includes(id);

function isBlacklisted(userId, guildId) {
  const bl = store.get('blacklist');
  return bl.users.includes(userId) || (guildId && bl.servers.includes(guildId));
}

/** Manager role configured from the dashboard / settings — grants access to staff commands. */
function hasManagerRole(member) {
  if (!member?.guild) return false;
  const roleId = store.peek('guildSettings', member.guild.id)?.managerRoleId;
  return Boolean(roleId && member.roles.cache.has(roleId));
}

function canManageGuild(member) {
  if (!member) return false;
  return (
    isOwner(member.id) ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    hasManagerRole(member)
  );
}

module.exports = { OWNER_IDS, MAIN_OWNER_ID, isMainOwner, isOwner, isBotAdmin, isBlacklisted, hasManagerRole, canManageGuild };
