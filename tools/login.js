// Opens the bot's browser so you can sign into Teams once. Close the window when done.
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '..', 'profile'), {
    headless: false,
    viewport: null,
    args: ['--remote-debugging-port=9333'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://teams.microsoft.com/v2/');
  await new Promise((r) => ctx.on('close', r));
})();
