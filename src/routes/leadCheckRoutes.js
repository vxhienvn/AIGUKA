'use strict';

const express = require('express');
const {
  PANCAKE_PAGE_ID,
  PANCAKE_PAGE_ACCESS_TOKEN,
  pancakeFetchConversations,
  pancakeBuildCustomerRow,
  pancakeConversationDateString
} = require('../services/pancakeService');

const router = express.Router();

function escText(value = '') {
  return String(value || '').trim();
}

function dateKeyVN(value) {
  if (!value) return '';
  return pancakeConversationDateString(value);
}

function todayVN(offset = 0) {
  const now = new Date();
  const vn = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  vn.setDate(vn.getDate() + offset);
  const y = vn.getFullYear();
  const m = String(vn.getMonth() + 1).padStart(2, '0');
  const d = String(vn.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDateRange(query = {}) {
  const preset = String(query.preset || '').toLowerCase();
  let from = escText(query.from || query.date_from || '');
  let to = escText(query.to || query.date_to || '');

  if (preset === 'today') from = to = todayVN(0);
  if (preset === 'yesterday') from = to = todayVN(-1);
  if (preset === '7d' || preset === '7days') {
    from = todayVN(-6); to = todayVN(0);
  }
  if (preset === '30d' || preset === '30days') {
    from = todayVN(-29); to = todayVN(0);
  }

  return { from, to, preset };
}

function inRangeVN(updatedAt, range) {
  const key = dateKeyVN(updatedAt);
  if (!key) return false;
  if (range.from && key < range.from) return false;
  if (range.to && key > range.to) return false;
  return true;
}

function firstAdId(row = {}) {
  const ids = Array.isArray(row.ad_ids) ? row.ad_ids.filter(Boolean).map(String) : [];
  return row.ad_id || ids[0] || '';
}

function rowAdIds(row = {}) {
  const ids = new Set(Array.isArray(row.ad_ids) ? row.ad_ids.filter(Boolean).map(String) : []);
  if (row.ad_id) ids.add(String(row.ad_id));
  return Array.from(ids);
}

function adKey(row = {}) {
  const id = firstAdId(row);
  if (id) return id;
  if (row.ad_name) return `name:${row.ad_name}`;
  return 'unknown';
}

function adName(row = {}) {
  return row.ad_name || (firstAdId(row) ? `QC ${firstAdId(row)}` : 'Không rõ QC');
}

function accountLabel(row = {}) {
  return row.ad_account_name || row.ad_account_id || 'Không rõ tài khoản';
}

async function loadLeadRows(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 500, 1), 1000);
  const range = normalizeDateRange(query);
  const q = escText(query.q || query.search || '').toLowerCase();
  const adFilter = escText(query.ad || query.ad_id || query.ad_key || '').toLowerCase();
  const accountFilter = escText(query.account || query.ad_account || '').toLowerCase();
  const productFilter = escText(query.product || '').toLowerCase();

  const conversations = await pancakeFetchConversations(limit);
  let rows = conversations.map(pancakeBuildCustomerRow).filter(x => x.has_phone || x.has_zalo || (x.phones || []).length);

  if (range.from || range.to) rows = rows.filter(x => inRangeVN(x.updated_at, range));
  if (q) {
    rows = rows.filter(x => [x.name, ...(x.phones || []), x.ad_name, x.ad_account_name, x.product, ...(x.tags || [])]
      .join(' ').toLowerCase().includes(q));
  }
  if (adFilter) {
    rows = rows.filter(x => [adKey(x), adName(x), ...rowAdIds(x)].join(' ').toLowerCase().includes(adFilter));
  }
  if (accountFilter) rows = rows.filter(x => accountLabel(x).toLowerCase().includes(accountFilter));
  if (productFilter && productFilter !== 'all') rows = rows.filter(x => String(x.product || '').toLowerCase().includes(productFilter));

  return { rows, range, totalFetched: conversations.length, limit };
}

function buildSummary(rows = []) {
  const phones = new Set();
  let zalo = 0;
  for (const r of rows) {
    for (const p of r.phones || []) phones.add(String(p));
    if (r.has_zalo || (r.tags || []).includes('Zalo')) zalo += 1;
  }
  return {
    lead_rows: rows.length,
    unique_phones: phones.size,
    zalo_rows: zalo,
    ad_groups: new Set(rows.map(adKey)).size
  };
}

