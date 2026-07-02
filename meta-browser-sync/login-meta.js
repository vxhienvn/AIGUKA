import 'dotenv/config';
import { chromium } from 'playwright';

const browser = await chromium.launchPersistentContext('./session/meta', {
  headless: false,
  slowMo: Number(process.env.META_SYNC_SLOWMO_MS || 120)
});
const page = await browser.newPage();
await page.goto(process.env.META_BUSINESS_INBOX_URL || 'https://business.facebook.com/latest/inbox/all');
console.log('Đăng nhập Meta trong cửa sổ vừa mở. Sau khi Inbox hiện đầy đủ, quay lại terminal và nhấn Enter.');
process.stdin.resume();
process.stdin.once('data', async () => {
  await browser.close();
  process.exit(0);
});
