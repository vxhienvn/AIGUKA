require('dotenv').config();
const { hash } = require('./hash');
class SupabaseWriter {
  constructor() {
    this.url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
    if (!this.url || !this.key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in meta-browser-sync/.env');
  }
  async req(path, options = {}) {
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(options.headers || {})
      }
    });
    const raw = await res.text();
    let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!res.ok) throw new Error(`Supabase ${path} ${res.status}: ${raw}`);
    return data;
  }
  async startRun(raw = {}) {
    const rows = await this.req('meta_evidence_sync_runs', { method: 'POST', body: JSON.stringify({ status: 'running', raw }) });
    return Array.isArray(rows) ? rows[0] : rows;
  }
  async finishRun(id, patch) {
    if (!id) return null;
    return this.req(`meta_evidence_sync_runs?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ...patch, finished_at: new Date().toISOString() }) });
  }
  async upsertLead({ ad, customer, conversation, message, phone, hasZalo }) {
    const adId = ad.ad_id || 'unknown_ad';
    const leadKey = [adId, phone || 'no_phone', conversation.conversation_id || customer.sender_id || '', hasZalo ? 'zalo' : 'phone'].join(':');
    const payload = {
      lead_key: leadKey,
      ad_id: adId,
      ad_name: ad.ad_name || (adId === 'unknown_ad' ? 'Không rõ quảng cáo' : `Ad ${adId}`),
      campaign_id: ad.campaign_id || null,
      campaign_name: ad.campaign_name || null,
      adset_id: ad.adset_id || null,
      adset_name: ad.adset_name || null,
      conversation_id: conversation.conversation_id || null,
      sender_id: customer.sender_id || null,
      page_id: conversation.page_id || null,
      customer_name: customer.name || null,
      customer_profile_url: customer.profile_url || null,
      conversation_url: conversation.url || null,
      phone: phone || null,
      has_phone: Boolean(phone),
      has_zalo: Boolean(hasZalo),
      source_flag: hasZalo && phone ? 'both' : hasZalo ? 'zalo' : 'phone',
      evidence_message: message.text || null,
      evidence_message_id: message.id || hash(`${conversation.conversation_id}:${message.time}:${message.text}`),
      message_time: message.time || new Date().toISOString(),
      first_message: conversation.first_message || null,
      last_message: conversation.last_message || null,
      raw: { ad, customer, conversation, message, source: 'meta_browser_sync' }
    };
    return this.req('ad_phone_leads?on_conflict=lead_key', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(payload)
    });
  }
  async upsertSnapshot({ ad, customer, conversation, messages }) {
    const payload = {
      conversation_id: conversation.conversation_id,
      sender_id: customer.sender_id || null,
      page_id: conversation.page_id || null,
      ad_id: ad.ad_id || 'unknown_ad',
      ad_name: ad.ad_name || null,
      customer_name: customer.name || null,
      conversation_url: conversation.url || null,
      full_history_json: messages || [],
      last_synced_at: new Date().toISOString(),
      raw: { ad, customer, conversation, source: 'meta_browser_sync' }
    };
    return this.req('conversation_snapshots?on_conflict=conversation_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(payload)
    });
  }
}
module.exports = { SupabaseWriter };
