#!/usr/bin/env node
try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch (_) {}
try { require('dotenv').config(); } catch (_) {}

const db = require('./lib/supabase');
const { buildLeadsFromConversation } = require('./lib/parser');

async function saveConversation(conv) {
  const parsed = buildLeadsFromConversation(conv);
  const snapshot = {
    conversation_id: conv.conversation_id,
    ad_id: parsed.ad_id,
    ad_name: parsed.ad_name,
    page_id: conv.page_id || process.env.META_SYNC_PAGE_ID || null,
    customer_id: conv.customer_id || null,
    customer_name: conv.customer_name || null,
    conversation_url: conv.conversation_url || null,
    full_history_json: conv.messages || [],
    pancake_flags: conv.pancake_flags || {},
    raw: conv.raw || {},
    last_synced_at: new Date().toISOString()
  };
  await db.upsertSnapshot(snapshot);

  for (const msg of conv.messages || []) {
    const phones = require('./lib/phone').extractPhones(msg.text || '');
    const isZalo = require('./lib/phone').hasZaloText(msg.text || '');
    if (!phones.length && !isZalo) continue;
    await db.insertLeadMessage({
      conversation_id: conv.conversation_id,
      ad_id: parsed.ad_id,
      sender: msg.sender || null,
      sender_type: msg.sender_type || 'unknown',
      message_text: msg.text || '',
      message_time: msg.time || null,
      is_phone_message: phones.length > 0,
      is_zalo_message: isZalo,
      phones,
      raw: msg.raw || {}
    });
  }

  for (const lead of parsed.leads) await db.upsertAdPhoneLead(lead);
  return { leadCount: parsed.leads.length, phones: parsed.phones, hasZalo: parsed.hasZalo, ad_id: parsed.ad_id };
}

async function cmdSync() {
  if (!db.ready()) throw new Error('Supabase chưa sẵn sàng. Hãy cấu hình .env.');
  const { syncConversations } = require('./lib/browserSync');
  let totalLeads = 0;
  await syncConversations({
    onConversation: async (conv) => {
      const result = await saveConversation(conv);
      totalLeads += result.leadCount;
      console.log(`  -> ad=${result.ad_id}, leads=${result.leadCount}, phones=${result.phones.join(',') || '-'}, zalo=${result.hasZalo}`);
    }
  });
  console.log(`Hoàn tất sync. Tổng lead ghi nhận: ${totalLeads}`);
}

async function cmdLogin() {
  const { login } = require('./lib/browserSync');
  await login();
}

async function cmdReport() {
  const adId = process.argv[3] || '';
  if (adId) {
    const rows = await db.getLeadsByAd(adId, 500);
    console.log(JSON.stringify({ ad_id: adId, count: rows.length, rows }, null, 2));
  } else {
    const rows = await db.getSummary(100);
    console.log(JSON.stringify(rows, null, 2));
  }
}

async function main() {
  const cmd = process.argv[2] || 'report';
  if (cmd === 'login') return cmdLogin();
  if (cmd === 'sync') return cmdSync();
  if (cmd === 'report') return cmdReport();
  throw new Error(`Lệnh không hợp lệ: ${cmd}. Dùng: login | sync | report [ad_id]`);
}

main().catch(err => { console.error(err); process.exit(1); });
