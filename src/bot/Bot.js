// Watches the chat for "/c ..." messages, handles the built-in commands, and sends everything else
// to Claude. This is the only module that knows about both the chat and Claude.
const { log } = require('../log');
const { shortenPaths, expandPercent } = require('./paths');

class Bot {
  // chat: { skipExisting(), newMessages() -> [{ mid, text }] | null, send(text), wait(ms), screenshot(file) }
  // claude: { run(prompt) -> { ok, code?, text }, reset() }
  constructor({ chat, claude, projectDir, pollMs, trigger, replyPrefix, errorScreenshot }) {
    Object.assign(this, { chat, claude, projectDir, pollMs, trigger, replyPrefix, errorScreenshot });
    this.queue = [];
    this.busy = false;

    // Chat commands answered without calling Claude. Keys are matched case-insensitively.
    this.commands = new Map([
      ['reset', async () => {
        this.claude.reset();
        await this.reply('started a fresh conversation');
      }],
      ['ping', () => this.reply('ping')],
    ]);
  }

  reply(text) {
    return this.chat.send(this.replyPrefix + text);
  }

  async handle(prompt) {
    const command = this.commands.get(prompt.toLowerCase());
    if (command) return command();
    log('Running:', prompt.slice(0, 80));
    const r = await this.claude.run(expandPercent(prompt, this.projectDir));
    const text = r.ok ? r.text : 'error (exit ' + r.code + '): ' + r.text;
    const reply = shortenPaths(text, this.projectDir);
    log('Done, replying (' + reply.length + ' chars)');
    await this.reply(reply);
  }

  // Works through queued prompts one at a time. Safe to call while already running.
  async work() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) await this.handle(this.queue.shift());
    } catch (e) {
      log('Error:', e.message.split('\n')[0]);
      await this.chat.screenshot(this.errorScreenshot);
    } finally {
      this.busy = false;
    }
  }

  async poll() {
    const msgs = await this.chat.newMessages();
    if (!msgs) return; // not in the self-chat right now; leave queued work for the next poll
    for (const m of msgs) {
      const hit = m.text.match(this.trigger);
      if (hit) {
        log('Got /c message', m.mid);
        this.queue.push(hit[1].trim());
      }
    }
    this.work(); // not awaited: keep polling while Claude runs
  }

  async run() {
    // Skip anything already in the chat; only react to new messages.
    await this.chat.skipExisting();
    log('Ready. Send "/c <prompt>" in your (You) chat. Close the browser or press Ctrl+C to stop.');
    for (;;) {
      await this.poll().catch((e) => log('Poll error:', e.message));
      await this.chat.wait(this.pollMs);
    }
  }
}

module.exports = { Bot };
