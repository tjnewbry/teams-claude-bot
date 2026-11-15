// Path shorthand for chat: % = project folder, ~ = your user folder.
// Outgoing replies have absolute paths shortened; incoming prompts have % expanded.
const path = require('path');

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

module.exports = { pathAliases, shortenPaths, expandPercent };
