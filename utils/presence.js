const { ActivityType } = require('discord.js');
const store = require('./store');

const TYPES = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
  Custom: ActivityType.Custom, // speech-bubble status, e.g. "/help — site"
};

function applyPresence(client) {
  if (!client.user) return;
  const s = store.get('botSettings');
  client.user.setPresence({
    activities: [
      s.activityType === 'Custom'
        ? { name: 'Custom Status', state: s.status || '/help', type: ActivityType.Custom }
        : { name: s.status || '/help', type: TYPES[s.activityType] ?? ActivityType.Watching },
    ],
    status: s.presence || 'online',
  });
}

module.exports = { applyPresence, TYPES };
