const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { cleanText } = require('./parser');

const SESSION_DIR = path.join(__dirname, '..', 'session');
const STORAGE_STATE = path.join(SESSION_DIR, 'meta-storage-state.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return String(v).toLowerCase() === 'true';
}

async function launchBrowser() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const headless = envBool('META_SYNC_HEADLESS', false);
  const browser = await chromium.launch({ headless, slowMo: Number(process.env.META_SYNC_SLOW_MS || 250) });
  const context = await browser.newContext(fs.existsSync(STORAGE_STATE) ? { storageState: STORAGE_STATE } : {});
  const page = await context.newPage();
  return { browser, context, page };
}

async function login() {
  const { browser, context, page } = await launchBrowser();
  const url = process.env.META_BUSINESS_INBOX_URL || 'https://business.facebook.com/latest/inbox/all';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  console.log('Nếu chưa đăng nhập, hãy đăng nhập Meta trong cửa sổ trình duyệt vừa mở.');
  console.log('Sau khi Inbox hiện ra, quay lại terminal và nhấn Enter.');
  await new Promise(resolve => process.stdin.once('data', resolve));
  await context.storageState({ path: STORAGE_STATE });
  console.log('Đã lưu session:', STORAGE_STATE);
  await browser.close();
}

async function collectConversationLinks(page, max = 50) {
  const links = new Map();
  const seenHeights = new Set();
  for (let round = 0; round < 30 && links.size < max; round++) {
    const found = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors.map(a => ({ href: a.href, text: (a.innerText || a.textContent || '').trim() }))
        .filter(x => /inbox|messenger|conversation|thread/i.test(x.href) && x.text.length > 0)
        .slice(0, 200);
    });
    for (const x of found) {
      if (!links.has(x.href)) links.set(x.href, x.text);
      if (links.size >= max) break;
    }
    const height = await page.evaluate(() => document.body.scrollHeight);
    if (seenHeights.has(height) && round > 4) break;
    seenHeights.add(height);
    await page.mouse.wheel(0, 1400);
    await sleep(700);
  }
  return Array.from(links.entries()).slice(0, max).map(([href, text]) => ({ href, text }));
}

async function scrapeCurrentConversation(page, fallback = {}) {
  await sleep(1200);
  const data = await page.evaluate(() => {
    const txt = (el) => (el?.innerText || el?.textContent || '').trim();
    const bodyText = document.body.innerText || '';
    const title = document.title || '';
    const candidates = Array.from(document.querySelectorAll('[role="main"] [dir="auto"], [role="main"] div, div[aria-label] [dir="auto"]'));
    const messages = [];
    for (const el of candidates) {
      const text = txt(el).replace(/\s+/g, ' ').trim();
      if (!text || text.length < 2 || text.length > 1200) continue;
      if (/^(Search|Inbox|Messenger|Meta Business Suite|Done|Send|Like)$/i.test(text)) continue;
      messages.push({ text, time: null, sender: null, sender_type: 'unknown' });
    }
    const uniq = [];
    const seen = new Set();
    for (const m of messages) {
      const k = m.text.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(m);
    }
    const adId = (bodyText.match(/\b1[0-9]{14,}\b/) || [])[0] || '';
    let adName = '';
    const adNameMatch = bodyText.match(/(?:Quảng cáo|Ad|QC)\s*[:\-]?\s*([^\n]{3,90})/i);
    if (adNameMatch) adName = adNameMatch[1].trim();
    return { title, bodyText: bodyText.slice(0, 5000), messages: uniq.slice(-300), ad_id: adId, ad_name: adName };
  });
  const url = page.url();
  const conversationId = (url.match(/(?:conversation|thread|selected_item_id|asset_id)[=/]([A-Za-z0-9_.:-]+)/) || [])[1]
    || Buffer.from(url).toString('base64url').slice(0, 40);
  return {
    conversation_id: conversationId,
    conversation_url: url,
    customer_name: cleanText(fallback.text || data.title || '').slice(0, 120) || null,
    ad_id: data.ad_id || '',
    ad_name: data.ad_name || '',
    source_text: data.bodyText || '',
    messages: data.messages || [],
    raw: { title: data.title, list_text: fallback.text || '' }
  };
}

async function syncConversations({ onConversation }) {
  const max = Number(process.env.META_SYNC_MAX_CONVERSATIONS || 50);
  const { browser, context, page } = await launchBrowser();
  try {
    const url = process.env.META_BUSINESS_INBOX_URL || 'https://business.facebook.com/latest/inbox/all';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await sleep(3000);
    const links = await collectConversationLinks(page, max);
    console.log(`Tìm thấy ${links.length} link hội thoại ứng viên.`);
    let count = 0;
    for (const item of links) {
      count++;
      console.log(`[${count}/${links.length}] ${item.text.slice(0, 80)}`);
      await page.goto(item.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
      const conv = await scrapeCurrentConversation(page, item);
      await onConversation(conv);
      await sleep(Number(process.env.META_SYNC_SLOW_MS || 700));
    }
    await context.storageState({ path: STORAGE_STATE });
  } finally {
    await browser.close();
  }
}

module.exports = { login, syncConversations };
