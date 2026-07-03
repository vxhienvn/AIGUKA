'use strict';

/*
 AIGUKA LT-05 Identity Collector
 - Chạy trên máy/Codespace có trình duyệt.
 - Người dùng đăng nhập Meta Business Suite thủ công.
 - Script quét các hội thoại đang nhìn thấy trong Inbox/Comment tab.
 - Chỉ lấy identity: customer_name, sender/profile id nếu tìm được, ad_id, ad_name, page/account.
 - Không lấy/đếm SĐT từ Meta. SĐT thật vẫn do Lead Tracker lọc từ bảng messages.
*/

const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = (process.env.AIGUKA_BASE_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const START_URL = process.env.META_BUSINESS_INBOX_URL || 'https://business.facebook.com/latest/inbox/all';
const LIMIT = Math.max(1, Math.min(parseInt(process.env.META_IDENTITY_LIMIT || '80', 10) || 80, 300));
const HEADLESS = String(process.env.META_SYNC_HEADLESS || 'false').toLowerCase() === 'true';
const SESSION_DIR = process.env.META_IDENTITY_SESSION_DIR || path.join(__dirname, 'session');
const LOGIN_ONLY = process.argv.includes('--login-only');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function pick(regex, text, group = 1) { const m = String(text || '').match(regex); return m ? clean(m[group]) : null; }

function parseAdIdentity(text) {
  const adId = pick(/ID\s*quảng\s*cáo\s*[:#]?\s*(\d{8,})/i, text)
    || pick(/Ad\s*ID\s*[:#]?\s*(\d{8,})/i, text)
    || pick(/ad_id["'\s:=]+(\d{8,})/i, text);

  let adName = null;
  const lines = String(text || '').split('\n').map(clean).filter(Boolean);
  const idx = lines.findIndex(l => /ID\s*quảng\s*cáo/i.test(l) || /Chi tiết quảng cáo/i.test(l));
  if (idx > 0) {
    // Lấy vài dòng trước ID, thường là title/nội dung quảng cáo.
    adName = lines.slice(Math.max(0, idx - 5), idx).find(l => l.length > 8 && !/Facebook|Messenger|Hiệu quả|Xem/i.test(l)) || null;
  }
  adName = adName || pick(/(?:Tên quảng cáo|Ad name)\s*[:#]?\s*(.+)/i, text);

  const adAccountName = pick(/(?:Tài khoản quảng cáo|Ad account)\s*[:#]?\s*(.+)/i, text)
    || pick(/(?:Page|Trang)\s*[:#]?\s*(.+)/i, text);
  const campaignName = pick(/(?:Chiến dịch|Campaign)\s*[:#]?\s*(.+)/i, text);

  return { ad_id: adId, ad_name: adName, ad_account_name: adAccountName, campaign_name: campaignName };
}

async function extractCurrentIdentity(page) {
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const url = page.url();
  const title = await page.title().catch(() => '');
  const ad = parseAdIdentity(text);

  // Cố tìm tên khách ở header. Meta đổi UI thường xuyên nên dùng nhiều fallback.
  const possibleNames = await page.locator('[role="main"] h1, [role="main"] h2, header h1, header h2').allInnerTexts().catch(() => []);
  const customerName = possibleNames.map(clean).find(x => x && x.length >= 2 && !/Inbox|Hộp thư|Business|Meta|Facebook/i.test(x))
    || pick(/^(.*?)\n(?:Chỉ định|Assign|Messenger|Instagram|WhatsApp)/m, text)
    || null;

  const senderId = pick(/(?:sender_id|participant_id|profile_id|user_id|psid)["'\s:=]+([0-9]{6,})/i, text)
    || pick(/facebook\.com\/(?:profile\.php\?id=)?([0-9]{6,})/i, text)
    || null;
  const postId = pick(/(?:post_id|postId)["'\s:=]+([0-9_]{6,})/i, text) || null;
  const commentId = pick(/(?:comment_id|commentId)["'\s:=]+([0-9_]{6,})/i, text) || null;

  return {
    conversation_id: null,
    sender_id: senderId,
    customer_name: customerName,
    source_channel: /comment/i.test(url + ' ' + text) ? 'meta_business_comment' : 'meta_business_inbox',
    post_id: postId,
    comment_id: commentId,
    ...ad,
    identity_source: 'meta_business_browser',
    raw: { url, title, text_sample: clean(text).slice(0, 3000) }
  };
}

async function postIdentities(items) {
  if (!BASE_URL) {
    console.log(JSON.stringify({ ok: false, reason: 'missing_AIGUKA_BASE_URL', items }, null, 2));
    return;
  }
  const res = await fetch(`${BASE_URL}/api/leadtracker/identity/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });
  const json = await res.json().catch(() => ({}));
  console.log(JSON.stringify({ status: res.status, result: json }, null, 2));
  const apply = await fetch(`${BASE_URL}/api/leadtracker/identity/apply`, { method: 'POST' }).then(r => r.json()).catch(e => ({ ok:false, error:e.message }));
  console.log('apply:', JSON.stringify(apply));
}

(async () => {
  const context = await chromium.launchPersistentContext(SESSION_DIR, { headless: HEADLESS, viewport: { width: 1440, height: 950 } });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  console.log('Mở Meta Business Suite. Nếu chưa login, hãy đăng nhập rồi quay lại terminal.');
  if (LOGIN_ONLY) {
    console.log('Login-only mode. Nhấn Ctrl+C sau khi đăng nhập xong.');
    await page.waitForTimeout(10 * 60 * 1000);
    await context.close();
    return;
  }
  await page.waitForTimeout(8000);

  const items = [];
  // Thu thập danh sách phần tử có thể là thread/comment ở cột trái.
  const candidates = await page.locator('[role="listitem"], [data-pagelet], a[href*="inbox"], div[aria-label]').elementHandles().catch(() => []);
  const limited = candidates.slice(0, LIMIT);
  console.log(`Tìm thấy ${candidates.length} candidate, quét tối đa ${limited.length}.`);

  for (let i = 0; i < limited.length; i++) {
    try {
      await limited[i].click({ timeout: 2500 }).catch(() => null);
      await sleep(1800);
      const identity = await extractCurrentIdentity(page);
      if (identity.ad_id || identity.ad_name || identity.customer_name || identity.sender_id) {
        items.push(identity);
        console.log(`[${items.length}]`, identity.customer_name || '-', identity.ad_id || '-', identity.ad_name || '-');
      }
    } catch (e) {
      console.log('skip candidate', i, e.message);
    }
  }

  // Loại trùng tương đối.
  const seen = new Set();
  const unique = items.filter(x => {
    const key = [x.sender_id, x.customer_name, x.ad_id, x.ad_name].filter(Boolean).join('|');
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
  console.log(`Chuẩn bị gửi ${unique.length} identity về AIGUKA.`);
  await postIdentities(unique);
  await context.close();
})().catch(err => { console.error(err); process.exit(1); });
