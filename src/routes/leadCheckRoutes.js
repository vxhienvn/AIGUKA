const express = require('express');
const {
  pancakeFetchConversations,
  pancakeBuildCustomerRow,
  pancakeVietnamDateString
} = require('../services/pancakeService');

const SUPABASE_ENABLED = String(process.env.SUPABASE_ENABLED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function supabaseReady() {
  return Boolean(SUPABASE_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function supabaseRequest(pathname, options = {}) {
  if (!supabaseReady()) return [];
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
  if (!response.ok) throw new Error(`Supabase ${pathname} failed ${response.status}: ${raw}`);
  return data;
}

function escapeText(value = '') {
  return String(value || '').trim();
}

function toDateKeyVN(input) {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input).slice(0, 10);
  return pancakeVietnamDateString(d);
}

function todayKeyVN(offset = 0) {
  const now = new Date();
  const vn = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  vn.setDate(vn.getDate() + offset);
  const y = vn.getFullYear();
  const m = String(vn.getMonth() + 1).padStart(2, '0');
  const d = String(vn.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function resolveRange(query = {}) {
  const preset = String(query.preset || '').toLowerCase();
  if (query.from || query.to) return { from: String(query.from || '1970-01-01'), to: String(query.to || todayKeyVN(0)) };
  if (preset === 'today') return { from: todayKeyVN(0), to: todayKeyVN(0) };
  if (preset === 'yesterday') return { from: todayKeyVN(-1), to: todayKeyVN(-1) };
  if (preset === '7d' || preset === '7') return { from: todayKeyVN(-6), to: todayKeyVN(0) };
  if (preset === '30d' || preset === '30') return { from: todayKeyVN(-29), to: todayKeyVN(0) };
  return { from: todayKeyVN(-29), to: todayKeyVN(0) };
}

function unique(arr = []) {
  return Array.from(new Set(arr.filter(Boolean).map(x => String(x).trim()).filter(Boolean)));
}

function normalizeLeadRow(row) {
  const adIds = unique(row.ad_ids || []);
  const primaryAdId = escapeText(row.ad_id || adIds[0] || '');
  const adName = escapeText(row.ad_name || row.ad_title || row.adTitle || 'Không rõ QC');
  const adAccountName = escapeText(row.ad_account_name || row.account_name || row.accountName || 'Không rõ tài khoản');
  const adAccountId = escapeText(row.ad_account_id || row.account_id || '');
  return {
    ...row,
    customer_name: row.name || row.customer_name || 'Không rõ tên',
    phones: unique(row.phones || []),
    phoneText: unique(row.phones || []).join(', '),
    has_zalo: Boolean(row.has_zalo || (row.tags || []).includes('Zalo')),
    tags: unique(row.tags || []),
    ad_ids: adIds,
    ad_id: primaryAdId,
    ad_name: adName,
    ad_account_name: adAccountName,
    ad_account_id: adAccountId,
    product: row.product || 'Khác',
    updated_date_vn: toDateKeyVN(row.updated_at)
  };
}

async function loadRows(limit = 500) {
  const conversations = await pancakeFetchConversations(Math.min(Math.max(Number(limit) || 500, 1), 500));
  return conversations.map(c => normalizeLeadRow(pancakeBuildCustomerRow(c)));
}

function filterRows(rows, query = {}) {
  const { from, to } = resolveRange(query);
  const q = String(query.q || '').toLowerCase().trim();
  const ad = String(query.ad || query.ad_id || '').toLowerCase().trim();
  const account = String(query.account || query.account_id || '').toLowerCase().trim();
  return rows.filter(r => {
    if (!r.has_phone && !r.has_zalo) return false;
    const d = r.updated_date_vn;
    if (d && (d < from || d > to)) return false;
    if (q) {
      const hay = [r.customer_name, r.phoneText, r.ad_name, r.ad_id, r.ad_account_name, r.tags.join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (ad) {
      const hay = [r.ad_name, r.ad_id, ...(r.ad_ids || [])].join(' ').toLowerCase();
      if (!hay.includes(ad)) return false;
    }
    if (account) {
      const hay = [r.ad_account_name, r.ad_account_id].join(' ').toLowerCase();
      if (!hay.includes(account)) return false;
    }
    return true;
  });
}

function groupByAd(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.ad_account_name || 'Không rõ tài khoản'}|${r.ad_name || 'Không rõ QC'}|${r.ad_id || ''}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        ad_name: r.ad_name || 'Không rõ QC',
        ad_id: r.ad_id || '',
        ad_ids: [],
        ad_account_name: r.ad_account_name || 'Không rõ tài khoản',
        ad_account_id: r.ad_account_id || '',
        status: 'active',
        conversations: 0,
        phones: [],
        zalo: 0,
        leads: 0,
        latest_at: '',
        rows: []
      });
    }
    const g = map.get(key);
    g.conversations += 1;
    g.phones = unique([...g.phones, ...(r.phones || [])]);
    g.ad_ids = unique([...g.ad_ids, ...(r.ad_ids || []), r.ad_id]);
    if (r.has_zalo) g.zalo += 1;
    g.leads += 1;
    if (!g.latest_at || String(r.updated_at || '') > String(g.latest_at || '')) g.latest_at = r.updated_at || '';
    g.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => b.phones.length - a.phones.length || b.leads - a.leads);
}

async function fetchConversationMessages(conversationId) {
  const out = { source: 'none', messages: [] };
  if (!conversationId || !supabaseReady()) return out;
  try {
    const rows = await supabaseRequest(`messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=*&order=created_at.asc&limit=200`, { method: 'GET' });
    if (Array.isArray(rows) && rows.length) return { source: 'supabase_messages', messages: rows };
  } catch (_) {}
  return out;
}

function createLeadCheckRoutes() {
  const router = express.Router();

  router.get('/list', async (req, res) => {
    try {
      const limit = Number(req.query.limit || 500);
      const rows = filterRows(await loadRows(limit), req.query);
      const groups = groupByAd(rows);
      res.json({ ok: true, range: resolveRange(req.query), count: rows.length, summary: {
        ad_groups: groups.length,
        unique_phones: unique(rows.flatMap(r => r.phones || [])).length,
        zalo: rows.filter(r => r.has_zalo).length,
        leads: rows.length
      }, groups, rows });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/filters', async (req, res) => {
    try {
      const rows = filterRows(await loadRows(Number(req.query.limit || 500)), req.query);
      const ads = groupByAd(rows).map(g => ({ ad_name: g.ad_name, ad_id: g.ad_id, ad_ids: g.ad_ids, ad_account_name: g.ad_account_name, count: g.leads, phones: g.phones.length }));
      const accounts = Array.from(new Map(rows.map(r => [r.ad_account_name || 'Không rõ tài khoản', { name: r.ad_account_name || 'Không rõ tài khoản', id: r.ad_account_id || '', count: 0 }])).values());
      for (const a of accounts) a.count = rows.filter(r => (r.ad_account_name || 'Không rõ tài khoản') === a.name).length;
      res.json({ ok: true, ads, accounts, range: resolveRange(req.query) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/conversation/:id', async (req, res) => {
    try {
      const convo = await fetchConversationMessages(req.params.id);
      res.json({ ok: true, conversation_id: req.params.id, ...convo });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = createLeadCheckRoutes;
