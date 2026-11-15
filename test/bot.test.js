// Tests the bot core with a fake chat and a fake Claude, so no browser or Claude CLI is needed.
// Run: npm test   (or: node --test test/*.test.js)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { Bot } = require('../src/bot/Bot');

const PROJECT = 'C:\\Users\\me\\proj';
process.env.USERPROFILE = 'C:\\Users\\me';

function fakeChat(incoming = []) {
  return {
    sent: [],
    inbox: [...incoming],
    verified: true,
    async skipExisting() {},
    async newMessages() {
      if (!this.verified) return null;
      const m = this.inbox;
      this.inbox = [];
      return m;
    },
    async send(text) {
      this.sent.push(text);
    },
    async wait() {},
    async screenshot() {},
  };
}

function fakeClaude(reply = { ok: true, text: 'done' }) {
  return {
    prompts: [],
    resets: 0,
    async run(p) {
      this.prompts.push(p);
      return typeof reply === 'function' ? reply(p) : reply;
    },
    reset() {
      this.resets++;
    },
  };
}

function makeBot(chat, claude) {
  return new Bot({
    chat, claude, projectDir: PROJECT, pollMs: 0, trigger: /^\/c\s+([\s\S]+)$/, replyPrefix: 'c: ',
    errorScreenshot: path.join(require('os').tmpdir(), 'unused.png'),
  });
}

async function pollAndDrain(bot) {
  await bot.poll();
  while (bot.busy) await new Promise((r) => setImmediate(r));
}

test('ping and reset are answered without calling Claude', async () => {
  const chat = fakeChat([{ mid: 1, text: '/c ping' }, { mid: 2, text: '/c RESET' }]);
  const claude = fakeClaude();
  await pollAndDrain(makeBot(chat, claude));
  assert.deepStrictEqual(chat.sent, ['c: ping', 'c: started a fresh conversation']);
  assert.strictEqual(claude.prompts.length, 0);
  assert.strictEqual(claude.resets, 1);
});

test('only /c messages are handled', async () => {
  const chat = fakeChat([{ mid: 1, text: 'hello' }, { mid: 2, text: 'c: an old reply' }, { mid: 3, text: '/c  fix it ' }]);
  const claude = fakeClaude();
  await pollAndDrain(makeBot(chat, claude));
  assert.deepStrictEqual(claude.prompts, ['fix it']);
  assert.deepStrictEqual(chat.sent, ['c: done']);
});

test('names like "constructor" go to Claude, not to a command', async () => {
  const chat = fakeChat([{ mid: 1, text: '/c constructor' }]);
  const claude = fakeClaude();
  await pollAndDrain(makeBot(chat, claude));
  assert.deepStrictEqual(claude.prompts, ['constructor']);
});

test('%/ is expanded in prompts and the project path is shortened in replies', async () => {
  const chat = fakeChat([{ mid: 1, text: '/c read %/notes.txt' }]);
  const claude = fakeClaude({ ok: true, text: 'Read C:\\Users\\me\\proj\\notes.txt and C:\\Users\\me\\other.txt' });
  await pollAndDrain(makeBot(chat, claude));
  assert.deepStrictEqual(claude.prompts, ['read C:\\Users\\me\\proj/notes.txt']);
  assert.deepStrictEqual(chat.sent, ['c: Read %/notes.txt and ~/other.txt']);
});

test('Claude failures are reported in the chat', async () => {
  const chat = fakeChat([{ mid: 1, text: '/c go' }]);
  await pollAndDrain(makeBot(chat, fakeClaude({ ok: false, code: 1, text: 'boom' })));
  assert.deepStrictEqual(chat.sent, ['c: error (exit 1): boom']);
});

test('nothing is read or run while the self-chat lock check fails', async () => {
  const chat = fakeChat([{ mid: 1, text: '/c go' }]);
  chat.verified = false;
  const claude = fakeClaude();
  const bot = makeBot(chat, claude);
  await pollAndDrain(bot);
  assert.strictEqual(claude.prompts.length, 0);
  chat.verified = true;
  await pollAndDrain(bot);
  assert.deepStrictEqual(claude.prompts, ['go']);
});

test('a send failure stops the queue without crashing the bot', async () => {
  const chat = fakeChat([{ mid: 1, text: '/c ping' }]);
  chat.send = async () => {
    throw new Error('refusing to send: not in self-chat');
  };
  const bot = makeBot(chat, fakeClaude());
  await pollAndDrain(bot);
  assert.strictEqual(bot.busy, false);
});
