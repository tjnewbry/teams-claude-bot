// Teams self-chat -> Claude Code bridge.
// Watches ONLY your "(You)" chat in Teams. A message starting with "/c " is sent to Claude Code
// in the project folder; the reply is posted back starting with "c: ".
//
// Usage: node src/index.js [projectDir] [--model claude-opus-5-5] [--effort high]
// In the chat:  /c <prompt>    run a prompt (continues the same conversation)
//               /c reset       start a fresh Claude conversation
//               /c ping        replies "c: ping" (check the bot is alive)

const config = require('./config');
const { log } = require('./log');
const { parseArgs, resolveProjectDir } = require('./startup');
const { findClaude, ClaudeSession } = require('./claude');
const { SelfChat } = require('./teams/SelfChat');
const { Bot } = require('./bot/Bot');

(async () => {
  const opts = parseArgs(process.argv.slice(2), config.claude);
  const projectDir = await resolveProjectDir(opts.dir);

  const exe = findClaude();
  log('Using', exe);
  const claude = new ClaudeSession({ exe, cwd: projectDir, model: opts.model, effort: opts.effort, timeoutMs: config.claude.timeoutMs });

  const chat = new SelfChat({
    profileDir: config.PROFILE_DIR,
    ...config.teams,
    onClose: () => {
      log('Browser closed; exiting');
      process.exit(0);
    },
  });
  await chat.start();
  log(`Project: ${projectDir} | model: ${opts.model} | effort: ${opts.effort}`);

  await new Bot({ chat, claude, projectDir, ...config.bot, errorScreenshot: config.ERROR_SCREENSHOT }).run();
})();
