'use strict';

const express = require('express');
const engine = require('../services/leadTracker/leadTrackerEngine');
let pancakeService = null;
try { pancakeService = require('../services/pancakeService'); } catch (_) { pancakeService = null; }

const router = express.Router();

function parseBlacklist(value) {
  if (Array.isArray(value)) return value.map(x => String(x).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

function limitFromReq(req, fallback = 5000) {
  const n = parseInt(req.query.limit || req.body?.limit, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 20000);
}

router.get('/health', (req, res) => {
  res.json({ ok: true, module: 'leadtracker-core', version: 'LT-03' });
});

router.get('/analyze', async (req, res) => {
  try {
    const result = await engine.analyze({
      limit: limitFromReq(req),
      blacklist: parseBlacklist(req.query.blacklist)
    });
    res.json({ ok: true, source: 'messages', mode: 'analyze_no_write', version: 'LT-03', result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

async function handleRescan(req, res) {
  try {
    const result = await engine.rescan({
      limit: limitFromReq(req),
      blacklist: parseBlacklist(req.query.blacklist || req.body?.blacklist)
    });
    res.json({ ...result, version: 'LT-03' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

router.post('/rescan', handleRescan);
router.get('/rescan', handleRescan); // Cho phép test nhanh trên trình duyệt.

router.get('/summary', async (req, res) => {
  try {
    const result = await engine.summary();
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/intelligence/summary', async (req, res) => {
  try {
    const result = await engine.intelligenceSummary();
    res.json({ ok: true, version: 'LT-03', result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const result = await engine.listLeads({
      limit: parseInt(req.query.limit || '100', 10),
      offset: parseInt(req.query.offset || '0', 10),
      from: req.query.from || null,
      to: req.query.to || null
    });
    res.json({ ok: true, count: Array.isArray(result) ? result.length : 0, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/lead/:id', async (req, res) => {
  try {
    const result = await engine.getLead(req.params.id);
    if (!result) return res.status(404).json({ ok: false, error: 'lead_not_found' });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Debug một số điện thoại: số được nhận/loại ở tin nhắn nào, lý do gì.
router.get('/debug/phone/:phone', async (req, res) => {
  try {
    const result = await engine.debugPhone(req.params.phone, { limit: limitFromReq(req) });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Backward-compatible với LT-02.3: /debug/:phone
router.get('/debug/:phone', async (req, res) => {
  try {
    const result = await engine.debugPhone(req.params.phone, { limit: limitFromReq(req) });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/debug/conversation/:conversationId', async (req, res) => {
  try {
    const result = await engine.debugConversation(req.params.conversationId, { limit: limitFromReq(req, 300) });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const result = await engine.latestStats(parseInt(req.query.limit || '20', 10));
    res.json({ ok: true, count: Array.isArray(result) ? result.length : 0, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/blacklist', async (req, res) => {
  try {
    const result = await engine.listBlacklist();
    res.json({ ok: true, count: Array.isArray(result) ? result.length : 0, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/blacklist', async (req, res) => {
  try {
    const result = await engine.addBlacklist(req.body?.phone, req.body || {});
    res.json({ ok: true, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});


router.get('/ad-summary', async (req, res) => {
  try {
    const result = await engine.adSummary({
      limit: parseInt(req.query.limit || '5000', 10),
      from: req.query.from || null,
      to: req.query.to || null
    });
    res.json({ ok: true, count: Array.isArray(result) ? result.length : 0, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/ad-leads', async (req, res) => {
  try {
    const result = await engine.leadsByAd({
      adKey: req.query.ad_key || req.query.adId || req.query.ad_id || 'unknown',
      limit: parseInt(req.query.limit || '1000', 10),
      offset: parseInt(req.query.offset || '0', 10),
      from: req.query.from || null,
      to: req.query.to || null
    });
    res.json({ ok: true, count: Array.isArray(result) ? result.length : 0, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});


// LT-05: Identity mapping từ Meta Business Suite / Pancake message sync.
// Lead thật vẫn lấy từ messages; endpoint này chỉ gắn tên QC, ID QC, TKQC, tên khách theo conversation_id.
router.get('/identity/status', async (req, res) => {
  try {
    const result = await engine.identityStatus();
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/identity/upsert', async (req, res) => {
  try {
    const result = await engine.upsertConversationIdentity(req.body || {});
    res.json({ ok: true, data: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/identity/bulk', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : (req.body?.items || []);
    const result = await engine.bulkUpsertIdentities(items);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});


function pickDeep(obj, keys = []) {
  const wanted = new Set(keys.map(k => String(k).toLowerCase()));
  const seen = new Set();
  function walk(x, depth = 0) {
    if (!x || depth > 7 || typeof x !== 'object') return null;
    if (seen.has(x)) return null;
    seen.add(x);
    if (Array.isArray(x)) {
      for (const item of x) { const v = walk(item, depth + 1); if (v) return v; }
      return null;
    }
    for (const [k,v] of Object.entries(x)) {
      if (wanted.has(String(k).toLowerCase()) && v !== null && v !== undefined && String(v).trim() !== '') return v;
    }
    for (const v of Object.values(x)) { const found = walk(v, depth + 1); if (found) return found; }
    return null;
  }
  return walk(obj);
}

function normalizePancakeIdentity(conv, pancakeService) {
  const row = pancakeService.pancakeBuildCustomerRow ? pancakeService.pancakeBuildCustomerRow(conv) : conv;
  const adIds = Array.isArray(row.ad_ids) ? row.ad_ids : (Array.isArray(conv.ad_ids) ? conv.ad_ids : []);
  const from = conv.from || conv.customer || conv.user || {};
  return {
    conversation_id: row.conversation_id || conv.id || conv.conversation_id,
    customer_name: row.name || from.name || conv.name || conv.customer_name || pickDeep(conv, ['customer_name','sender_name','name']),
    customer_id: from.id || conv.customer_id || conv.user_id || pickDeep(conv, ['customer_id','user_id','from_id']),
    sender_id: conv.sender_id || from.id || conv.customer_id || conv.user_id || pickDeep(conv, ['sender_id','psid','from_id','user_id']),
    source_channel: 'pancake',
    ad_id: adIds[0] || row.ad_id || conv.ad_id || conv.ad?.id || pickDeep(conv, ['ad_id','adId','adID']),
    ad_name: row.ad_name || conv.ad_name || conv.ad?.name || conv.ad_title || pickDeep(conv, ['ad_name','adName','ad_title','title']),
    ad_account_id: row.ad_account_id || conv.ad_account_id || conv.account_id || conv.ad?.account_id || pickDeep(conv, ['ad_account_id','account_id','act_id']),
    ad_account_name: row.ad_account_name || conv.ad_account_name || conv.account_name || conv.ad?.account_name || pickDeep(conv, ['ad_account_name','account_name','business_name']),
    campaign_id: conv.campaign_id || conv.ad?.campaign_id || pickDeep(conv, ['campaign_id']),
    campaign_name: conv.campaign_name || conv.ad?.campaign_name || pickDeep(conv, ['campaign_name']),
    page_id: conv.page_id || pickDeep(conv, ['page_id']),
    page_name: conv.page_name || pickDeep(conv, ['page_name']),
    pancake_tags: row.tags || [],
    pancake_status: conv.status || null,
    identity_source: 'pancake_api',
    raw: { pancake: conv, normalized: row }
  };
}

async function handleSyncPancake(req, res) {
  try {
    if (!pancakeService || !pancakeService.pancakeFetchConversations) throw new Error('pancake_service_not_available');
    const limit = Math.min(Math.max(parseInt(req.query.limit || req.body?.limit || '300', 10) || 300, 1), 500);
    const conversations = await pancakeService.pancakeFetchConversations(limit);
    const items = (conversations || []).map(conv => normalizePancakeIdentity(conv, pancakeService))
      .filter(x => x.conversation_id || x.sender_id || x.customer_id);
    const result = await engine.bulkUpsertIdentities(items);
    const applied = await engine.applyAllKnownIdentities();
    res.json({ ok: true, source: 'pancake', fetched: conversations.length, normalized: items.length, applied, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

// Tùy chọn: dùng Pancake để bổ sung tên QC/ID QC/tên khách/tag.
// Không dùng thống kê SĐT của Pancake làm KPI chính; chỉ map identity vào lt_conversation_identities.
router.post('/identity/sync-pancake', handleSyncPancake);
router.get('/identity/sync-pancake', handleSyncPancake);

router.post('/identity/apply', async (req, res) => {
  try {
    const result = await engine.applyAllKnownIdentities();
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});
router.get('/identity/apply', async (req, res) => {
  try {
    const result = await engine.applyAllKnownIdentities();
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/identity/sync-existing', async (req, res) => {
  try {
    const result = await engine.syncIdentityFromExistingTables({ limit: limitFromReq(req) });
    res.json({ ok: true, source: 'messages_existing_fields', result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
