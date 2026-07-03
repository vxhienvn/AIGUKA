'use strict';

const express = require('express');
const {
    analyzeMessages,
    rescanMessages,
    getSummary,
    listLeads,
    getLeadDetail,
    debugPhone
} = require('../services/leadTracker/leadTrackerEngine');

function boolParam(value, fallback = true) {
    if (value === undefined) return fallback;
    const v = String(value).toLowerCase();
    if (['false', '0', 'no', 'off'].includes(v)) return false;
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    return fallback;
}

function readScanOptions(req) {
    return {
        limit: req.query.limit || req.body?.limit || 5000,
        since: req.query.since || req.body?.since || null,
        until: req.query.until || req.body?.until || null,
        clear: boolParam(req.query.clear ?? req.body?.clear, true)
    };
}

function createLeadTrackerCoreRoutes() {
    const router = express.Router();

    router.get('/health', (req, res) => {
        res.json({ ok: true, module: 'lead_tracker_core', source: 'messages', tables: ['lt_leads', 'lt_lead_messages', 'lt_evidence', 'lt_sync_runs'] });
    });

    router.get('/analyze', async (req, res) => {
        try {
            const result = await analyzeMessages(readScanOptions(req));
            res.json(result);
        } catch (error) {
            console.error('[LEAD_TRACKER_ANALYZE_ERROR]', error.message);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    router.post('/rescan', async (req, res) => {
        try {
            const result = await rescanMessages(readScanOptions(req));
            res.json(result);
        } catch (error) {
            console.error('[LEAD_TRACKER_RESCAN_ERROR]', error.message);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    router.get('/rescan', async (req, res) => {
        try {
            const result = await rescanMessages(readScanOptions(req));
            res.json(result);
        } catch (error) {
            console.error('[LEAD_TRACKER_RESCAN_ERROR]', error.message);
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    router.get('/summary', async (req, res) => {
        try {
            const summary = await getSummary();
            res.json({ ok: true, summary });
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    router.get('/list', async (req, res) => {
        try {
            const leads = await listLeads({
                limit: req.query.limit,
                offset: req.query.offset,
                since: req.query.since,
                until: req.query.until
            });
            res.json({ ok: true, count: Array.isArray(leads) ? leads.length : 0, leads });
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    router.get('/lead/:id', async (req, res) => {
        try {
            const detail = await getLeadDetail(req.params.id);
            if (!detail) return res.status(404).json({ ok: false, error: 'Không tìm thấy lead' });
            res.json({ ok: true, ...detail });
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    router.get('/debug/:phone', async (req, res) => {
        try {
            const result = await debugPhone(req.params.phone);
            res.json(result);
        } catch (error) {
            res.status(500).json({ ok: false, error: error.message });
        }
    });

    return router;
}

module.exports = createLeadTrackerCoreRoutes;
