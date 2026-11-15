// One ongoing Claude Code conversation in a project folder, driven through the CLI in print mode.
// Knows nothing about Teams: give it a prompt, get back the reply text.
const crypto = require('crypto');
const { spawn } = require('child_process');
const { log } = require('../log');

class ClaudeSession {
  constructor({ exe, cwd, model, effort, timeoutMs }) {
    Object.assign(this, { exe, cwd, model, effort, timeoutMs });
    this.sessionId = null;
  }

  // The next prompt starts a fresh conversation.
  reset() {
    this.sessionId = null;
  }

  // Resolves to { ok: true, text } or { ok: false, code, text }. Never rejects.
  run(prompt) {
    const args = ['-p', '--model', this.model, '--effort', this.effort, '--permission-mode', 'auto',
      '--permission-prompts', 'none', '--output-format', 'text'];
    const fresh = !this.sessionId;
    if (fresh) this.sessionId = crypto.randomUUID();
    args.push(fresh ? '--session-id' : '--resume', this.sessionId);
    return new Promise((resolve) => {
      const p = spawn(this.exe, args, { cwd: this.cwd, windowsHide: true });
      let out = '';
      let err = '';
      // On timeout, kill Claude and everything it started (/T = whole process tree).
      const t = setTimeout(() => {
        log('Job timed out; killing it');
        spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true });
      }, this.timeoutMs);
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
          if (code === 0) return resolve({ ok: true, text: out.trim() || '(no output)' });
          // A failed first run never created the session, so don't try to resume it next time.
          if (fresh) this.sessionId = null;
          resolve({ ok: false, code, text: (err.trim() || out.trim()).slice(-1500) });
        }, 1000);
      });
      p.stdin.end(prompt);
    });
  }
}

module.exports = { ClaudeSession };
