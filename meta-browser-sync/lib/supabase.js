const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const SUPABASE_ENABLED = String(process.env.SUPABASE_ENABLED || 'true').toLowerCase() !== 'false';

function ready() {
  return Boolean(SUPABASE_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function request(pathname, options = {}) {
  if (!ready()) throw new Error('Supabase chưa sẵn sàng. Kiểm tra SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY.');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
  if (!res.ok) throw new Error(`Supabase ${pathname} failed ${res.status}: ${raw}`);
  return data;
}

async function upsertSnapshot(snapshot) {
  return request('conversation_snapshots?on_conflict=conversation_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(snapshot)
  });
}

async function insertLeadMessage(message) {
  return request('lead_messages', { method: 'POST', body: JSON.stringify(message) });
}

async function upsertAdPhoneLead(lead) {
  // Nếu có số: unique theo ad_id + normalized_phone. Nếu chỉ có cờ Zalo: unique theo ad_id + conversation_id.
  const conflict = lead.normalized_phone ? 'ad_id,normalized_phone' : 'ad_id,conversation_id';
  return request(`ad_phone_leads?on_conflict=${encodeURIComponent(conflict)}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(lead)
  });
}

async function getSummary(limit = 100) {
  return request(`v_ad_lead_summary?select=*&order=phone_count.desc&limit=${Number(limit) || 100}`, { method: 'GET' });
}

async function getLeadsByAd(adId, limit = 500) {
  return request(`ad_phone_leads?ad_id=eq.${encodeURIComponent(adId)}&select=*&order=evidence_message_time.desc&limit=${Number(limit) || 500}`, { method: 'GET' });
}

module.exports = { ready, request, upsertSnapshot, insertLeadMessage, upsertAdPhoneLead, getSummary, getLeadsByAd };
