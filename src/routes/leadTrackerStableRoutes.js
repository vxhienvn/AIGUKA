const express = require('express');

const VN_TZ = 'Asia/Ho_Chi_Minh';
const LEAD_TABLE = process.env.LEAD_TRACKER_TABLE || 'lt_ad_phone_leads';
const LEAD_MESSAGES_TABLE = process.env.LEAD_MESSAGES_TABLE || 'lt_lead_messages';
const SYNC_RUNS_TABLE = process.env.LEAD_SYNC_RUNS_TABLE || 'lt_sync_runs';

function supabaseReady() {
  return Boolean((process.env.SUPABASE_URL || '').trim() && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim());
}

function supabaseHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra
  };
}

async function sb(pathname, options = {}) {
  if (!supabaseReady()) throw new Error('SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình');
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const url = `${base}/rest/v1/${pathname}`;
  const response = await fetch(url, { ...options, headers: supabaseHeaders(options.headers || {}) });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
  if (!response.ok) {
    const e = new Error(`Supabase ${pathname} failed ${response.status}: ${raw}`);
    e.status = response.status;
    e.data = data;
    throw e;
  }
  return data;
}

function escapeHtml(v = '') {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function vnDateKey(offsetDays = 0) {
  const now = new Date();
  const vn = new Date(now.toLocaleString('en-US', { timeZone: VN_TZ }));
  vn.setDate(vn.getDate() + offsetDays);
  return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}-${String(vn.getDate()).padStart(2, '0')}`;
}

function isoFromVNDate(date, end = false) {
  const [y, m, d] = String(date || vnDateKey()).split('-').map(Number);
  if (!y || !m || !d) return end ? new Date().toISOString() : new Date(Date.now() - 30 * 864e5).toISOString();
  // VN 00:00 = UTC previous day 17:00. VN 23:59:59 = UTC same day 16:59:59.
  return end
    ? new Date(Date.UTC(y, m - 1, d, 16, 59, 59, 999)).toISOString()
    : new Date(Date.UTC(y, m - 1, d - 1, 17, 0, 0, 0)).toISOString();
}

function get(obj, paths, fallback = null) {
  for (const p of paths) {
    const parts = String(p).split('.');
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
      else { ok = false; break; }
    }
    if (ok && cur != null && cur !== '') return cur;
  }
  return fallback;
}

function normalizePhone(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/[^\d+]/g, '');
  if (s.startsWith('+84')) s = '0' + s.slice(3);
  if (s.startsWith('84') && s.length === 11) s = '0' + s.slice(2);
  if (s.length === 9 && /^[235789]/.test(s)) s = '0' + s;
  if (/^0[235789]\d{8}$/.test(s)) return s;
  return '';
}

function extractPhones(text = '') {
  const src = String(text || '');
  const candidates = new Set();
  const regex = /(?:\+?84|0)?[\s.\-()]*(?:2|3|5|7|8|9)(?:[\s.\-()]*\d){8}/g;
  let m;
  while ((m = regex.exec(src))) {
    const p = normalizePhone(m[0]);
    if (p) candidates.add(p);
  }
  return [...candidates];
}

function hasZaloFlag(row = {}) {
  const text = `${row.text || ''} ${JSON.stringify(row.raw || {})}`.toLowerCase();
  return /(zalo|za lo|\bzl\b|z\.l|qr|quét mã|quet ma|có zalo|co zalo)/i.test(text);
}

function roleIsCustomer(row = {}) {
  const role = String(row.role || '').toLowerCase();
  if (['customer', 'user', 'guest', 'client'].includes(role)) return true;
  if (['bot', 'admin', 'page', 'sale', 'system'].includes(role)) return false;
  const raw = row.raw || {};
  const senderType = String(get(raw, ['sender_type', 'actor_type', 'from.type'], '')).toLowerCase();
  if (['customer', 'user'].includes(senderType)) return true;
  const source = String(row.source || get(raw, ['source', 'classified_source'], '')).toLowerCase();
  if (source.includes('customer')) return true;
  return false;
}

function deriveAd(row = {}) {
  const raw = row.raw || {};
  let adId = String(get(row, ['ad_id'], '') || get(raw, [
    'ad_id', 'ad.id', 'adId', 'referral.ad_id', 'referral.ad.id', 'referral.source_id',
    'messaging_referral.ad_id', 'messaging_referral.ad.id', 'entry_ad_id', 'ads_context_data.ad_id'
  ], '') || '').trim();
  if (!adId) adId = 'unknown_ad';
  const adName = String(get(row, ['ad_name'], '') || get(raw, [
    'ad_name', 'ad.name', 'adName', 'referral.ad_name', 'referral.ad.name', 'messaging_referral.ad_name', 'ads_context_data.ad_title'
  ], '') || (adId === 'unknown_ad' ? 'Không rõ quảng cáo' : adId)).trim();
  const campaignId = String(get(row, ['campaign_id'], '') || get(raw, ['campaign_id', 'campaign.id', 'campaignId'], '') || '');
  const campaignName = String(get(row, ['campaign_name'], '') || get(raw, ['campaign_name', 'campaign.name', 'campaignName'], '') || '');
  const adsetId = String(get(row, ['adset_id'], '') || get(raw, ['adset_id', 'adset.id', 'adsetId'], '') || '');
  const adsetName = String(get(row, ['adset_name'], '') || get(raw, ['adset_name', 'adset.name', 'adsetName'], '') || '');
  return { adId, adName, campaignId, campaignName, adsetId, adsetName };
}

function leadPayload(row, phone, sourceFlag) {
  const ad = deriveAd(row);
  const senderId = String(row.sender_id || get(row.raw || {}, ['sender.id', 'from.id', 'customer.id'], '') || 'unknown_sender');
  const messageId = String(row.external_message_id || row.message_id || row.id || `${senderId}-${row.created_at || Date.now()}`);
  const createdAt = row.created_at || row.message_time || new Date().toISOString();
  const normalizedPhone = phone ? normalizePhone(phone) : null;
  const leadKey = normalizedPhone
    ? `${ad.adId}|phone|${normalizedPhone}`
    : `${ad.adId}|${senderId}|${sourceFlag}|${messageId}`;
  return {
    lead_key: leadKey,
    ad_id: ad.adId,
    ad_name: ad.adName,
    campaign_id: ad.campaignId || null,
    campaign_name: ad.campaignName || null,
    adset_id: ad.adsetId || null,
    adset_name: ad.adsetName || null,
    sender_id: senderId,
    customer_name: String(row.customer_name || get(row.raw || {}, ['sender.name', 'from.name', 'customer.name'], '') || ''),
    conversation_id: row.conversation_id || null,
    conversation_url: row.conversation_url || null,
    phone: normalizedPhone,
    source_flag: sourceFlag,
    has_phone: Boolean(normalizedPhone),
    has_zalo: sourceFlag === 'zalo' || sourceFlag === 'both',
    evidence_message_id: messageId,
    evidence_text: String(row.text || '').slice(0, 2000),
    evidence_raw: row.raw || {},
    message_time: createdAt,
    lead_time: createdAt,
    lead_source: 'message_scan',
    updated_at: new Date().toISOString()
  };
}

async function fetchMessages({ from, to, limit }) {
  const select = [
    'id', 'external_message_id', 'conversation_id', 'sender_id', 'role', 'text', 'created_at',
    'ad_id', 'post_id', 'product_group', 'intent', 'source', 'raw'
  ].join(',');
  const params = [
    `created_at=gte.${encodeURIComponent(isoFromVNDate(from, false))}`,
    `created_at=lte.${encodeURIComponent(isoFromVNDate(to, true))}`,
    `select=${encodeURIComponent(select)}`,
    'order=created_at.desc',
    `limit=${Math.min(Math.max(Number(limit) || 5000, 1), 20000)}`
  ];
  try {
    return await sb(`messages?${params.join('&')}`, { method: 'GET' });
  } catch (error) {
    if (/column|schema cache|does not exist/i.test(String(error.message || ''))) {
      const fallback = [
        `created_at=gte.${encodeURIComponent(isoFromVNDate(from, false))}`,
        `created_at=lte.${encodeURIComponent(isoFromVNDate(to, true))}`,
        'select=*',
        'order=created_at.desc',
        `limit=${Math.min(Math.max(Number(limit) || 5000, 1), 20000)}`
      ];
      return await sb(`messages?${fallback.join('&')}`, { method: 'GET' });
    }
    throw error;
  }
}

async function upsertLeads(leads) {
  if (!leads.length) return [];
  // Deduplicate in-memory first to avoid PostgREST duplicate-key conflicts in one request.
  const map = new Map();
  for (const lead of leads) map.set(lead.lead_key, lead);
  return await sb(`${LEAD_TABLE}?on_conflict=lead_key`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([...map.values()])
  });
}

async function insertLeadMessages(rows) {
  if (!rows.length) return [];
  const items = rows.map(r => ({
    message_id: String(r.external_message_id || r.id || ''),
    conversation_id: r.conversation_id || null,
    sender_id: r.sender_id || null,
    role: r.role || null,
    text: r.text || '',
    ad_id: deriveAd(r).adId,
    message_time: r.created_at || new Date().toISOString(),
    raw: r.raw || {},
    created_at: new Date().toISOString()
  })).filter(x => x.message_id);
  if (!items.length) return [];
  const map = new Map();
  for (const item of items) map.set(item.message_id, item);
  return await sb(`${LEAD_MESSAGES_TABLE}?on_conflict=message_id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([...map.values()])
  });
}

