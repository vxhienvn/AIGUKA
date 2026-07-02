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

function createLeadTrackerRoutes() {
  const router = express.Router();

  router.get('/api/lead-tracker/summary', async (req, res) => {
    try {
      const rows = await supabase('v_ad_lead_summary?select=*&order=phone_count.desc&limit=500', { method: 'GET' });
      res.json({ success: true, rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/api/lead-tracker/ads/:adId/leads', async (req, res) => {
    try {
      const adId = req.params.adId;
      const rows = await supabase(`ad_phone_leads?ad_id=eq.${encodeURIComponent(adId)}&select=*&order=evidence_message_time.desc&limit=1000`, { method: 'GET' });
      res.json({ success: true, ad_id: adId, count: rows.length, rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/lead-tracker', async (req, res) => {
    try {
      const rows = await supabase('v_ad_lead_summary?select=*&order=phone_count.desc&limit=500', { method: 'GET' });
      const body = rows.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><b>${esc(r.ad_name || 'Chưa rõ tên')}</b><br><span>${esc(r.ad_id)}</span></td>
          <td><b>${Number(r.phone_count || 0)}</b></td>
          <td>${Number(r.zalo_flag_count || 0)}</td>
          <td>${Number(r.contact_lead_count || 0)}</td>
          <td>${esc(r.last_lead_at || '')}</td>
          <td><a href="/lead-tracker/ad/${encodeURIComponent(r.ad_id)}">Xem số & lịch sử</a></td>
        </tr>`).join('');
      res.send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lead Tracker</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;margin:0;color:#0f172a}.wrap{max-width:1200px;margin:auto;padding:18px}table{width:100%;border-collapse:collapse;background:white;border-radius:14px;overflow:hidden}th,td{border-bottom:1px solid #e2e8f0;padding:11px;text-align:left;vertical-align:top}th{background:#dbeafe}span{color:#64748b;font-size:12px}a{color:#2563eb;font-weight:700}.card{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:14px}</style></head><body><div class="wrap"><div class="card"><h1>📞 Lead Tracker theo quảng cáo</h1><p>Mục này chỉ thống kê lead có bằng chứng: số điện thoại trong hội thoại hoặc cờ Zalo/Pancake.</p></div><table><thead><tr><th>#</th><th>Quảng cáo</th><th>SĐT thật</th><th>Cờ Zalo</th><th>Lead liên hệ</th><th>Lead mới nhất</th><th>Chi tiết</th></tr></thead><tbody>${body || '<tr><td colspan="7">Chưa có dữ liệu. Chạy meta-browser-sync trước.</td></tr>'}</tbody></table></div></body></html>`);
    } catch (error) {
      res.status(500).send(`<pre>${esc(error.message)}</pre>`);
    }
  });

  router.get('/lead-tracker/ad/:adId', async (req, res) => {
    try {
      const adId = req.params.adId;
      const rows = await supabase(`ad_phone_leads?ad_id=eq.${encodeURIComponent(adId)}&select=*&order=evidence_message_time.desc&limit=1000`, { method: 'GET' });
      const adName = rows[0]?.ad_name || '';
      const trs = rows.map((r, i) => {
        const history = Array.isArray(r.full_history_json) ? r.full_history_json : [];
        const historyHtml = history.map(m => `<div class="msg"><b>${esc(m.sender_type || m.sender || 'msg')}</b> <span>${esc(m.time || '')}</span><br>${esc(m.text || '')}</div>`).join('');
        return `<tr><td>${i + 1}</td><td><b>${esc(r.normalized_phone || 'Không có số text')}</b><br><span>${esc(r.source_flag)}</span></td><td>${esc(r.customer_name || '')}<br>${r.conversation_url ? `<a href="${esc(r.conversation_url)}" target="_blank">Mở hội thoại</a>` : ''}</td><td><b>${esc(r.evidence_message || '')}</b><br><span>${esc(r.evidence_message_time || '')}</span><details><summary>Xem lịch sử hội thoại</summary>${historyHtml || 'Chưa có snapshot'}</details></td></tr>`;
      }).join('');
      const uniquePhones = new Set(rows.map(r => r.normalized_phone).filter(Boolean)).size;
      const zalo = rows.filter(r => r.has_zalo).length;
      res.send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lead ${esc(adId)}</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;margin:0;color:#0f172a}.wrap{max-width:1280px;margin:auto;padding:18px}table{width:100%;border-collapse:collapse;background:white;border-radius:14px;overflow:hidden}th,td{border-bottom:1px solid #e2e8f0;padding:11px;text-align:left;vertical-align:top}th{background:#dcfce7}span{color:#64748b;font-size:12px}.card{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:14px}.msg{padding:8px;border-bottom:1px solid #e2e8f0;background:#fff}summary{cursor:pointer;color:#2563eb;font-weight:700;margin-top:8px}</style></head><body><div class="wrap"><div class="card"><a href="/lead-tracker">← Quay lại</a><h1>${esc(adName || 'Quảng cáo')}</h1><p><b>Ad ID:</b> ${esc(adId)} | <b>SĐT unique:</b> ${uniquePhones} | <b>Cờ Zalo:</b> ${zalo} | <b>Tổng lead:</b> ${rows.length}</p></div><table><thead><tr><th>#</th><th>SĐT / loại lead</th><th>Khách</th><th>Bằng chứng & lịch sử</th></tr></thead><tbody>${trs || '<tr><td colspan="4">Chưa có lead cho quảng cáo này.</td></tr>'}</tbody></table></div></body></html>`);
    } catch (error) {
      res.status(500).send(`<pre>${esc(error.message)}</pre>`);
    }
  });

  return router;
}

module.exports = { createLeadTrackerRoutes };
