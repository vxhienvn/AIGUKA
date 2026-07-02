const express = require('express');

const VN_TZ = 'Asia/Ho_Chi_Minh';

function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

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
  // Supabase stores timestamptz. Convert VN date boundary approximately to UTC ISO.
  const [y, m, d] = String(date || vnDateKey()).split('-').map(Number);
  const hourUtc = end ? 16 : 17; // VN 00:00 = UTC previous day 17:00; VN 23:59:59 = UTC same day 16:59:59
  const base = end ? new Date(Date.UTC(y, m - 1, d, 16, 59, 59, 999)) : new Date(Date.UTC(y, m - 1, d - 1, 17, 0, 0, 0));
  return base.toISOString();
}

function get(obj, paths, fallback = null) {
  for (const p of paths) {
    const parts = String(p).split('.');
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part]; else { ok = false; break; }
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
  if (s.length === 9 && /^[35789]/.test(s)) s = '0' + s;
  if (/^0[235789]\d{8}$/.test(s)) return s;
  return '';
}

function extractPhones(text = '') {
  const src = String(text || '');
  const candidates = new Set();
  const regex = /(?:\+?84|0)?[\s.\-()]*[235789](?:[\s.\-()]*\d){8}/g;
  let m;
  while ((m = regex.exec(src))) {
    const p = normalizePhone(m[0]);
    if (p) candidates.add(p);
  }
  return [...candidates];
}

function hasZaloFlag(row = {}) {
  const text = `${row.text || ''} ${JSON.stringify(row.raw || {})}`.toLowerCase();
  return /\b(zalo|za lo|zl|z\.l|zalo riêng|qr|quét mã|quet ma)\b/i.test(text);
}

function roleIsCustomer(row = {}) {
  const role = String(row.role || '').toLowerCase();
  if (['customer', 'user', 'guest', 'client'].includes(role)) return true;
  const raw = row.raw || {};
  const senderType = String(get(raw, ['sender_type', 'actor_type', 'from.type'], '')).toLowerCase();
  return ['customer', 'user'].includes(senderType);
}

function deriveAd(row = {}) {
  const raw = row.raw || {};
  const adId = String(get(row, ['ad_id'], '') || get(raw, [
    'ad_id', 'ad.id', 'adId', 'referral.ad_id', 'referral.ad.id', 'referral.source_id',
    'messaging_referral.ad_id', 'messaging_referral.ad.id', 'entry_ad_id'
  ], '') || 'unknown_ad');
  const adName = String(get(row, ['ad_name'], '') || get(raw, [
    'ad_name', 'ad.name', 'adName', 'referral.ad_name', 'referral.ad.name', 'messaging_referral.ad_name'
  ], '') || (adId === 'unknown_ad' ? 'Không rõ quảng cáo' : adId));
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
    'ad_id', 'ad_name', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
    'customer_name', 'source', 'raw'
  ].join(',');
  const params = [
    `created_at=gte.${encodeURIComponent(isoFromVNDate(from, false))}`,
    `created_at=lte.${encodeURIComponent(isoFromVNDate(to, true))}`,
    `select=${encodeURIComponent(select)}`,
    'order=created_at.desc',
    `limit=${Math.min(Math.max(Number(limit) || 5000, 1), 20000)}`
  ];
  return await sb(`messages?${params.join('&')}`, { method: 'GET' });
}

