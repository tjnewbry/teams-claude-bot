# Teams Claude Bot

A Windows program that lets you run Claude Code on your PC from your Microsoft Teams **(You)** chat, so you can work on a project from anywhere you have Teams open, including your phone.

The bot opens Teams in its own Chromium window and watches only your (You) self-chat. It checks that it's in that chat before every read and send, and never acts in any other chat. A message starting with `/c ` goes to the Claude Code CLI in a project folder you choose, and Claude's reply is posted back starting with `c: `.

## Instructions for Build and Use

Steps to build and/or run the software:

1. Install the Claude desktop app on Windows and sign in. The bot uses the Claude Code CLI that comes with it, so nothing else needs installing.
2. Run `setup.cmd` once. It downloads portable Node into `runtime\`, installs Playwright into `node_modules\`, and installs Playwright's Chromium into `runtime\browsers\`. It's safe to run again; finished steps are skipped.
3. Run `start.cmd [projectDir] [--model claude-opus-5-5] [--effort high]`, or double-click a shortcut to it. If you leave out the project folder, the bot asks for one (right-click to paste). On the first run, sign in to Teams in the window that opens; the sign-in is kept in `profile\`.

Instructions for using the software:

1. Wait for the console to say `Ready.`
2. In your Teams (You) chat, send a message starting with `/c `:

   | Message | What it does |
   | --- | --- |
   | `/c <prompt>` | Runs the prompt with Claude in the project folder (continues the same conversation) |
   | `/c reset` | Starts a fresh Claude conversation (doesn't call Claude) |
   | `/c ping` | Replies `c: ping` (doesn't call Claude; checks that the bot is alive) |

   In prompts, `%/` means the project folder and `~/` means your user folder. Replies shorten paths the same way.
3. To stop the bot, close its browser window or press Ctrl+C in the console.

Claude runs in `auto` permission mode, so it can edit files and run commands in the project folder without asking. Point the bot at a folder you're happy for it to work in.

## Development Environment

To recreate the development environment, you need the following software and/or libraries with the specified versions:

* Windows 10 or later (`curl.exe` and `tar.exe` are built in and used by `setup.cmd`)
* Node.js 22.23.4 (portable copy downloaded by `setup.cmd`)
* Playwright 1.56.1 with its Chromium build 1194
* Claude Code CLI 2.1.325, bundled with the Claude desktop app under `%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc\claude-code\`
* Microsoft Teams on the web (`teams.cloud.microsoft`)

Run the tests with the portable runtime:

```
runtime\node-v22.23.4-win-x64\node.exe --test test/*.test.js
```

## Useful Websites to Learn More

I found these websites useful in developing this software:

* [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
* [Running Claude Code headless](https://code.claude.com/docs/en/headless)
* [Playwright BrowserType (launchPersistentContext)](https://playwright.dev/docs/api/class-browsertype)
* [Node.js child_process](https://nodejs.org/api/child_process.html)
* [Node.js test runner](https://nodejs.org/api/test.html)
* [Microsoft Teams documentation](https://learn.microsoft.com/en-us/microsoftteams/)

## Future Work

The following items I plan to fix, improve, and/or add to this project in the future:

* [x] Restore the last working build and fix the Claude CLI path after the desktop app moved it
* [x] Split the code into separate Claude, Teams and bot modules, with tests for the bot
* [ ] Cancel a running Claude job from the chat
* [ ] A `/c status` command that shows the project folder, model and whether a job is running
* [ ] Switch the project folder from the chat
* [ ] Automated tests for the Teams side
* [ ] A demo video and screenshots for this README

## History

The bot started as a single `bot.js`. After the Claude desktop app moved its CLI to a new folder on Oct 30, 2026, the bot stopped answering in Teams, and later rewrites didn't recover it. It was rolled back to the Oct 27 build that worked, with one fix so it finds the CLI in the new folder. That build is tagged [`last-working-version`](../../tree/last-working-version). It was then split into the modules below, with no change in behavior.

## Layout

The code is split into three parts that only meet in `src/index.js`:

```
src/
  index.js              entry point: wires the parts together and starts the bot
  config.js             settings (Teams URL, poll interval, default model, file locations)
  startup.js            command-line arguments and the project-folder prompt
  log.js                console + bot.log logging
  claude/               Claude Code, knows nothing about Teams
    findClaude.js         finds the CLI bundled with the Claude desktop app
    ClaudeSession.js      runs prompts in one ongoing conversation (run, reset)
  teams/                Teams, knows nothing about Claude
    SelfChat.js           browser, self-chat lock checks, reading new messages, sending
    pageScripts.js        code that runs inside the Teams page
  bot/                  the only part that knows about both
    Bot.js                watches for /c messages, built-in commands, queue, replies
    paths.js              %/ and ~/ path shorthand
test/
  bot.test.js           bot tests with a fake chat and a fake Claude
tools/
  login.js              opens the bot's browser profile to sign in to Teams by hand
  inspect.js            dev helper: runs a JS file in the open Teams page over CDP (port 9333)
start.cmd               starts the bot with the portable runtime
setup.cmd               creates runtime\ and node_modules\
```

To add a chat command, add an entry to `this.commands` in `src/bot/Bot.js`.

These are created locally and not committed:

| Path | What it holds |
| --- | --- |
| `profile\` | Signed-in Teams browser profile (private) |
| `runtime\` | Portable Node and Playwright browsers |
| `node_modules\` | Installed packages |
| `bot.log` | The bot's log |
| `last-error.png` | Screenshot from the last send error |
