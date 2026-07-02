require('dotenv').config();
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext('./session', { headless: false, viewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();
  await page.goto(process.env.META_BUSINESS_INBOX_URL || 'https://business.facebook.com/latest/inbox/all', { waitUntil: 'domcontentloaded' });
  console.log('Đăng nhập Meta Business Suite trong trình duyệt vừa mở. Khi vào được Inbox, quay lại terminal và bấm Enter.');
  process.stdin.resume();
  process.stdin.once('data', async () => { await browser.close(); process.exit(0); });
})();
