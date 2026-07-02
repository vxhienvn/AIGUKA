const express = require('express');

function esc(v = '') {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const SUPABASE_ENABLED = String(process.env.SUPABASE_ENABLED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function ready() { return Boolean(SUPABASE_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY); }

async function supabase(pathname, options = {}) {
  if (!ready()) throw new Error('SUPABASE_NOT_READY');
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

function vnTime(v) {
  if (!v) return '';
  try { return new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }); }
  catch (_) { return String(v); }
}

function todayVN() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).reduce((a,x)=>{a[x.type]=x.value;return a;},{});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateParams(req) {
  const preset = String(req.query.preset || '').toLowerCase();
  const today = todayVN();
  let from = String(req.query.from || '').slice(0, 10);
  let to = String(req.query.to || '').slice(0, 10);
  const d = new Date(`${today}T00:00:00+07:00`);
  const iso = (x) => x.toISOString().slice(0,10);
  if (!from && !to) {
    if (preset === 'today') { from = today; to = today; }
    else if (preset === 'yesterday') { const y = new Date(d.getTime() - 86400000); from = iso(y); to = iso(y); }
    else if (preset === 'last_30d') { const x = new Date(d.getTime() - 29*86400000); from = iso(x); to = today; }
    else { const x = new Date(d.getTime() - 6*86400000); from = iso(x); to = today; }
  }
  const filters = [];
  if (from) filters.push(`evidence_message_time=gte.${encodeURIComponent(from + 'T00:00:00+07:00')}`);
  if (to) filters.push(`evidence_message_time=lte.${encodeURIComponent(to + 'T23:59:59+07:00')}`);
  return { from, to, filters, label: from || to ? `${from || '...'} → ${to || '...'}` : 'Tất cả' };
}

function leadQuery(req, extra = []) {
  const { filters } = dateParams(req);
  const q = [...filters, ...extra, 'select=*', 'order=evidence_message_time.desc.nullslast,updated_at.desc', 'limit=5000'];
  return `ad_phone_leads?${q.join('&')}`;
}

function summarize(rows = []) {
  const map = new Map();
  for (const r of rows) {
    const id = String(r.ad_id || 'unknown');
    if (!map.has(id)) map.set(id, { ad_id:id, ad_name:r.ad_name || '', campaign_name:r.campaign_name || '', lead_conversations:new Set(), phones:new Set(), zalo_flag_count:0, contact_lead_count:0, last_lead_at:null, rows:[] });
    const x = map.get(id);
    if (!x.ad_name && r.ad_name) x.ad_name = r.ad_name;
    if (!x.campaign_name && r.campaign_name) x.campaign_name = r.campaign_name;
    if (r.conversation_id) x.lead_conversations.add(r.conversation_id);
    if (r.normalized_phone) x.phones.add(r.normalized_phone);
    if (r.has_zalo) x.zalo_flag_count += 1;
    x.contact_lead_count += 1;
    const t = r.evidence_message_time || r.updated_at || r.created_at;
    if (t && (!x.last_lead_at || new Date(t) > new Date(x.last_lead_at))) x.last_lead_at = t;
    x.rows.push(r);
  }
  return Array.from(map.values()).map(x => ({
    ad_id:x.ad_id, ad_name:x.ad_name, campaign_name:x.campaign_name,
    lead_conversations:x.lead_conversations.size,
    phone_count:x.phones.size,
    zalo_flag_count:x.zalo_flag_count,
    contact_lead_count:x.contact_lead_count,
    last_lead_at:x.last_lead_at
  })).sort((a,b)=>(b.phone_count-a.phone_count)||(b.contact_lead_count-a.contact_lead_count));
}

