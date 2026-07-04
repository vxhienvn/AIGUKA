const express = require('express');
const fs = require('fs');
const path = require('path');
const aiProviderManager = require('../ai/providerManager');

const ROOT_DIR = path.join(__dirname, '..', '..');
const LEARNING_DIR = path.join(ROOT_DIR, 'ai_learning_uploads');
const LEARNING_ITEMS_FILE = path.join(ROOT_DIR, 'ai_learning_items.json');
const LEARNING_SETTINGS_FILE = path.join(ROOT_DIR, 'ai_learning_settings.json');

function ensureLearningDir() { fs.mkdirSync(LEARNING_DIR, { recursive: true }); }
function safeReadJson(file, fallback) { try { if (!fs.existsSync(file)) return fallback; return JSON.parse(fs.readFileSync(file, 'utf8') || 'null') || fallback; } catch (_) { return fallback; } }
function safeWriteJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function getLearningSettings() { return { active: true, startedAt: new Date().toISOString(), targetDays: 7, autoProcess: true, requireApproval: true, ...safeReadJson(LEARNING_SETTINGS_FILE, {}) }; }
function saveLearningSettings(partial = {}) { const next = { ...getLearningSettings(), ...partial, updatedAt: new Date().toISOString() }; safeWriteJson(LEARNING_SETTINGS_FILE, next); return next; }
function readLearningItems() { return safeReadJson(LEARNING_ITEMS_FILE, []); }
function writeLearningItems(items) { safeWriteJson(LEARNING_ITEMS_FILE, items); }
function cleanFilename(name = 'upload.bin') { return String(name || 'upload.bin').replace(/[^a-zA-Z0-9._()\-\s]/g, '_').slice(0, 180); }
function dataUrlToBuffer(dataUrl = '') { const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/s); if (!m) return null; return { mimeType: m[1], buffer: Buffer.from(m[2], 'base64') }; }
function extractPlainTextIfPossible(filename = '', mimeType = '', buffer) { const ext = path.extname(filename).toLowerCase(); const textual = String(mimeType || '').startsWith('text/') || ['.txt','.csv','.json','.md','.html','.htm','.log'].includes(ext); if (!textual) return ''; try { return buffer.toString('utf8').slice(0, 40000); } catch (_) { return ''; } }
async function processLearningItem(item) {
  const result = await aiProviderManager.generateLearningDraft(item);
  const items = readLearningItems();
  const idx = items.findIndex(x => x.id === item.id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], status: result.ok ? 'pending_review' : 'needs_attention', processedAt: new Date().toISOString(), learningResult: result, draft: result.draft };
    writeLearningItems(items);
  }
  return result;
}

