// Logs to the console and appends to bot.log.
const fs = require('fs');
const { LOG_FILE } = require('./config');

function log(...a) {
  const line = [new Date().toLocaleTimeString(), ...a].join(' ');
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, new Date().toLocaleDateString() + ' ' + line + '\n');
  } catch {}
}

module.exports = { log };
