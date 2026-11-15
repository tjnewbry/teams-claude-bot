// Locates the Claude Code CLI that ships with the Claude desktop app.
const fs = require('fs');
const path = require('path');

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

module.exports = { findClaude };
