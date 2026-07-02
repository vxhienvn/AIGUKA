import { extractPhones, extractZaloHits } from './phone-extractor.js';
import { hashMessage } from './hash.js';

export async function parseOpenedConversation(page) {
  const conversationUrl = page.url();
  const customerName = await safeText(page, '[aria-label="Contact details"], h1, [role="main"] strong');
  const customerKey = makeCustomerKey(customerName, conversationUrl);

  const adInfo = await detectAdInfo(page);
  const nodes = await page.locator('[role="main"] [dir="auto"]').evaluateAll(els =>
    els.map((el, idx) => ({ idx, text: el.innerText || '', aria: el.getAttribute('aria-label') || '' }))
      .filter(x => x.text && x.text.trim().length > 0)
  ).catch(() => []);

  const messages = [];
  for (const n of nodes) {
    const text = cleanup(n.text);
    if (!text || text.length < 2) continue;
    const phones = extractPhones(text);
    const zaloHits = extractZaloHits(text);
    const message_time = guessTime(text);
    const sender_type = guessSender(text);
    const message_hash = hashMessage([conversationUrl, customerKey, adInfo.ad_id, text, n.idx]);
    messages.push({
      page_id: null,
      customer_name: customerName,
      customer_key: customerKey,
      conversation_url: conversationUrl,
      ad_id: adInfo.ad_id,
      ad_name: adInfo.ad_name,
      message_time,
      sender_type,
      message_text: text,
      phone_numbers: phones,
      zalo_hits: zaloHits,
      message_hash,
      raw: { source: 'meta_browser_sync', node_index: n.idx }
    });
  }
  return messages;
}

async function detectAdInfo(page) {
  const body = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
  const adId = (body.match(/(?:Ad ID|ID quảng cáo|ad_id)\D*(\d{12,30})/i) || [])[1] || null;
  let adName = null;
  const lines = body.split('\n').map(s => s.trim()).filter(Boolean);
  const idx = lines.findIndex(l => /Sponsored|Được tài trợ|Quảng cáo/i.test(l));
  if (idx >= 0) adName = lines.slice(Math.max(0, idx - 2), idx + 3).join(' | ').slice(0, 250);
  return { ad_id: adId, ad_name: adName };
}

function cleanup(s) { return String(s).replace(/\s+/g, ' ').trim(); }
function makeCustomerKey(name, url) { return hashMessage([name || 'unknown', url]).slice(0, 32); }
function guessTime(text) { return (text.match(/\b\d{1,2}:\d{2}\b/) || [])[0] || null; }
function guessSender(text) { return /bạn đã gửi|you sent/i.test(text) ? 'page' : 'customer_or_unknown'; }
async function safeText(page, selector) {
  return cleanup(await page.locator(selector).first().innerText({ timeout: 2000 }).catch(() => '')) || null;
}