function aggregate(rows = []) {
  const map = new Map();
  for (const r of rows || []) {
    const key = r.ad_id || 'unknown_ad';
    if (!map.has(key)) {
      map.set(key, {
        ad_id: key,
        ad_name: r.ad_name || (key === 'unknown_ad' ? 'Không rõ quảng cáo' : key),
        phone_set: new Set(), zalo_count: 0, lead_count: 0, conversation_set: new Set(), latest: null
      });
    }
    const item = map.get(key);
    item.lead_count += 1;
    if (r.phone) item.phone_set.add(r.phone);
    if (r.has_zalo || r.source_flag === 'zalo' || r.source_flag === 'both') item.zalo_count += 1;
    if (r.conversation_id) item.conversation_set.add(r.conversation_id);
    const t = r.message_time || r.lead_time || r.updated_at || r.created_at;
    if (t && (!item.latest || new Date(t) > new Date(item.latest))) item.latest = t;
  }
  return [...map.values()].map(x => ({
    ad_id: x.ad_id,
    ad_name: x.ad_name,
    phone_count: x.phone_set.size,
    zalo_count: x.zalo_count,
    lead_count: x.lead_count,
    conversation_count: x.conversation_set.size,
    latest: x.latest
  })).sort((a, b) => b.lead_count - a.lead_count || b.phone_count - a.phone_count);
}