module.exports = function createAiOperationsRoutes() {
  const router = express.Router();

  router.get('/settings', (req, res) => {
    const settings = aiProviderManager.getSettings();
    res.json({ ok: true, settings, runtime: aiProviderManager.providerRuntimeInfo(settings) });
  });

  router.post('/settings', (req, res) => {
    const body = req.body || {};
    const current = aiProviderManager.getSettings();
    const next = aiProviderManager.saveSettings({
      ...current,
      ...body,
      providers: body.providers || current.providers,
      updatedAt: new Date().toISOString()
    });
    res.json({ ok: true, settings: next, runtime: aiProviderManager.providerRuntimeInfo(next) });
  });

  router.post('/provider/:id/mode', (req, res) => {
    const id = String(req.params.id || '').trim();
    const mode = String(req.body?.mode || '').toUpperCase();
    if (!['ACTIVE', 'MONITOR', 'OFF'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be ACTIVE, MONITOR or OFF' });
    const settings = aiProviderManager.getSettings();
    if (!settings.providers[id]) return res.status(404).json({ ok: false, error: 'provider not found' });

    const rolesForMode = mode === 'ACTIVE'
      ? { active: true, monitor: true, learning: true, evaluate: true, propose: true }
      : mode === 'MONITOR'
        ? { active: false, monitor: true, learning: true, evaluate: true, propose: true }
        : { active: false, monitor: false, learning: false, evaluate: false, propose: false };

    if (mode === 'ACTIVE') {
      for (const key of Object.keys(settings.providers)) {
        settings.providers[key].roles = { ...aiProviderManager.normalizeRoles(settings.providers[key]), active: false };
        settings.providers[key].mode = aiProviderManager.modeFromRoles(settings.providers[key].roles);
      }
    }
    settings.providers[id].roles = rolesForMode;
    settings.providers[id].mode = aiProviderManager.modeFromRoles(rolesForMode);
    const next = aiProviderManager.saveSettings(settings);
    res.json({ ok: true, settings: next, runtime: aiProviderManager.providerRuntimeInfo(next) });
  });

  router.post('/provider/:id/role', (req, res) => {
    const id = String(req.params.id || '').trim();
    const role = String(req.body?.role || '').toLowerCase();
    const enabled = req.body?.enabled === true;
    if (!['active', 'monitor', 'learning', 'evaluate', 'propose'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'role must be active, monitor, learning, evaluate or propose' });
    }
    const settings = aiProviderManager.getSettings();
    if (!settings.providers[id]) return res.status(404).json({ ok: false, error: 'provider not found' });

    if (role === 'active' && enabled) {
      // Chỉ một nền tảng được quyền trả lời khách tại một thời điểm.
      for (const key of Object.keys(settings.providers)) {
        settings.providers[key].roles = { ...aiProviderManager.normalizeRoles(settings.providers[key]), active: false };
        settings.providers[key].mode = aiProviderManager.modeFromRoles(settings.providers[key].roles);
      }
    }

    const roles = { ...aiProviderManager.normalizeRoles(settings.providers[id]), [role]: enabled };
    settings.providers[id].roles = roles;
    settings.providers[id].mode = aiProviderManager.modeFromRoles(roles);
    const next = aiProviderManager.saveSettings(settings);
    res.json({ ok: true, settings: next, runtime: aiProviderManager.providerRuntimeInfo(next) });
  });

  router.post('/compare', async (req, res) => {
    try {
      const results = await aiProviderManager.compareModels({ prompt: req.body?.prompt || '', context: req.body?.context || '', includeOff: req.body?.includeOff === true });
      res.json({ ok: true, results });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/monitor', async (req, res) => {
    try {
      const results = await aiProviderManager.monitorCandidate({ context: req.body?.context || '', candidateReply: req.body?.candidateReply || '', meta: req.body?.meta || {} });
      res.json({ ok: true, results });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/reports', (req, res) => {
    res.json({ ok: true, reports: aiProviderManager.readReports({ limit: req.query.limit || 100, level: req.query.level || '', provider: req.query.provider || '', q: req.query.q || '' }) });
  });

  router.post('/teach', (req, res) => {
    aiProviderManager.appendReport({
      type: 'mentor_note',
      level: 'green',
      provider: 'mentor',
      title: req.body?.title || 'Mentor Note',
      lesson: req.body?.lesson || '',
      example: req.body?.example || '',
      tags: req.body?.tags || []
    });
    res.json({ ok: true });
  });


  router.get('/learning/settings', (req, res) => {
    res.json({ ok: true, settings: getLearningSettings() });
  });

  router.post('/learning/settings', (req, res) => {
    const body = req.body || {};
    const settings = saveLearningSettings({
      active: body.active !== undefined ? body.active === true : undefined,
      autoProcess: body.autoProcess !== undefined ? body.autoProcess === true : undefined,
      requireApproval: body.requireApproval !== undefined ? body.requireApproval === true : undefined,
      targetDays: Number(body.targetDays || getLearningSettings().targetDays || 7)
    });
    res.json({ ok: true, settings });
  });

  router.get('/learning/items', (req, res) => {
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').toLowerCase();
    let items = readLearningItems();
    if (status) items = items.filter(x => String(x.status || '') === status);
    if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
    res.json({ ok: true, items: items.slice(0, Number(req.query.limit || 200)), settings: getLearningSettings() });
  });

  router.post('/learning/upload', async (req, res) => {
    try {
      ensureLearningDir();
      const body = req.body || {};
      const parsed = dataUrlToBuffer(body.dataUrl || '');
      if (!parsed) return res.status(400).json({ ok: false, error: 'dataUrl is required. Upload từ giao diện sẽ tự gửi dataUrl.' });
      const filename = cleanFilename(body.filename || 'upload.bin');
      const id = `learn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const storedName = `${id}_${filename}`;
      const filePath = path.join(LEARNING_DIR, storedName);
      fs.writeFileSync(filePath, parsed.buffer);
      const item = {
        id,
        filename,
        storedName,
        mimeType: body.mimeType || parsed.mimeType,
        size: Number(body.size || parsed.buffer.length),
        note: body.note || '',
        sourceType: body.sourceType || 'upload',
        status: 'uploaded',
        createdAt: new Date().toISOString(),
        text: extractPlainTextIfPossible(filename, body.mimeType || parsed.mimeType, parsed.buffer),
        dataUrl: body.dataUrl
      };
      const items = readLearningItems();
      items.unshift({ ...item, dataUrl: undefined, filePath: undefined });
      writeLearningItems(items);

      let learningResult = null;
      const settings = getLearningSettings();
      if (settings.active && settings.autoProcess) {
        learningResult = await processLearningItem(item);
      }
      res.json({ ok: true, item: { ...item, dataUrl: undefined, filePath: undefined }, learningResult });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/learning/item/:id/process', async (req, res) => {
    try {
      const items = readLearningItems();
      const item = items.find(x => x.id === req.params.id);
      if (!item) return res.status(404).json({ ok: false, error: 'item not found' });
      const fullPath = path.join(LEARNING_DIR, item.storedName || '');
      const buffer = fs.existsSync(fullPath) ? fs.readFileSync(fullPath) : null;
      const dataUrl = buffer ? `data:${item.mimeType || 'application/octet-stream'};base64,${buffer.toString('base64')}` : '';
      const result = await processLearningItem({ ...item, dataUrl, text: item.text || '' });
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/learning/item/:id/status', (req, res) => {
    const allowed = ['uploaded','pending_review','approved','rejected','needs_attention'];
    const status = String(req.body?.status || '');
    if (!allowed.includes(status)) return res.status(400).json({ ok: false, error: 'invalid status' });
    const items = readLearningItems();
    const idx = items.findIndex(x => x.id === req.params.id);
    if (idx < 0) return res.status(404).json({ ok: false, error: 'item not found' });
    items[idx] = { ...items[idx], status, adminNote: req.body?.adminNote || items[idx].adminNote || '', reviewedAt: new Date().toISOString() };
    writeLearningItems(items);
    res.json({ ok: true, item: items[idx] });
  });

  return router;
};
