import { createClient } from '@supabase/supabase-js';

export function makeSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function saveMessagesAndLeads(supabase, messages, { dryRun = false } = {}) {
  if (!messages.length) return { messages: 0, leads: 0 };
  if (dryRun) return { messages: messages.length, leads: buildLeads(messages).length, dryRun: true };

  const { error: msgError } = await supabase
    .from('meta_conversation_messages')
    .upsert(messages, { onConflict: 'message_hash', ignoreDuplicates: true });
  if (msgError) throw msgError;

  const leads = buildLeads(messages);
  if (leads.length) {
    const { error: leadError } = await supabase
      .from('meta_ad_phone_leads')
      .upsert(leads, { onConflict: 'ad_id,customer_key,phone', ignoreDuplicates: true });
    if (leadError) throw leadError;
  }
  return { messages: messages.length, leads: leads.length };
}

function buildLeads(messages) {
  const out = [];
  for (const m of messages) {
    if (!m.ad_id || !Array.isArray(m.phone_numbers)) continue;
    for (const phone of m.phone_numbers) {
      out.push({
        ad_id: m.ad_id,
        ad_name: m.ad_name,
        customer_key: m.customer_key,
        customer_name: m.customer_name,
        phone,
        first_seen_at: m.message_time,
        conversation_url: m.conversation_url,
        message_hash: m.message_hash,
        has_zalo: Array.isArray(m.zalo_hits) && m.zalo_hits.length > 0,
        raw: { source: 'meta_browser_sync', evidence_text: m.message_text }
      });
    }
  }
  return out;
}
