// shared hierarchy check (not a command file: loader skips files starting with "_")
module.exports = function hierarchy(ctx, target, verb) {
  if (!target) return null;
  if (target.id === ctx.user.id) return `لا يمكنك ${verb} نفسك.`;
  if (target.id === ctx.guild.ownerId) return `لا يمكن ${verb} مالك السيرفر.`;
  if (target.id === ctx.client.user.id) return `لا يمكنني ${verb} نفسي.`;
  if (ctx.user.id !== ctx.guild.ownerId && ctx.member.roles.highest.comparePositionTo(target.roles.highest) <= 0)
    return 'رتبة العضو أعلى من رتبتك أو مساوية لها.';
  if (target.roles.highest.comparePositionTo(ctx.guild.members.me.roles.highest) >= 0) return 'رتبة العضو أعلى من رتبتي.';
  return null;
};
