import 'dotenv/config';
import { chromium } from 'playwright';
import { parseOpenedConversation } from './parser.js';
import { makeSupabase, saveMessagesAndLeads } from './supabase-writer.js';

const CFG = {
  url: process.env.META_BUSINESS_INBOX_URL || 'https://business.facebook.com/latest/inbox/all',
  headless: String(process.env.META_SYNC_HEADLESS || 'false') === 'true',
  maxConversations: Number(process.env.META_SYNC_MAX_CONVERSATIONS || 200),
  scrollRounds: Number(process.env.META_SYNC_SCROLL_ROUNDS || 40),
  slowMo: Number(process.env.META_SYNC_SLOWMO_MS || 120),
  dryRun: String(process.env.META_SYNC_DRY_RUN || 'false') === 'true'
};

const browser = await chromium.launchPersistentContext('./session/meta', {
  headless: CFG.headless,
  slowMo: CFG.slowMo
});
const page = await browser.newPage();
await page.goto(CFG.url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

const supabase = CFG.dryRun ? null : makeSupabase();
const seen = new Set();
let totalMessages = 0, totalLeads = 0;

for (let round = 0; round < CFG.scrollRounds && seen.size < CFG.maxConversations; round++) {
  const items = await getConversationItems(page);
  for (const item of items) {
    if (seen.has(item.key) || seen.size >= CFG.maxConversations) continue;
    seen.add(item.key);
    console.log(`[${seen.size}] Open: ${item.title}`);
    await item.locator.click().catch(() => null);
    await page.waitForTimeout(2500);
    const messages = await parseOpenedConversation(page);
    const result = CFG.dryRun
      ? { messages: messages.length, leads: messages.filter(m => m.phone_numbers?.length && m.ad_id).length, dryRun: true }
      : await saveMessagesAndLeads(supabase, messages, { dryRun: CFG.dryRun });
    totalMessages += result.messages;
    totalLeads += result.leads;
    console.log(`  saved messages=${result.messages}, phone_leads=${result.leads}${result.dryRun ? ' DRY_RUN' : ''}`);
    await page.waitForTimeout(1000 + Math.random() * 1000);
  }
  await scrollConversationList(page);
}

console.log(`DONE conversations=${seen.size}, messages=${totalMessages}, phone_leads=${totalLeads}`);
await browser.close();

async function getConversationItems(page) {
  const candidates = page.locator('[role="grid"] [role="row"], [role="list"] [role="listitem"], a[href*="inbox"]');
  const count = Math.min(await candidates.count().catch(() => 0), 80);
  const out = [];
  for (let i = 0; i < count; i++) {
    const loc = candidates.nth(i);
    const title = (await loc.innerText({ timeout: 1000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
    if (!title || title.length < 3) continue;
    out.push({ key: title.slice(0, 160), title: title.slice(0, 80), locator: loc });
  }
  return out;
}

async function scrollConversationList(page) {
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(2500);
}
