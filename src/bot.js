// Teams self-chat -> Claude Code bridge.
// Watches ONLY your "(You)" chat in Teams. A message starting with "/c " is sent to Claude Code
// in the project folder; the reply is posted back starting with "c: ".
//
// Usage: node src/bot.js [projectDir] [--model claude-opus-5-5] [--effort high]
// In the chat:  /c <prompt>    run a prompt (continues the same conversation)
//               /c reset       start a fresh Claude conversation
//               /c ping        replies "c: ping" (check the bot is alive)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const TEAMS_URL = 'https://teams.cloud.microsoft/';
const SELF_CHAT_ID = '48:notes';
const POLL_MS = 5000;
const CHUNK = 3500;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

const ROOT = path.join(__dirname, '..'); // repo root: bot.log, last-error.png and profile live here
const LOG_FILE = path.join(ROOT, 'bot.log');

function log(...a) {
  const line = [new Date().toLocaleTimeString(), ...a].join(' ');
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, new Date().toLocaleDateString() + ' ' + line + '\n');
  } catch {}
}

function parseArgs() {
  const out = { dir: null, model: 'claude-opus-5-5', effort: 'high' };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--model') out.model = a[++i];
    else if (a[i] === '--effort') out.effort = a[++i];
    else if (!out.dir) out.dir = a[i];
  }
  return out;
}

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise((r) => rl.question(q, r));
  rl.close();
  return ans.trim();
}

