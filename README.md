# teams-claude-bot

Runs Claude Code on this PC from your Microsoft Teams **(You)** chat, so you can work on a project with only Teams open.

The bot opens Teams in its own Chromium window and watches only your (You) self-chat. It checks that it's in that chat before every read and send, and never acts in any other chat. A message starting with `/c ` goes to the Claude Code CLI in the project folder, and the reply is posted back starting with `c: `.

## Chat commands

| Message | What it does |
| --- | --- |
| `/c <prompt>` | Runs the prompt in the project folder (continues the same Claude conversation) |
| `/c reset` | Starts a fresh Claude conversation |
| `/c ping` | Replies `c: ping` without calling Claude (checks that the bot is alive) |

In prompts, `%/` means the project folder and `~/` means your user folder. Replies shorten paths the same way.

## Requirements

- Windows 10 or later (`curl.exe` and `tar.exe` are built in)
- Claude Code installed with the Claude desktop app and signed in. The bot finds `claude.exe` under `%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc\claude-code\`, or under the older install locations.

## Setup (once)

```
setup.cmd
```

This downloads portable Node into `runtime\`, installs Playwright into `node_modules\`, and installs Playwright's Chromium into `runtime\browsers\`.

## Start

```
start.cmd [projectDir] [--model claude-opus-5-5] [--effort high]
```

If you leave out the project folder, the bot asks for one. To paste a path, right-click. On the first run, sign in to Teams in the window that opens. The sign-in is kept in `profile\`.

The default model is `claude-opus-5-5` at effort `high`. To stop the bot, close the bot's browser window or press Ctrl+C.

## Layout

```
src/bot.js         the bot
tools/login.js     opens the bot's browser profile to sign in to Teams by hand
tools/inspect.js   dev helper: runs a JS file in the open Teams page over CDP (port 9333)
start.cmd          starts the bot with the portable runtime
setup.cmd          creates runtime\ and node_modules\
```

These are created locally and not committed:

| Path | What it holds |
| --- | --- |
| `profile\` | Signed-in Teams browser profile (private) |
| `runtime\` | Portable Node and Playwright browsers |
| `node_modules\` | Installed packages |
| `bot.log` | The bot's log |
| `last-error.png` | Screenshot from the last send error |
