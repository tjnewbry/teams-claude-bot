// Settings shared by every module. Paths are relative to the repo root.
const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT,
  LOG_FILE: path.join(ROOT, 'bot.log'),
  ERROR_SCREENSHOT: path.join(ROOT, 'last-error.png'),
  PROFILE_DIR: path.join(ROOT, 'profile'), // signed-in Teams browser profile

  teams: {
    url: 'https://teams.cloud.microsoft/',
    selfChatId: '48:notes', // the "(You)" chat
    chunkSize: 3500, // longest single message the bot sends
  },

  bot: {
    pollMs: 5000,
    trigger: /^\/c\s+([\s\S]+)$/, // a chat message matching this is handled by the bot
    replyPrefix: 'c: ',
  },

  claude: {
    model: 'claude-opus-5-5',
    effort: 'high',
    timeoutMs: 30 * 60 * 1000,
  },
};
