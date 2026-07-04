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

  return router;
};
