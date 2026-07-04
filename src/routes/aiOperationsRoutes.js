const express = require('express');
const aiProviderManager = require('../ai/providerManager');

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
    if (mode === 'ACTIVE') {
      for (const key of Object.keys(settings.providers)) {
        if (settings.providers[key].mode === 'ACTIVE') settings.providers[key].mode = 'MONITOR';
      }
    }
    settings.providers[id].mode = mode;
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

  return router;
};