function buildAdSummary(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = adKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        ad_key: key,
        ad_id: firstAdId(row) || null,
        ad_ids: rowAdIds(row),
        ad_name: adName(row),
        ad_account_id: row.ad_account_id || null,
        ad_account_name: accountLabel(row),
        product: row.product || 'Khác',
        conversations: 0,
        lead_rows: 0,
        phones: new Set(),
        zalo_rows: 0,
        latest_at: null,
        rows: []
      });
    }
    const g = groups.get(key);
    g.conversations += 1;
    g.lead_rows += 1;
    for (const p of row.phones || []) g.phones.add(String(p));
    if (row.has_zalo || (row.tags || []).includes('Zalo')) g.zalo_rows += 1;
    if (row.updated_at && (!g.latest_at || Date.parse(row.updated_at) > Date.parse(g.latest_at))) g.latest_at = row.updated_at;
    g.rows.push(row);
  }
  return Array.from(groups.values()).map(g => ({
    ...g,
    phone_count: g.phones.size,
    phones: Array.from(g.phones),
    rows: g.rows.slice(0, 50)
  })).sort((a,b) => b.phone_count - a.phone_count || b.lead_rows - a.lead_rows);
}

router.get('/summary', async (req, res) => {
  try {
    const { rows, range, totalFetched, limit } = await loadLeadRows(req.query);
    const ads = buildAdSummary(rows);
    res.json({ ok: true, source: 'pancake_dashboard_source', limit, totalFetched, range, summary: buildSummary(rows), ads });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/leads', async (req, res) => {
  try {
    const { rows, range, totalFetched, limit } = await loadLeadRows(req.query);
    const ad = escText(req.query.ad || req.query.ad_id || req.query.ad_key || '');
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const pageSize = Math.min(Math.max(Number(req.query.page_size) || 200, 1), 500);
    const data = rows.slice(offset, offset + pageSize);
    res.json({ ok: true, source: 'pancake_dashboard_source', limit, totalFetched, range, ad, count: rows.length, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

async function pancakeFetchConversationMessages(conversationId) {
  if (!PANCAKE_PAGE_ID || !PANCAKE_PAGE_ACCESS_TOKEN) throw new Error('missing_pancake_config');
  const token = encodeURIComponent(PANCAKE_PAGE_ACCESS_TOKEN);
  const cid = encodeURIComponent(conversationId);
  const urls = [
    `https://pages.fm/api/public_api/v2/pages/${PANCAKE_PAGE_ID}/conversations/${cid}/messages?page_access_token=${token}`,
    `https://pages.fm/api/public_api/v2/pages/${PANCAKE_PAGE_ID}/conversation_messages?conversation_id=${cid}&page_access_token=${token}`,
    `https://pages.fm/api/public_api/v2/pages/${PANCAKE_PAGE_ID}/messages?conversation_id=${cid}&page_access_token=${token}`,
    `https://pages.fm/api/public_api/v2/pages/${PANCAKE_PAGE_ID}/conversations/${cid}?page_access_token=${token}`
  ];
  const attempts = [];
  for (const url of urls) {
    const response = await fetch(url);
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    attempts.push({ status: response.status, ok: response.ok, sample: text.slice(0, 300) });
    const arr = json?.messages || json?.data || json?.conversation?.messages || json?.conversation_messages || [];
    if (Array.isArray(arr) && arr.length) return { messages: arr, raw: json, endpoint: url.replace(PANCAKE_PAGE_ACCESS_TOKEN, '***') };
    if (json && (json.id || json.conversation)) return { messages: arr, raw: json, endpoint: url.replace(PANCAKE_PAGE_ACCESS_TOKEN, '***') };
  }
  return { messages: [], raw: { attempts }, endpoint: null };
}

router.get('/conversation/:id', async (req, res) => {
  try {
    const result = await pancakeFetchConversationMessages(req.params.id);
    res.json({ ok: true, source: 'pancake', conversation_id: req.params.id, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
