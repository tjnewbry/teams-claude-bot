// Command-line arguments and the project folder prompt.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs(argv, defaults) {
  const out = { dir: null, model: defaults.model, effort: defaults.effort };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--model') out.model = argv[++i];
    else if (argv[i] === '--effort') out.effort = argv[++i];
    else if (!out.dir) out.dir = argv[i];
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

// Asks for the folder if it wasn't given, accepts a file path as "its folder", and offers to create a
// missing one. Exits the process if the user declines.
async function resolveProjectDir(dir) {
  while (!dir) dir = await ask('Project folder for Claude to work in (right-click to paste): ');
  dir = cleanPath(dir);
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir);
  if (!fs.existsSync(dir)) {
    const yn = await ask(`${dir} doesn't exist. Create it? (y/n) `);
    if (!/^y/i.test(yn)) process.exit(1);
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

module.exports = { parseArgs, ask, cleanPath, resolveProjectDir };