function createLeadTrackerStableRoutes() {
  const router = express.Router();

  router.get('/api/lead-tracker/scan', async (req, res) => {
    let runId = null;
    try {
      const from = req.query.from || vnDateKey(-30);
      const to = req.query.to || vnDateKey(0);
      const limit = Number(req.query.limit || 10000);
      const run = await sb(`${SYNC_RUNS_TABLE}`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ source: 'message_scan', status: 'running', started_at: new Date().toISOString(), params: { from, to, limit } })
      }).catch(() => null);
      runId = Array.isArray(run) && run[0] ? run[0].id : null;
      const messages = await fetchMessages({ from, to, limit });
      const leads = [];
      const leadRows = [];
      let customerMessages = 0;
      for (const row of messages || []) {
        const text = String(row.text || '');
        if (!text.trim()) continue;
        if (!roleIsCustomer(row)) continue;
        customerMessages += 1;
        const phones = extractPhones(text);
        const zalo = hasZaloFlag(row);
        if (phones.length) {
          for (const p of phones) {
            leads.push(leadPayload(row, p, zalo ? 'both' : 'phone'));
            leadRows.push(row);
          }
        } else if (zalo) {
          leads.push(leadPayload(row, null, 'zalo'));
          leadRows.push(row);
        }
      }
      const saved = await upsertLeads(leads);
      await insertLeadMessages(leadRows).catch(() => null);
      if (runId) {
        await sb(`${SYNC_RUNS_TABLE}?id=eq.${encodeURIComponent(runId)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'success', finished_at: new Date().toISOString(), messages_seen: messages?.length || 0, customer_messages: customerMessages, leads_found: leads.length, leads_saved: Array.isArray(saved) ? saved.length : 0 })
        }).catch(() => null);
      }
      res.json({ ok: true, from, to, messages_seen: messages?.length || 0, customer_messages: customerMessages, leads_found: leads.length, saved: Array.isArray(saved) ? saved.length : 0, table: LEAD_TABLE });
    } catch (error) {
      if (runId) await sb(`${SYNC_RUNS_TABLE}?id=eq.${encodeURIComponent(runId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'failed', finished_at: new Date().toISOString(), error: error.message }) }).catch(() => null);
      res.status(500).json({ ok: false, error: error.message, detail: error.data || null, hint: 'Hãy chạy database/AIGUKA_V6_1_STABLE_LEAD_TRACKER.sql rồi restart Render.' });
    }
  });

  router.post('/api/lead-tracker/scan', async (req, res) => {
    const qs = new URLSearchParams({ ...(req.query || {}), ...(req.body || {}) }).toString();
    req.url = `/api/lead-tracker/scan?${qs}`;
    return router.handle(req, res);
  });

  router.get('/api/lead-tracker/summary', async (req, res) => {
    try {
      const from = req.query.from || vnDateKey(-30);
      const to = req.query.to || vnDateKey(0);
      const select = 'lead_key,ad_id,ad_name,phone,source_flag,has_zalo,conversation_id,message_time,lead_time,created_at,updated_at';
      const rows = await sb(`${LEAD_TABLE}?message_time=gte.${encodeURIComponent(isoFromVNDate(from, false))}&message_time=lte.${encodeURIComponent(isoFromVNDate(to, true))}&select=${encodeURIComponent(select)}&order=message_time.desc&limit=20000`, { method: 'GET' });
      const summary = aggregate(rows || []);
      res.json({ ok: true, from, to, rows: rows?.length || 0, table: LEAD_TABLE, summary, totals: {
        ads: summary.length,
        unique_phones: new Set((rows || []).map(r => r.phone).filter(Boolean)).size,
        zalo_flags: (rows || []).filter(r => r.has_zalo || r.source_flag === 'zalo' || r.source_flag === 'both').length,
        leads: (rows || []).length
      }});
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message, detail: error.data || null, hint: 'Hãy chạy database/AIGUKA_V6_1_STABLE_LEAD_TRACKER.sql rồi restart Render.' });
    }
  });

  router.get('/api/lead-tracker/details', async (req, res) => {
    try {
      const adId = String(req.query.ad_id || '');
      if (!adId) return res.status(400).json({ ok: false, error: 'missing ad_id' });
      const from = req.query.from || vnDateKey(-30);
      const to = req.query.to || vnDateKey(0);
      const select = 'lead_key,ad_id,ad_name,campaign_name,adset_name,sender_id,customer_name,conversation_id,conversation_url,phone,source_flag,has_phone,has_zalo,evidence_message_id,evidence_text,message_time,lead_time,lead_source';
      const rows = await sb(`${LEAD_TABLE}?ad_id=eq.${encodeURIComponent(adId)}&message_time=gte.${encodeURIComponent(isoFromVNDate(from, false))}&message_time=lte.${encodeURIComponent(isoFromVNDate(to, true))}&select=${encodeURIComponent(select)}&order=message_time.desc&limit=2000`, { method: 'GET' });
      res.json({ ok: true, from, to, ad_id: adId, count: rows?.length || 0, leads: rows || [] });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message, detail: error.data || null });
    }
  });

  router.get('/lead-tracker', (req, res) => {
    const today = vnDateKey(0);
    const d30 = vnDateKey(-30);
    res.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Lead Tracker</title><style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f3f6fb;color:#111827;margin:0}.wrap{max-width:1280px;margin:28px auto;padding:0 16px}.nav{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}.btn{border:0;border-radius:10px;background:#e7edf5;padding:10px 14px;font-weight:700;cursor:pointer;text-decoration:none;color:#0f172a}.btn.primary{background:#2563eb;color:#fff}.btn.green{background:#16a34a;color:#fff}.card{background:#fff;border:1px solid #dce5f2;border-radius:14px;box-shadow:0 4px 14px rgba(15,23,42,.06);padding:18px;margin:12px 0}.title{font-size:30px;font-weight:900;margin:0 0 8px}.muted{color:#64748b;font-size:13px}.filters{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.filters label{display:block;font-size:12px;font-weight:800;margin-bottom:4px}.filters input{padding:10px;border:1px solid #cbd5e1;border-radius:8px}.stats{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:12px}.stat{background:#fff;border:1px solid #dce5f2;border-radius:14px;padding:16px}.num{font-size:26px;font-weight:900}table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}th{background:#dbeafe;text-align:left;padding:11px;font-size:13px}td{border-bottom:1px solid #e5e7eb;padding:10px;font-size:13px;vertical-align:top}.error{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.leadbox{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin:6px 0}.pill{display:inline-block;border-radius:999px;padding:3px 8px;background:#e2e8f0;font-size:12px;font-weight:700}.phone{font-weight:900;color:#0f766e}.small{font-size:12px;color:#64748b}pre{white-space:pre-wrap;word-break:break-word;font-size:12px;background:#0f172a;color:#e2e8f0;border-radius:10px;padding:10px;max-height:240px;overflow:auto}@media(max-width:800px){.stats{grid-template-columns:1fr}.title{font-size:24px}}</style></head><body><div class="wrap">
      <div class="nav"><a class="btn" href="/admin-v5">← Admin</a><button class="btn green" onclick="quick(0)">Hôm nay</button><button class="btn primary" onclick="quick(7)">7 ngày</button><button class="btn primary" onclick="quick(30)">30 ngày</button><a class="btn" href="/meta-evidence">Meta Evidence</a></div>
      <div class="card"><div class="title">📞 Lead Tracker theo quảng cáo</div><div class="muted">Dữ liệu ổn định dùng bảng <b>lt_ad_phone_leads</b>, không đụng bảng cũ <b>ad_phone_leads</b> nên tránh lỗi constraint cũ.</div><br/><div class="filters"><div><label>Từ ngày</label><input id="from" type="date" value="${d30}"></div><div><label>Đến ngày</label><input id="to" type="date" value="${today}"></div><button class="btn primary" onclick="loadSummary()">Lọc</button><button class="btn" onclick="scan()">Quét lại từ messages</button><span id="status" class="small"></span></div></div>
      <div class="stats"><div class="stat">Quảng cáo có lead<div id="ads" class="num">0</div></div><div class="stat">SĐT unique<div id="phones" class="num">0</div></div><div class="stat">Cờ Zalo/Pancake<div id="zalo" class="num">0</div></div><div class="stat">Tổng lead liên hệ<div id="leads" class="num">0</div></div></div>
      <div id="notice" class="card muted">Đang tải...</div><div id="table"></div><div id="details"></div>
      </div><script>
      function q(id){return document.getElementById(id)}
      function api(path){return fetch(path).then(r=>r.json().then(j=>{if(!r.ok||j.ok===false)throw new Error(j.error||JSON.stringify(j));return j;}))}
      function quick(days){const d=new Date();q('to').value=d.toISOString().slice(0,10);d.setDate(d.getDate()-days);q('from').value=d.toISOString().slice(0,10);loadSummary()}
      async function scan(){q('status').textContent='Đang quét...';try{const j=await api('/api/lead-tracker/scan?from='+q('from').value+'&to='+q('to').value+'&limit=20000');q('status').textContent='Đã quét: '+j.messages_seen+' tin, lưu '+j.saved+' lead vào '+j.table;await loadSummary()}catch(e){q('status').textContent='Lỗi';q('notice').className='card error';q('notice').textContent=e.message}}
      async function loadSummary(){q('notice').className='card muted';q('notice').textContent='Đang tải...';try{const j=await api('/api/lead-tracker/summary?from='+q('from').value+'&to='+q('to').value);q('ads').textContent=j.totals.ads;q('phones').textContent=j.totals.unique_phones;q('zalo').textContent=j.totals.zalo_flags;q('leads').textContent=j.totals.leads;q('notice').textContent='Khoảng dữ liệu: '+j.from+' → '+j.to+' theo giờ Việt Nam. Bảng: '+j.table+'.';let html='<table><thead><tr><th>#</th><th>Quảng cáo</th><th>SĐT thật</th><th>Cờ Zalo</th><th>Lead liên hệ</th><th>Hội thoại lead</th><th>Lead mới nhất</th><th>Chi tiết</th></tr></thead><tbody>';if(!j.summary.length) html+='<tr><td colspan="8">Chưa có dữ liệu. Bấm “Quét lại từ messages”. Nếu vẫn 0, messages chưa có SĐT hoặc chưa có ad_id.</td></tr>';j.summary.forEach((r,i)=>{html+='<tr><td>'+(i+1)+'</td><td><b>'+esc(r.ad_name)+'</b><br><span class="small">'+esc(r.ad_id)+'</span></td><td>'+r.phone_count+'</td><td>'+r.zalo_count+'</td><td>'+r.lead_count+'</td><td>'+r.conversation_count+'</td><td>'+esc(r.latest||'')+'</td><td><button class="btn" onclick="details(\''+js(r.ad_id)+'\')">Xem</button></td></tr>'});html+='</tbody></table>';q('table').innerHTML=html}catch(e){q('notice').className='card error';q('notice').textContent=e.message}}
      async function details(adId){q('details').innerHTML='<div class="card muted">Đang tải chi tiết...</div>';try{const j=await api('/api/lead-tracker/details?ad_id='+encodeURIComponent(adId)+'&from='+q('from').value+'&to='+q('to').value);let html='<div class="card"><h2>Chi tiết: '+esc(adId)+'</h2>';if(!j.leads.length) html+='<div>Không có lead.</div>';j.leads.forEach(x=>{html+='<div class="leadbox"><div><span class="phone">'+esc(x.phone||'(không có SĐT, chỉ có cờ Zalo)')+'</span> <span class="pill">'+esc(x.source_flag||'')+'</span></div><div><b>'+esc(x.customer_name||x.sender_id||'Khách')+'</b> <span class="small">'+esc(x.message_time||'')+'</span></div><div class="small">conversation: '+esc(x.conversation_id||'')+'</div><div>Tin nhắn bằng chứng:</div><pre>'+esc(x.evidence_text||'')+'</pre></div>'});html+='</div>';q('details').innerHTML=html}catch(e){q('details').innerHTML='<div class="card error">'+esc(e.message)+'</div>'}}
      function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
      function js(s){return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ')}
      loadSummary();
      </script></body></html>`);
  });

  router.get('/meta-evidence', (req, res) => {
    res.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meta Evidence</title><style>body{font-family:system-ui;margin:30px;background:#f3f6fb;color:#0f172a}.card{background:#fff;border:1px solid #dce5f2;border-radius:14px;padding:18px;max-width:900px}.btn{display:inline-block;padding:10px 14px;border-radius:10px;background:#2563eb;color:white;text-decoration:none;font-weight:800}</style></head><body><div class="card"><h1>🧾 Meta Evidence Collector</h1><p>Bản này ưu tiên ổn định: quét từ bảng <b>messages</b> sang bảng riêng <b>lt_ad_phone_leads</b>. Nếu tin nhắn không có ad_id, lead sẽ nằm ở nhóm <b>unknown_ad</b>.</p><p><a class="btn" href="/lead-tracker">Mở Lead Tracker</a></p><h3>Lệnh sync Messenger API hiện có</h3><pre>/api/sync/messenger?limit=200&messages=100</pre><h3>Lưu ý</h3><p>Để biết đúng quảng cáo nguồn từ Business Suite cho lịch sử cũ, cần chạy Browser Sync/Meta Evidence sau. Lead Tracker vẫn hoạt động độc lập với dữ liệu messages hiện có.</p></div></body></html>`);
  });

  return router;
}

module.exports = createLeadTrackerStableRoutes;
