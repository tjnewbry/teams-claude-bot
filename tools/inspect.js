// Dev helper: connect to the running login.js browser and run a JS expression in the Teams page.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const page = b.contexts()[0].pages().find((p) => /^https:\/\/teams\.(cloud\.microsoft|microsoft\.com)\//.test(p.url()));
  const fn = new Function(require('fs').readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(await page.evaluate(fn), null, 1));
  await b.close().catch(() => {});
  process.exit(0);
})();
