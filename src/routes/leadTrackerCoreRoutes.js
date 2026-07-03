'use strict';

const express = require('express');
const engine = require('../services/leadTracker/leadTrackerEngine');

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
  res.json({ ok: true, module: 'leadtracker-core', version: 'LT-02.5' });
});

router.get('/analyze', async (req, res) => {
  try {
    const result = await engine.analyze({
      limit: limitFromReq(req),
      blacklist: parseBlacklist(req.query.blacklist)
    });
    res.json({ ok: true, source: 'messages', mode: 'analyze_no_write', version: 'LT-02.5', result });
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
    res.json({ ...result, version: 'LT-02.5' });
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
    res.json({ ok: true, version: 'LT-02.5', result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const result = await engine.listLeads({
      limit: parseInt(req.query.limit || '100', 10),
      offset: parseInt(req.query.offset || '0', 10)
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

module.exports = router;
