// Your Teams "(You)" chat, driven in a Chromium window with a persistent signed-in profile.
// Knows nothing about Claude or commands: it reads new messages and sends text, and refuses to do
// either unless the open chat is provably your self-chat.
const { chromium } = require('playwright');
const { log } = require('../log');
const { selfChatCheck, readMessages } = require('./pageScripts');

class SelfChat {
  constructor({ profileDir, url, selfChatId, chunkSize, onClose }) {
    Object.assign(this, { profileDir, url, selfChatId, chunkSize, onClose });
    this.page = null;
    this.lastMid = 0;
  }

  // Opens Teams, waits for sign-in, and returns once the self-chat is open and verified.
  async start() {
    const ctx = await chromium.launchPersistentContext(this.profileDir, {
      headless: false,
      viewport: null,
      // Set TEAMS_BOT_DEBUG=1 to open a local-only port so tools/inspect.js can look at the page.
      args: process.env.TEAMS_BOT_DEBUG ? ['--remote-debugging-port=9333'] : [],
    });
    this.page = ctx.pages()[0] || (await ctx.newPage());
    ctx.on('close', () => this.onClose && this.onClose());
    await this.page.goto(this.url);
    log('Waiting for Teams to load (sign in in the window if asked)...');
    await this.page.waitForSelector('[data-tid="app-bar-wrapper"]', { timeout: 0 });
    log('Opening Chat tab and self-chat');
    await this.open();
    while (!(await this.ensure())) await this.wait(10000);
  }

  wait(ms) {
    return this.page.waitForTimeout(ms);
  }

  async verify() {
    return this.page.evaluate(selfChatCheck, this.selfChatId).catch((e) => ({ ok: false, reason: e.message }));
  }

  // Only ever navigates to the Chat tab and then the self-chat. Never anywhere else.
  async open() {
    const chatTab = this.page.locator('[data-tid="app-bar-wrapper"] button[aria-label^="Chat"]').first();
    await chatTab.click({ timeout: 10000 }).catch((e) => log('Could not click Chat tab:', e.message.split('\n')[0]));
    const item = this.page.locator(`[role="treeitem"][data-item-type="chat"][data-fui-tree-item-value$="|${this.selfChatId}"]`);
    await item.first().click({ timeout: 15000 }).catch((e) => log('Could not click self-chat:', e.message.split('\n')[0]));
    await this.page.waitForSelector('[data-tid="chat-title"] [data-person-mri]', { timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1000);
  }

  // True if the self-chat is open (reopening it once if not).
  async ensure() {
    let r = await this.verify();
    if (r.ok) return true;
    log('Lock check failed (' + r.reason + '); reopening self-chat');
    await this.open();
    r = await this.verify();
    if (!r.ok) log('Still not in self-chat (' + r.reason + '); pausing');
    return r.ok;
  }

  // Marks everything already in the chat as seen, so only later messages are returned.
  async skipExisting() {
    const existing = await this.page.evaluate(readMessages);
    this.lastMid = existing.reduce((m, x) => Math.max(m, x.mid), 0);
  }

  // Messages that arrived since the last call, oldest first, or null if the self-chat can't be verified.
  async newMessages() {
    if (!(await this.ensure())) return null;
    const fresh = [];
    for (const m of await this.page.evaluate(readMessages)) {
      if (m.mid <= this.lastMid) continue;
      this.lastMid = m.mid;
      fresh.push(m);
    }
    return fresh;
  }

  // Sends text, split into chunks. Re-checks the lock before typing and again before clicking send.
  async send(text) {
    for (let i = 0; i < text.length; i += this.chunkSize) {
      const part = text.slice(i, i + this.chunkSize);
      if (!(await this.ensure())) throw new Error('refusing to send: not in self-chat');
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
      if (!(await this.ensure())) {
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

  async screenshot(file) {
    await this.page.screenshot({ path: file }).catch(() => {});
  }
}

module.exports = { SelfChat };