function pageShell(title, body) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
    body{font-family:Arial,sans-serif;background:#f3f6fb;margin:0;color:#0f172a}.wrap{max-width:1380px;margin:auto;padding:18px}h1{margin:4px 0 8px}.top{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.top a,.btn{display:inline-block;background:#2563eb;color:white;text-decoration:none;border-radius:10px;padding:9px 12px;font-weight:700;border:0}.top a.gray,.btn.gray{background:#e2e8f0;color:#0f172a}.top a.green{background:#16a34a}.card{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:14px;box-shadow:0 1px 5px rgba(15,23,42,.06)}table{width:100%;border-collapse:collapse;background:white;border-radius:14px;overflow:hidden}th,td{border-bottom:1px solid #e2e8f0;padding:10px;text-align:left;vertical-align:top}th{background:#dbeafe;position:sticky;top:0}span,.muted{color:#64748b;font-size:12px}.num{font-size:24px;font-weight:800}.pill{display:inline-block;border-radius:999px;padding:4px 8px;font-weight:700;font-size:12px}.phone{background:#dcfce7;color:#166534}.zalo{background:#dbeafe;color:#1d4ed8}.both{background:#fef3c7;color:#92400e}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.msg{padding:8px 10px;border-bottom:1px solid #e2e8f0;background:#fff}.msg.customer{background:#f8fafc}.msg.page,.msg.admin,.msg.bot{background:#eff6ff}.evidence{background:#fff7ed;border-left:4px solid #f97316;padding:8px;border-radius:8px}details{margin-top:8px}summary{cursor:pointer;color:#2563eb;font-weight:700}.filters{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.filters label{font-size:12px;color:#475569;font-weight:700}.filters input{padding:9px;border:1px solid #cbd5e1;border-radius:10px}.copy{cursor:pointer;color:#2563eb;font-weight:700}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}table{font-size:12px}.wrap{padding:10px}}
  </style></head><body><div class="wrap"><div class="top"><a class="gray" href="/dashboard">← Dashboard</a><a class="green" href="/lead-tracker?preset=today">Hôm nay</a><a href="/lead-tracker">7 ngày</a><a href="/lead-tracker?preset=last_30d">30 ngày</a><a class="gray" href="/admin-v5">Admin</a></div>${body}</div><script>function cp(t){navigator.clipboard&&navigator.clipboard.writeText(t);alert('Đã copy: '+t)}</script></body></html>`;
}

function filtersHtml(dp, base='/lead-tracker') {
  return `<form class="filters" method="get" action="${base}"><div><label>Từ ngày</label><br><input type="date" name="from" value="${esc(dp.from)}"></div><div><label>Đến ngày</label><br><input type="date" name="to" value="${esc(dp.to)}"></div><button class="btn" type="submit">Lọc</button><a class="btn gray" href="${base}?preset=today">Hôm nay</a><a class="btn gray" href="${base}">7 ngày</a><a class="btn gray" href="${base}?preset=last_30d">30 ngày</a></form>`;
}

function createLeadTrackerRoutes() {
  const router = express.Router();

  router.get('/api/lead-tracker/summary', async (req, res) => {
    try {
      const rows = await supabase(leadQuery(req), { method: 'GET' });
      res.json({ success: true, range: dateParams(req), rows: summarize(rows) });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  router.get('/api/lead-tracker/ads/:adId/leads', async (req, res) => {
    try {
      const adId = req.params.adId;
      const rows = await supabase(leadQuery(req, [`ad_id=eq.${encodeURIComponent(adId)}`]), { method: 'GET' });
      res.json({ success: true, range: dateParams(req), ad_id: adId, count: rows.length, rows });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
  });

  router.get('/lead-tracker', async (req, res) => {
    try {
      const dp = dateParams(req);
      const allRows = await supabase(leadQuery(req), { method: 'GET' });
      const rows = summarize(allRows);
      const totalPhones = new Set(allRows.map(r=>r.normalized_phone).filter(Boolean)).size;
      const totalAds = rows.length;
      const totalLeads = allRows.length;
      const zalo = allRows.filter(r=>r.has_zalo).length;
      const bodyRows = rows.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><b>${esc(r.ad_name || 'Chưa rõ tên')}</b><br><span>${esc(r.ad_id)}</span>${r.campaign_name?`<br><span>${esc(r.campaign_name)}</span>`:''}</td>
          <td><span class="num">${Number(r.phone_count || 0)}</span></td>
          <td>${Number(r.zalo_flag_count || 0)}</td>
          <td>${Number(r.contact_lead_count || 0)}</td>
          <td>${Number(r.lead_conversations || 0)}</td>
          <td>${esc(vnTime(r.last_lead_at))}</td>
          <td><a class="btn" href="/lead-tracker/ad/${encodeURIComponent(r.ad_id)}?from=${encodeURIComponent(dp.from)}&to=${encodeURIComponent(dp.to)}">Xem số & lịch sử</a></td>
        </tr>`).join('');
      const body = `<div class="card"><h1>📞 Lead Tracker theo quảng cáo</h1><p class="muted">Cho biết mỗi quảng cáo ra bao nhiêu SĐT, gồm những số nào, kèm lịch sử hội thoại để đối chiếu Meta/Pancake.</p>${filtersHtml(dp)}</div><div class="grid"><div class="card"><div>Quảng cáo có lead</div><div class="num">${totalAds}</div></div><div class="card"><div>SĐT unique</div><div class="num">${totalPhones}</div></div><div class="card"><div>Cờ Zalo/Pancake</div><div class="num">${zalo}</div></div><div class="card"><div>Tổng lead liên hệ</div><div class="num">${totalLeads}</div></div></div><div class="card"><b>Khoảng dữ liệu:</b> ${esc(dp.label)} theo giờ Việt Nam. Dữ liệu lấy từ bảng <code>ad_phone_leads</code>.</div><table><thead><tr><th>#</th><th>Quảng cáo</th><th>SĐT thật</th><th>Cờ Zalo</th><th>Lead liên hệ</th><th>Hội thoại lead</th><th>Lead mới nhất</th><th>Chi tiết</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="8">Chưa có dữ liệu. Cần chạy meta-browser-sync hoặc đồng bộ lead trước.</td></tr>'}</tbody></table>`;
      res.send(pageShell('Lead Tracker', body));
    } catch (error) { res.status(500).send(pageShell('Lead Tracker Error', `<pre>${esc(error.message)}</pre>`)); }
  });

  router.get('/lead-tracker/ad/:adId', async (req, res) => {
    try {
      const adId = req.params.adId;
      const dp = dateParams(req);
      const rows = await supabase(leadQuery(req, [`ad_id=eq.${encodeURIComponent(adId)}`]), { method: 'GET' });
      const adName = rows[0]?.ad_name || '';
      const phones = Array.from(new Set(rows.map(r=>r.normalized_phone).filter(Boolean)));
      const phoneList = phones.map(p=>`<span class="pill phone copy" onclick="cp('${esc(p)}')">${esc(p)}</span>`).join(' ');
      const trs = rows.map((r, i) => {
        const history = Array.isArray(r.full_history_json) ? r.full_history_json : [];
        const historyHtml = history.map(m => {
          const role = String(m.sender_type || m.sender || 'unknown').toLowerCase();
          return `<div class="msg ${esc(role)}"><b>${esc(m.sender_type || m.sender || 'msg')}</b> <span>${esc(vnTime(m.time || m.created_at || m.message_time))}</span><br>${esc(m.text || m.message_text || '')}</div>`;
        }).join('');
        const flagClass = r.has_phone && r.has_zalo ? 'both' : (r.has_phone ? 'phone' : 'zalo');
        const flagText = r.has_phone && r.has_zalo ? 'SĐT + Zalo' : (r.has_phone ? 'SĐT thật' : 'Zalo/Pancake');
        return `<tr><td>${i + 1}</td><td><b class="copy" onclick="cp('${esc(r.normalized_phone || '')}')">${esc(r.normalized_phone || 'Không có số text')}</b><br><span class="pill ${flagClass}">${flagText}</span><br><span>${esc(r.source_flag || '')}</span></td><td>${esc(r.customer_name || '')}<br><span>${esc(r.conversation_id || '')}</span><br>${r.conversation_url ? `<a href="${esc(r.conversation_url)}" target="_blank">Mở hội thoại gốc</a>` : ''}</td><td><div class="evidence"><b>Tin ra số/cờ:</b><br>${esc(r.evidence_message || '')}<br><span>${esc(vnTime(r.evidence_message_time))}</span></div><details><summary>Xem toàn bộ lịch sử hội thoại</summary>${historyHtml || '<div class="msg">Chưa có snapshot lịch sử.</div>'}</details></td></tr>`;
      }).join('');
      const body = `<div class="card"><a href="/lead-tracker?from=${encodeURIComponent(dp.from)}&to=${encodeURIComponent(dp.to)}">← Quay lại Lead Tracker</a><h1>${esc(adName || 'Quảng cáo')}</h1><p><b>Ad ID:</b> ${esc(adId)} | <b>SĐT unique:</b> ${phones.length} | <b>Cờ Zalo:</b> ${rows.filter(r=>r.has_zalo).length} | <b>Tổng lead:</b> ${rows.length}</p>${filtersHtml(dp, `/lead-tracker/ad/${encodeURIComponent(adId)}`)}<p><b>Danh sách số:</b> ${phoneList || '<span class="muted">Chưa có số text, chỉ có cờ Zalo/Pancake.</span>'}</p></div><table><thead><tr><th>#</th><th>SĐT / loại lead</th><th>Khách</th><th>Bằng chứng & lịch sử</th></tr></thead><tbody>${trs || '<tr><td colspan="4">Chưa có lead cho quảng cáo này trong khoảng đã chọn.</td></tr>'}</tbody></table>`;
      res.send(pageShell(`Lead ${adId}`, body));
    } catch (error) { res.status(500).send(pageShell('Lead Detail Error', `<pre>${esc(error.message)}</pre>`)); }
  });

  return router;
}

module.exports = { createLeadTrackerRoutes };
