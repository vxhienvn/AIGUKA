require('dotenv').config();
const { chromium } = require('playwright');
const { SupabaseWriter } = require('./lib/supabase-writer');
const { extractPhonesFromText, hasZalo } = require('./lib/phone');
const { cleanText, parseAdInfoFromText, inferRoleFromBubble } = require('./lib/parser');
const { hash } = require('./lib/hash');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const maxConversations = Number(process.env.META_SYNC_MAX_CONVERSATIONS || 80);
const maxMessages = Number(process.env.META_SYNC_MAX_MESSAGES_PER_CONVERSATION || 80);
const slowMs = Number(process.env.META_SYNC_SLOW_MS || 700);
async function getTextList(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel);
    const count = await loc.count().catch(()=>0);
    if (count) {
      const out = [];
      for (let i=0;i<Math.min(count, maxConversations);i++) {
        const t = cleanText(await loc.nth(i).innerText().catch(()=>''));
        if (t) out.push({ index:i, text:t });
      }
      if (out.length) return { selector: sel, items: out };
    }
  }
  return { selector: '', items: [] };
}
(async () => {
  const writer = new SupabaseWriter();
  const run = await writer.startRun({ maxConversations, maxMessages });
  let conversationsSeen=0, messagesSeen=0, leadsFound=0; const errors=[];
  const browser = await chromium.launchPersistentContext('./session', { headless: String(process.env.META_SYNC_HEADLESS||'false') === 'true', viewport: { width: 1400, height: 900 } });
  try {
    const page = browser.pages()[0] || await browser.newPage();
    await page.goto(process.env.META_BUSINESS_INBOX_URL || 'https://business.facebook.com/latest/inbox/all', { waitUntil:'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    const list = await getTextList(page, [
      '[role="listitem"]', '[aria-label*="conversation" i] [role="button"]', '[data-testid*="thread"]', 'div[role="button"]'
    ]);
    console.log('Conversation candidates:', list.items.length, 'selector=', list.selector);
    const limit = Math.min(list.items.length, maxConversations);
    for (let i=0;i<limit;i++) {
      try {
        const item = page.locator(list.selector).nth(i);
        await item.click({ timeout: 5000 }).catch(()=>{});
        await sleep(slowMs + 1000);
        conversationsSeen++;
        const url = page.url();
        const whole = cleanText(await page.locator('body').innerText({ timeout: 8000 }).catch(()=>''));
        const ad = parseAdInfoFromText(whole);
        const title = cleanText((await page.locator('h1,h2,[role="heading"]').first().innerText().catch(()=>'')) || list.items[i].text.split('\n')[0]);
        const conversationId = hash(url + ':' + title);
        const customer = { name: title || `Khách ${i+1}`, sender_id: conversationId, profile_url: '' };
        const msgTexts = [];
        const candidates = await page.locator('[role="row"], [data-testid*="message"], div[dir="auto"]').allTextContents().catch(()=>[]);
        for (const raw of candidates) {
          const text = cleanText(raw);
          if (!text || text.length < 2 || text.length > 1000) continue;
          if (msgTexts.includes(text)) continue;
          msgTexts.push(text);
          if (msgTexts.length >= maxMessages) break;
        }
        const messages = msgTexts.map((text, idx) => ({ id: hash(conversationId+idx+text), role: inferRoleFromBubble(text), text, time: new Date().toISOString() }));
        messagesSeen += messages.length;
        const conversation = { conversation_id: conversationId, url, first_message: messages[0]?.text || '', last_message: messages[messages.length-1]?.text || '' };
        await writer.upsertSnapshot({ ad, customer, conversation, messages });
        for (const msg of messages.filter(m => m.role === 'customer')) {
          const phones = extractPhonesFromText(msg.text);
          const z = hasZalo(msg.text);
          if (phones.length) {
            for (const phone of phones) { await writer.upsertLead({ ad, customer, conversation, message: msg, phone, hasZalo: z }); leadsFound++; }
          } else if (z) { await writer.upsertLead({ ad, customer, conversation, message: msg, phone: '', hasZalo: true }); leadsFound++; }
        }
        console.log(`[${i+1}/${limit}]`, title, 'messages=', messages.length, 'leads=', leadsFound);
      } catch (e) { errors.push({ i, error: e.message }); console.error('Conversation sync error', i, e.message); }
    }
    await writer.finishRun(run?.id, { status: 'done', conversations_seen: conversationsSeen, messages_seen: messagesSeen, leads_found: leadsFound, errors });
    console.log('Done:', { conversationsSeen, messagesSeen, leadsFound, errors: errors.length });
  } catch (e) {
    errors.push({ fatal: e.message });
    await writer.finishRun(run?.id, { status: 'error', conversations_seen: conversationsSeen, messages_seen: messagesSeen, leads_found: leadsFound, errors });
    throw e;
  } finally { await browser.close(); }
})();