// Accepts paths the way they get pasted: "Copy as path" quotes, file:/// URLs, %VARS%, ~, forward slashes.
function cleanPath(p) {
  p = p.trim().replace(/^['"](.*)['"]$/, '$1').trim();
  if (/^file:\/\//i.test(p)) p = decodeURIComponent(p.replace(/^file:\/\/\/?/i, ''));
  p = p.replace(/%([^%]+)%/g, (m, v) => process.env[v] ?? m);
  if (p === '~' || /^~[\\/]/.test(p)) p = path.join(process.env.USERPROFILE, p.slice(1));
  return path.resolve(p.replace(/\//g, '\\'));
}

// The desktop app keeps versioned copies of the Claude Code CLI; use the newest. It's a Store app, so
// outside the app its AppData is redirected into the package's LocalCache folder.
function findClaude() {
  const roots = [
    path.join(process.env.LOCALAPPDATA, 'Claude-Data', 'claude_pzs8sxrjxfjjc', 'claude-code'),
    path.join(process.env.LOCALAPPDATA, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude', 'claude-code'),
    path.join(process.env.APPDATA, 'Claude', 'claude-code'),
  ];
  const root = roots.find((r) => fs.existsSync(r)) || roots[0];
  const cmp = (x, y) => {
    const p = (s) => s.split('.').map(Number);
    const [a, b] = [p(x), p(y)];
    for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
    return 0;
  };
  const versions = fs.existsSync(root) ? fs.readdirSync(root).filter((v) => /^\d+(\.\d+)*$/.test(v)).sort(cmp).reverse() : [];
  for (const v of versions) {
    for (const h of fs.readdirSync(path.join(root, v))) {
      const exe = path.join(root, v, h, 'claude.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  throw new Error('Could not find claude.exe under ' + root);
}

// Runs in the page. Returns { ok, reason } — ok only if the open chat is provably your self-chat.
function selfChatCheck(selfChatId) {
  const fail = (reason) => ({ ok: false, reason });
  const listItem = [...document.querySelectorAll('[role="treeitem"][data-item-type="chat"]')].find((e) =>
    (e.getAttribute('data-fui-tree-item-value') || '').endsWith('|' + selfChatId)
  );
  if (!listItem) return fail('self-chat not found in chat list');
  // Your user id is embedded in the self-chat's list entry: "...~<tenant>~<userId>~...".
  const m = listItem.getAttribute('data-fui-tree-item-value').match(/~([0-9a-f-]{36})~/i);
  if (!m) return fail('could not read your user id');
  const myMri = '8:orgid:' + m[1];

  if (!/\(You\)/.test(document.title)) return fail('window title is not the (You) chat: ' + document.title);
  const header = document.querySelector('[data-tid="chat-title"]');
  if (!header) return fail('no chat header');
  const people = [...header.querySelectorAll('[data-person-mri]')];
  if (people.length !== 1) return fail('chat header has ' + people.length + ' participants');
  if (people[0].getAttribute('data-person-mri') !== myMri) return fail('header participant is not you');
  const name = people[0].textContent.trim();
  if (!name.endsWith('(You)')) return fail('header name does not end with (You)');

  const myName = name.replace(/\s*\(You\)$/, '');
  const authors = [...document.querySelectorAll('[data-tid="message-author-name"]')].map((e) => e.textContent.trim());
  const stranger = authors.find((a) => a !== myName);
  if (stranger) return fail('message from someone else visible: ' + stranger);
  return { ok: true, myName };
}

// Path shorthand for chat: % = project folder, ~ = your user folder.
// Outgoing replies have absolute paths shortened; incoming prompts have % expanded.
function pathAliases(projectDir) {
  const home = path.resolve(process.env.USERPROFILE);
  const under = (p, root) => p.toLowerCase() === root.toLowerCase() || p.toLowerCase().startsWith(root.toLowerCase().replace(/\\?$/, '\\'));
  const aliases = [[projectDir, '%'], [home, '~']];
  // Folders above the project become %/.. — unless they're inside your user folder, where ~ reads better.
  let up = '%';
  for (let d = path.dirname(projectDir); d !== path.dirname(d); d = path.dirname(d)) {
    up += '/..';
    if (!under(d, home)) aliases.push([d, up]);
  }
  return aliases.sort((a, b) => b[0].length - a[0].length);
}

function shortenPaths(text, projectDir) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [dir, alias] of pathAliases(projectDir)) {
    // Match the folder with either slash style, followed by a separator or the end of the path.
    const pat = esc(dir.replace(/\\$/, '')).replace(/\\\\/g, '[\\\\/]');
    // A "." only ends the path when it's punctuation ("…\vibe."), not part of a name ("…\vibe.bak").
    text = text.replace(new RegExp(pat + '(?=[\\\\/]|\\.(?![\\w-])|[^\\w.-]|$)', 'gi'), '\u0000' + alias);
  }
  // Use forward slashes in whatever follows an alias. A quoted path runs to its closing quote, spaces and all.
  // A bare folder ("%", "~", "%/..") gets a trailing slash so aliases always read as %/ or ~/.
  const fwd = (p) => p.replace(/\\/g, '/').replace(/^([%~](?:\/\.\.)*)([.,;:!?)]?)$/, '$1/$2');
  return text
    .replace(/(["'`])\u0000([%~][^"'`\n]*)(?=\1)/g, (m, q, p) => q + fwd(p))
    .replace(/\u0000([%~][^\s"'`<>|]*)/g, (m, p) => fwd(p));
}

// Only "%/" (or "%\") at the start of a word means the project folder; a lone % is left alone.
function expandPercent(text, projectDir) {
  return text.replace(/(^|[\s"'`(])%(?=[\\/])/g, (m, pre) => pre + projectDir);
}

function readMessages() {
  return [...document.querySelectorAll('[data-tid="chat-pane-message"][data-mid]')].map((e) => {
    const content = e.querySelector('[data-message-content]');
    // innerText keeps the line breaks between <p> paragraphs.
    return { mid: Number(e.getAttribute('data-mid')), text: content ? content.innerText.trim() : '' };
  });
}

class Bot {
  constructor(opts) {
    Object.assign(this, opts);
    this.sessionId = null;
    this.lastMid = 0;
    this.queue = [];
    this.busy = false;
  }

  async verify() {
    const r = await this.page.evaluate(selfChatCheck, SELF_CHAT_ID).catch((e) => ({ ok: false, reason: e.message }));
    return r;
  }

  // Only ever navigates to the Chat tab and then the self-chat. Never anywhere else.
  async openSelfChat() {
    const chatTab = this.page.locator('[data-tid="app-bar-wrapper"] button[aria-label^="Chat"]').first();
    await chatTab.click({ timeout: 10000 }).catch((e) => log('Could not click Chat tab:', e.message.split('\n')[0]));
    const item = this.page.locator(`[role="treeitem"][data-item-type="chat"][data-fui-tree-item-value$="|${SELF_CHAT_ID}"]`);
    await item.first().click({ timeout: 15000 }).catch((e) => log('Could not click self-chat:', e.message.split('\n')[0]));
    await this.page.waitForSelector('[data-tid="chat-title"] [data-person-mri]', { timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1000);
  }

  async ensureSelfChat() {
    let r = await this.verify();
    if (r.ok) return true;
    log('Lock check failed (' + r.reason + '); reopening self-chat');
    await this.openSelfChat();
    r = await this.verify();
    if (!r.ok) log('Still not in self-chat (' + r.reason + '); pausing');
    return r.ok;
  }

  async send(text) {
    for (let i = 0; i < text.length; i += CHUNK) {
      const part = text.slice(i, i + CHUNK);
      // Re-check right before every message goes out.
      if (!(await this.ensureSelfChat())) throw new Error('refusing to send: not in self-chat');
      const editor = this.page.locator('[data-tid="ckeditor"]');
      log('Sending', part.length, 'chars');
      await editor.click({ timeout: 10000 });
      await this.page.keyboard.press('Control+A');
      await this.page.keyboard.press('Delete');
      const lines = part.split('\n');
      for (let j = 0; j < lines.length; j++) {
        if (lines[j]) await this.page.keyboard.insertText(lines[j]);
        if (j < lines.length - 1) await this.page.keyboard.press('Shift+Enter');
      }
      if (!(await this.ensureSelfChat())) {
        await this.page.keyboard.press('Control+A');
        await this.page.keyboard.press('Delete');
        throw new Error('refusing to send: chat changed while typing');
      }
      log('Clicking send');
      // Teams renames this button between states (sendMessageCommands-send / newMessageCommands-send).
      await this.page.locator('[data-tid$="MessageCommands-send"]:visible').first().click({ timeout: 10000 });
      await this.page.waitForTimeout(1500);
    }
  }

  runClaude(prompt) {
    const args = ['-p', '--model', this.model, '--effort', this.effort, '--permission-mode', 'auto',
      '--permission-prompts', 'none', '--output-format', 'text'];
    const fresh = !this.sessionId;
    if (fresh) this.sessionId = crypto.randomUUID();
    args.push(fresh ? '--session-id' : '--resume', this.sessionId);
    return new Promise((resolve) => {
      const p = spawn(this.claude, args, { cwd: this.dir, windowsHide: true });
      let out = '';
      let err = '';
      // On timeout, kill Claude and everything it started (/T = whole process tree).
      const t = setTimeout(() => {
        log('Job timed out; killing it');
        spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true });
      }, JOB_TIMEOUT_MS);
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      // Finish on 'exit', not 'close': background processes Claude's tools leave behind (e.g. git's
      // auto-maintenance after a clone) can hold the output pipes open long after Claude is done.
      p.on('exit', (code) => {
        clearTimeout(t);
        // Give buffered output a moment to arrive, then stop waiting on the pipes.
        setTimeout(() => {
          p.stdout.destroy();
          p.stderr.destroy();
          if (code === 0) return resolve(out.trim() || '(no output)');
          // A failed first run never created the session, so don't try to resume it next time.
          if (fresh) this.sessionId = null;
          resolve('error (exit ' + code + '): ' + (err.trim() || out.trim()).slice(-1500));
        }, 1000);
      });
      p.stdin.end(prompt);
    });
  }

  async work() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const prompt = this.queue.shift();
        if (/^reset$/i.test(prompt)) {
          this.sessionId = null;
          await this.send('c: started a fresh conversation');
          continue;
        }
        if (/^ping$/i.test(prompt)) {
          await this.send('c: ping');
          continue;
        }
        log('Running:', prompt.slice(0, 80));
        const reply = shortenPaths(await this.runClaude(expandPercent(prompt, this.dir)), this.dir);
        log('Done, replying (' + reply.length + ' chars)');
        await this.send('c: ' + reply);
      }
    } catch (e) {
      log('Error:', e.message.split('\n')[0]);
      await this.page.screenshot({ path: path.join(ROOT, 'last-error.png') }).catch(() => {});
    } finally {
      this.busy = false;
    }
  }

  async poll() {
    if (!(await this.ensureSelfChat())) return;
    const msgs = await this.page.evaluate(readMessages);
    for (const m of msgs) {
      if (m.mid <= this.lastMid) continue;
      this.lastMid = m.mid;
      const hit = m.text.match(/^\/c\s+([\s\S]+)$/);
      if (hit) {
        log('Got /c message', m.mid);
        this.queue.push(hit[1].trim());
      }
    }
    this.work();
  }

  async start() {
    const ctx = await chromium.launchPersistentContext(path.join(ROOT, 'profile'), {
      headless: false,
      viewport: null,
      // Set TEAMS_BOT_DEBUG=1 to open a local-only port so inspect.js can look at the page.
      args: process.env.TEAMS_BOT_DEBUG ? ['--remote-debugging-port=9333'] : [],
    });
    this.page = ctx.pages()[0] || (await ctx.newPage());
    ctx.on('close', () => {
      log('Browser closed; exiting');
      process.exit(0);
    });
    await this.page.goto(TEAMS_URL);
    log('Waiting for Teams to load (sign in in the window if asked)...');
    await this.page.waitForSelector('[data-tid="app-bar-wrapper"]', { timeout: 0 });
    log('Opening Chat tab and self-chat');
    await this.openSelfChat();
    while (!(await this.ensureSelfChat())) await this.page.waitForTimeout(10000);
    // Skip anything already in the chat; only react to new messages.
    const existing = await this.page.evaluate(readMessages);
    this.lastMid = existing.reduce((m, x) => Math.max(m, x.mid), 0);
    log(`Ready. Project: ${this.dir} | model: ${this.model} | effort: ${this.effort}`);
    log('Send "/c <prompt>" in your (You) chat. Close the browser or press Ctrl+C to stop.');
    for (;;) {
      await this.poll().catch((e) => log('Poll error:', e.message));
      await this.page.waitForTimeout(POLL_MS);
    }
  }
}

(async () => {
  const opts = parseArgs();
  while (!opts.dir) opts.dir = await ask('Project folder for Claude to work in (right-click to paste): ');
  opts.dir = cleanPath(opts.dir);
  // A pasted file path means "work in the folder this file is in".
  if (fs.existsSync(opts.dir) && fs.statSync(opts.dir).isFile()) opts.dir = path.dirname(opts.dir);
  if (!fs.existsSync(opts.dir)) {
    const yn = await ask(`${opts.dir} doesn't exist. Create it? (y/n) `);
    if (!/^y/i.test(yn)) process.exit(1);
    fs.mkdirSync(opts.dir, { recursive: true });
  }
  opts.claude = findClaude();
  log('Using', opts.claude);
  await new Bot(opts).start();
})();
