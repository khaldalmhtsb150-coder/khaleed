// Dashboard API for per-server command shortcuts.
const aliases = require('../utils/aliases');
const registry = require('../utils/commands');
const botlog = require('../utils/botlog');

module.exports = function registerAliasRoutes(app, { needGuild, csrf }) {
  app.get('/api/aliases/:id', needGuild, (req, res) => {
    res.json({ max: aliases.MAX_PER_COMMAND, aliases: aliases.ofGuild(req.guild.id) });
  });

  app.post('/api/aliases/:id', needGuild, csrf, (req, res) => {
    const cmd = registry.commands.get(String(req.body.name || ''));
    if (!cmd || cmd.category === 'owner') return res.status(400).json({ error: 'أمر غير موجود' });
    const result = aliases.setFor(req.guild.id, cmd.name, req.body.aliases, registry.lookup);
    if (result.error) return res.status(400).json({ error: result.error });
    botlog.log('dashboard', `عدّل اختصارات /${cmd.name}: ${result.aliases.join('، ') || 'بدون'}`, {
      user: { id: req.session.user.id, name: req.session.user.globalName || req.session.user.username },
      guild: req.guild,
    });
    res.json(result);
  });
};
