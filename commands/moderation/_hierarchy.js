// shared hierarchy check (not a command file: loader skips files starting with "_")
module.exports = function hierarchy(ctx, target, verb) {
  if (!target) return null;
  if (target.id === ctx.user.id) return `ما بتقدر تطبّق ${verb} على حالك.`;
  if (target.id === ctx.guild.ownerId) return `ما بتقدر تطبّق ${verb} على مالك السيرفر.`;
  if (target.id === ctx.client.user.id) return `ما بقدر أطبّق ${verb} على حالي.`;
  if (ctx.user.id !== ctx.guild.ownerId && ctx.member.roles.highest.comparePositionTo(target.roles.highest) <= 0)
    return 'رتبة العضو أعلى من رتبتك أو مساوية لها.';
  if (target.roles.highest.comparePositionTo(ctx.guild.members.me.roles.highest) >= 0) return 'رتبة العضو أعلى من رتبتي.';
  return null;
};
