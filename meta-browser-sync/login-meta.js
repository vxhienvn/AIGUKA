const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launchPersistentContext('./session', { headless:false });
  const page = await browser.newPage();
  await page.goto('https://business.facebook.com/latest/inbox', { waitUntil:'domcontentloaded' });
  console.log('Đăng nhập Meta Business Suite, mở Inbox xong thì nhấn Ctrl+C để giữ session.');
})();