async function upsertLeads(leads) {
  if (!leads.length) return [];
  return await sb('ad_phone_leads?on_conflict=lead_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(leads)
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
    try {
      const from = req.query.from || vnDateKey(-30);
      const to = req.query.to || vnDateKey(0);
      const limit = Number(req.query.limit || 10000);
      const messages = await fetchMessages({ from, to, limit });
      const leads = [];
      let customerMessages = 0;
      for (const row of messages || []) {
        const text = String(row.text || '');
        if (!text.trim()) continue;
        if (!roleIsCustomer(row)) continue;
        customerMessages += 1;
        const phones = extractPhones(text);
        const zalo = hasZaloFlag(row);
        if (phones.length) {
          for (const p of phones) leads.push(leadPayload(row, p, zalo ? 'both' : 'phone'));
        } else if (zalo) {
          leads.push(leadPayload(row, null, 'zalo'));
        }
      }
      const saved = await upsertLeads(leads);
      res.json({ ok: true, from, to, messages_seen: messages?.length || 0, customer_messages: customerMessages, leads_found: leads.length, saved: Array.isArray(saved) ? saved.length : 0 });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message, detail: error.data || null });
    }
  });

  router.post('/api/lead-tracker/scan', async (req, res) => {
    req.query = { ...req.query, ...(req.body || {}) };
    return router.handle({ ...req, method: 'GET', url: '/api/lead-tracker/scan', query: req.query }, res);
  });

  router.get('/api/lead-tracker/summary', async (req, res) => {
    try {
      const from = req.query.from || vnDateKey(-30);
      const to = req.query.to || vnDateKey(0);
      const select = 'lead_key,ad_id,ad_name,phone,source_flag,has_zalo,conversation_id,message_time,lead_time,created_at,updated_at';
      const rows = await sb(`ad_phone_leads?message_time=gte.${encodeURIComponent(isoFromVNDate(from, false))}&message_time=lte.${encodeURIComponent(isoFromVNDate(to, true))}&select=${encodeURIComponent(select)}&order=message_time.desc&limit=20000`, { method: 'GET' });
      const summary = aggregate(rows || []);
      res.json({ ok: true, from, to, rows: rows?.length || 0, summary, totals: {
        ads: summary.length,
        unique_phones: new Set((rows || []).map(r => r.phone).filter(Boolean)).size,
        zalo_flags: (rows || []).filter(r => r.has_zalo || r.source_flag === 'zalo' || r.source_flag === 'both').length,
        leads: (rows || []).length
      }});
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message, detail: error.data || null });
    }
  });

  router.get('/api/lead-tracker/details', async (req, res) => {
    try {
      const adId = String(req.query.ad_id || '');
      if (!adId) return res.status(400).json({ ok: false, error: 'missing ad_id' });
      const from = req.query.from || vnDateKey(-30);
      const to = req.query.to || vnDateKey(0);
      const select = 'lead_key,ad_id,ad_name,campaign_name,adset_name,sender_id,customer_name,conversation_id,conversation_url,phone,source_flag,has_phone,has_zalo,evidence_message_id,evidence_text,message_time,lead_time,lead_source';
      const rows = await sb(`ad_phone_leads?ad_id=eq.${encodeURIComponent(adId)}&message_time=gte.${encodeURIComponent(isoFromVNDate(from, false))}&message_time=lte.${encodeURIComponent(isoFromVNDate(to, true))}&select=${encodeURIComponent(select)}&order=message_time.desc&limit=2000`, { method: 'GET' });
      res.json({ ok: true, from, to, ad_id: adId, count: rows?.length || 0, leads: rows || [] });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message, detail: error.data || null });
    }
  });

  router.get('/lead-tracker', (req, res) => {
    const today = vnDateKey(0);
    const d30 = vnDateKey(-30);
    res.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Lead Tracker</title><style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f3f6fb;color:#111827;margin:0}.wrap{max-width:1280px;margin:28px auto;padding:0 16px}.nav{display:flex;gap:8px;margin-bottom:12px}.btn{border:0;border-radius:10px;background:#e7edf5;padding:10px 14px;font-weight:700;cursor:pointer;text-decoration:none;color:#0f172a}.btn.primary{background:#2563eb;color:#fff}.btn.green{background:#16a34a;color:#fff}.card{background:#fff;border:1px solid #dce5f2;border-radius:14px;box-shadow:0 4px 14px rgba(15,23,42,.06);padding:18px;margin:12px 0}.title{font-size:30px;font-weight:900;margin:0 0 8px}.muted{color:#64748b;font-size:13px}.filters{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.filters label{display:block;font-size:12px;font-weight:800;margin-bottom:4px}.filters input{padding:10px;border:1px solid #cbd5e1;border-radius:8px}.stats{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:12px}.stat{background:#fff;border:1px solid #dce5f2;border-radius:14px;padding:16px}.num{font-size:26px;font-weight:900}table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}th{background:#dbeafe;text-align:left;padding:11px;font-size:13px}td{border-bottom:1px solid #e5e7eb;padding:10px;font-size:13px;vertical-align:top}.error{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.leadbox{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin:6px 0}.pill{display:inline-block;border-radius:999px;padding:3px 8px;background:#e2e8f0;font-size:12px;font-weight:700}.phone{font-weight:900;color:#0f766e}.small{font-size:12px;color:#64748b}pre{white-space:pre-wrap;word-break:break-word;font-size:12px;background:#0f172a;color:#e2e8f0;border-radius:10px;padding:10px;max-height:240px;overflow:auto}@media(max-width:800px){.stats{grid-template-columns:1fr}.title{font-size:24px}}</style></head><body><div class="wrap">
      <div class="nav"><a class="btn" href="/dashboard">← Dashboard</a><button class="btn green" onclick="quick(0)">Hôm nay</button><button class="btn primary" onclick="quick(7)">7 ngày</button><button class="btn primary" onclick="quick(30)">30 ngày</button><a class="btn" href="/admin/v5-admin.html">Admin</a><a class="btn" href="/meta-evidence">Meta Evidence</a></div>
      <div class="card"><div class="title">📞 Lead Tracker theo quảng cáo</div><div class="muted">Mỗi quảng cáo ra bao nhiêu SĐT, gồm những số nào, kèm lịch sử hội thoại để đối chiếu Meta/Pancake.</div><br/><div class="filters"><div><label>Từ ngày</label><input id="from" type="date" value="${d30}"></div><div><label>Đến ngày</label><input id="to" type="date" value="${today}"></div><button class="btn primary" onclick="loadSummary()">Lọc</button><button class="btn" onclick="scan()">Quét lại từ messages</button><span id="status" class="small"></span></div></div>
      <div class="stats"><div class="stat">Quảng cáo có lead<div id="ads" class="num">0</div></div><div class="stat">SĐT unique<div id="phones" class="num">0</div></div><div class="stat">Cờ Zalo/Pancake<div id="zalo" class="num">0</div></div><div class="stat">Tổng lead liên hệ<div id="leads" class="num">0</div></div></div>
      <div id="notice" class="card muted">Đang tải...</div><div id="table"></div><div id="details"></div>
      </div><script>
      function q(id){return document.getElementById(id)}
      function api(path){return fetch(path).then(r=>r.json().then(j=>{if(!r.ok||j.ok===false)throw new Error(j.error||JSON.stringify(j));return j;}))}
      function quick(days){const d=new Date();q('to').value=d.toISOString().slice(0,10);d.setDate(d.getDate()-days);q('from').value=d.toISOString().slice(0,10);loadSummary()}
      async function scan(){q('status').textContent='Đang quét...';try{const j=await api('/api/lead-tracker/scan?from='+q('from').value+'&to='+q('to').value+'&limit=20000');q('status').textContent='Đã quét: '+j.messages_seen+' tin, lưu '+j.saved+' lead';await loadSummary()}catch(e){q('status').textContent='Lỗi';q('notice').className='card error';q('notice').textContent=e.message}}
      async function loadSummary(){q('notice').className='card muted';q('notice').textContent='Đang tải...';try{const j=await api('/api/lead-tracker/summary?from='+q('from').value+'&to='+q('to').value);q('ads').textContent=j.totals.ads;q('phones').textContent=j.totals.unique_phones;q('zalo').textContent=j.totals.zalo_flags;q('leads').textContent=j.totals.leads;q('notice').textContent='Khoảng dữ liệu: '+j.from+' → '+j.to+' theo giờ Việt Nam. Dữ liệu lấy từ bảng ad_phone_leads.';let html='<table><thead><tr><th>#</th><th>Quảng cáo</th><th>SĐT thật</th><th>Cờ Zalo</th><th>Lead liên hệ</th><th>Hội thoại lead</th><th>Lead mới nhất</th><th>Chi tiết</th></tr></thead><tbody>';if(!j.summary.length) html+='<tr><td colspan="8">Chưa có dữ liệu. Bấm “Quét lại từ messages”. Nếu vẫn 0, messages chưa có SĐT hoặc chưa có dữ liệu quảng cáo.</td></tr>';j.summary.forEach((r,i)=>{html+='<tr><td>'+(i+1)+'</td><td><b>'+esc(r.ad_name)+'</b><br><span class="small">'+esc(r.ad_id)+'</span></td><td>'+r.phone_count+'</td><td>'+r.zalo_count+'</td><td>'+r.lead_count+'</td><td>'+r.conversation_count+'</td><td>'+esc(r.latest||'')+'</td><td><button class="btn" onclick="details(\''+escAttr(r.ad_id)+'\')">Xem</button></td></tr>'});html+='</tbody></table>';q('table').innerHTML=html}catch(e){q('notice').className='card error';q('notice').textContent=e.message}}
      async function details(adId){q('details').innerHTML='<div class="card muted">Đang tải chi tiết...</div>';try{const j=await api('/api/lead-tracker/details?ad_id='+encodeURIComponent(adId)+'&from='+q('from').value+'&to='+q('to').value);let html='<div class="card"><h2>Chi tiết: '+esc(adId)+'</h2>';if(!j.leads.length) html+='<div>Không có lead.</div>';j.leads.forEach(x=>{html+='<div class="leadbox"><div><span class="phone">'+esc(x.phone||'(không có SĐT, chỉ có cờ Zalo)')+'</span> <span class="pill">'+esc(x.source_flag||'')+'</span></div><div><b>'+esc(x.customer_name||x.sender_id||'Khách')+'</b> <span class="small">'+esc(x.message_time||'')+'</span></div><div class="small">conversation: '+esc(x.conversation_id||'')+'</div><div>Tin nhắn bằng chứng:</div><pre>'+esc(x.evidence_text||'')+'</pre></div>'});html+='</div>';q('details').innerHTML=html}catch(e){q('details').innerHTML='<div class="card error">'+esc(e.message)+'</div>'}}
      function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
      function escAttr(s){return esc(s).replace(/\\/g,'\\\\')}
      loadSummary();
      </script></body></html>`);
  });

  router.get('/meta-evidence', (req, res) => {
    res.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meta Evidence</title><style>body{font-family:system-ui;margin:30px;background:#f3f6fb;color:#0f172a}.card{background:#fff;border:1px solid #dce5f2;border-radius:14px;padding:18px;max-width:900px}.btn{display:inline-block;padding:10px 14px;border-radius:10px;background:#2563eb;color:white;text-decoration:none;font-weight:800}</style></head><body><div class="card"><h1>🧾 Meta Evidence Collector</h1><p>Trang này là điểm kiểm tra module bằng chứng lead. Hiện bản ổn định ưu tiên quét từ bảng <b>messages</b>. Khi cần lấy đúng nguồn quảng cáo từ Business Suite, chạy module <b>meta-browser-sync</b> trên máy/VPS có Chromium.</p><p><a class="btn" href="/lead-tracker">Mở Lead Tracker</a></p><h3>Lệnh nhanh</h3><pre>cd meta-browser-sync\nnpm install\nnpm run sync</pre></div></body></html>`);
  });

  return router;
}

module.exports = createLeadTrackerStableRoutes;
