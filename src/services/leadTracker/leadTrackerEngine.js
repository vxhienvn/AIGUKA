'use strict';

const {
  normalizePhone,
  extractPhonesFromMessage,
  detectZaloContext
} = require('./phoneExtractor');

const SUPABASE_ENABLED = String(process.env.SUPABASE_ENABLED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function supabaseReady() {
  return Boolean(SUPABASE_ENABLED && SUPABASE_URL && SUPABASE_KEY);
}

function buildHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function sb(path, options = {}) {
  if (!supabaseReady()) throw new Error('Supabase disabled or missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: buildHeaders(options.headers || {})
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
  if (!res.ok) throw new Error(`Supabase ${path} failed ${res.status}: ${raw}`);
  return data;
}

async function sbRpc(name, body = {}) {
  if (!supabaseReady()) throw new Error('Supabase disabled or missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: buildHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body)
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
  if (!res.ok) throw new Error(`Supabase rpc/${name} failed ${res.status}: ${raw}`);
  return data;
}

function intLimit(value, fallback = 5000, max = 20000) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function getMessageText(row) {
  return row.text || row.message_text || row.body || '';
}

function getMessageTime(row) {
  return row.created_at || row.message_time || row.timestamp || null;
}

function messageToExtractorInput(row) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    role: row.role,
    source: row.source,
    text: getMessageText(row),
    created_at: getMessageTime(row)
  };
}

function buildLeadKey(conversationId, phone) {
  return `${conversationId || 'unknown'}|${normalizePhone(phone) || 'unknown'}`;
}

function classifyLead(row, phoneCandidate) {
  const text = getMessageText(row);
  const phone = phoneCandidate.normalized;
  const hasZalo = Boolean(phoneCandidate.hasZalo || detectZaloContext(text));
  return {
    lead_key: buildLeadKey(row.conversation_id, phone),
    conversation_id: String(row.conversation_id || ''),
    sender_id: row.sender_id || null,
    customer_id: row.customer_id || null,
    customer_name: row.customer_name || row.name || null,
    phone,
    phone_normalized: phone,
    zalo: hasZalo ? phone : null,
    contact_type: hasZalo ? 'both' : 'phone',
    lead_level: 1,
    verified: true,
    confidence: phoneCandidate.confidence || 95,
    phone_message_id: row.id || null,
    phone_message_text: text,
    phone_detected_at: getMessageTime(row),
    first_message_at: getMessageTime(row),
    last_message_at: getMessageTime(row),
    ad_id: row.ad_id || null,
    ad_name: row.ad_name || null,
    adset_id: row.adset_id || null,
    adset_name: row.adset_name || null,
    campaign_id: row.campaign_id || null,
    campaign_name: row.campaign_name || null,
    lead_source: 'messages_rescan',
    source_table: 'messages',
    status: 'active',
    raw: {
      message_id: row.id || null,
      source: row.source || null,
      role: row.role || null,
      matched_raw: phoneCandidate.raw || null
    }
  };
}

async function fetchMessages(limit = 5000) {
  // Chỉ lấy các cột thường có; nếu schema thiếu cột nào, fallback select=*
  const max = intLimit(limit, 5000, 20000);
  const query = `messages?select=*&order=created_at.asc&limit=${max}`;
  return await sb(query, { method: 'GET' });
}

function analyzeRows(rows = [], options = {}) {
  const report = {
    messagesScanned: rows.length,
    customerMessages: 0,
    regexHits: 0,
    phonesFound: 0,
    uniquePhones: 0,
    uniqueLeadKeys: 0,
    uniqueConversations: 0,
    duplicates: 0,
    rejected: {
      actor_rejected: 0,
      not_customer_message: 0,
      blacklisted: 0,
      invalid_vietnam_mobile: 0,
      duplicate_in_message: 0,
      other: 0
    },
    leads: [],
    rejectedSamples: []
  };

  const phoneSet = new Set();
  const leadKeySet = new Set();
  const conversationSet = new Set();

  for (const row of rows) {
    const input = messageToExtractorInput(row);
    const result = extractPhonesFromMessage(input, options);

    for (const rej of result.rejected || []) {
      const key = report.rejected[rej.reason] !== undefined ? rej.reason : 'other';
      report.rejected[key] += 1;
      if (report.rejectedSamples.length < 30) {
        report.rejectedSamples.push({
          reason: rej.reason,
          role: input.role,
          source: input.source,
          normalized: rej.normalized || null,
          raw: rej.raw || null,
          text: input.text.slice(0, 180)
        });
      }
    }

    if (input.role === 'customer' || String(input.source || '').includes('customer')) {
      report.customerMessages += 1;
    }

    if (result.candidates.length) {
      report.regexHits += result.candidates.length;
    }

    for (const candidate of result.candidates) {
      report.phonesFound += 1;
      phoneSet.add(candidate.normalized);
      conversationSet.add(String(row.conversation_id || ''));
      const leadKey = buildLeadKey(row.conversation_id, candidate.normalized);
      if (leadKeySet.has(leadKey)) {
        report.duplicates += 1;
        continue;
      }
      leadKeySet.add(leadKey);
      const lead = classifyLead(row, candidate);
      report.leads.push({
        lead_key: lead.lead_key,
        conversation_id: lead.conversation_id,
        sender_id: lead.sender_id,
        customer_name: lead.customer_name,
        phone: lead.phone,
        zalo: lead.zalo,
        contact_type: lead.contact_type,
        confidence: lead.confidence,
        phone_detected_at: lead.phone_detected_at,
        phone_message_text: lead.phone_message_text,
        ad_id: lead.ad_id,
        ad_name: lead.ad_name,
        campaign_id: lead.campaign_id,
        campaign_name: lead.campaign_name,
        evidence_count: 1
      });
    }
  }

  report.uniquePhones = phoneSet.size;
  report.uniqueLeadKeys = leadKeySet.size;
  report.uniqueConversations = conversationSet.size;
  return report;
}

async function analyze({ limit = 5000, blacklist = [] } = {}) {
  const rows = await fetchMessages(limit);
  return analyzeRows(rows, { blacklist });
}

async function createSyncRun() {
  const rows = await sb('lt_sync_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ sync_type: 'messages_rescan', status: 'running', started_at: new Date().toISOString() })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function finishSyncRun(id, payload) {
  if (!id) return null;
  const rows = await sb(`lt_sync_runs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...payload, finished_at: new Date().toISOString() })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function clearLtData() {
  try {
    await sbRpc('lt_clear_all', {});
    return { ok: true, method: 'rpc.lt_clear_all' };
  } catch (error) {
    // Fallback: xóa theo thứ tự phụ thuộc khóa ngoại.
    await sb('lt_evidence?id=not.is.null', { method: 'DELETE' }).catch(() => null);
    await sb('lt_lead_messages?id=not.is.null', { method: 'DELETE' }).catch(() => null);
    await sb('lt_leads?id=not.is.null', { method: 'DELETE' }).catch(() => null);
    return { ok: true, method: 'delete_fallback', warning: error.message };
  }
}

async function insertLeadBundle(lead, originalRow, candidate, syncRunId) {
  const payload = { ...lead, sync_run_id: syncRunId || null };
  const leadRows = await sb('lt_leads?on_conflict=lead_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload)
  });
  const savedLead = Array.isArray(leadRows) ? leadRows[0] : leadRows;
  const leadId = savedLead.id;

  const messagePayload = {
    lead_id: leadId,
    message_id: originalRow.id || null,
    conversation_id: lead.conversation_id,
    sender_id: lead.sender_id,
    role: originalRow.role || null,
    message_text: getMessageText(originalRow),
    message_time: getMessageTime(originalRow),
    contains_phone: true,
    contains_zalo: Boolean(lead.zalo),
    matched_phone: lead.phone_normalized,
    matched_zalo: lead.zalo,
    raw: { source: originalRow.source || null }
  };
  await sb('lt_lead_messages?on_conflict=lead_id,message_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(messagePayload)
  });

  const evidencePayload = {
    lead_id: leadId,
    evidence_type: lead.zalo ? 'both' : 'phone',
    evidence_source: 'messages',
    message_id: originalRow.id || null,
    conversation_id: lead.conversation_id,
    sender_id: lead.sender_id,
    matched_text: candidate.raw || lead.phone,
    evidence_text: getMessageText(originalRow),
    evidence_time: getMessageTime(originalRow),
    confidence: lead.confidence,
    raw: { source: originalRow.source || null, role: originalRow.role || null }
  };
  await sb('lt_evidence', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(evidencePayload)
  });

  return savedLead;
}

async function rescan({ limit = 5000, blacklist = [] } = {}) {
  const syncRun = await createSyncRun();
  try {
    await clearLtData();
    const rows = await fetchMessages(limit);
    const analysis = analyzeRows(rows, { blacklist });
    const leadKeySet = new Set();
    const savedLeads = [];

    for (const row of rows) {
      const input = messageToExtractorInput(row);
      const result = extractPhonesFromMessage(input, { blacklist });
      for (const candidate of result.candidates) {
        const leadKey = buildLeadKey(row.conversation_id, candidate.normalized);
        if (leadKeySet.has(leadKey)) continue;
        leadKeySet.add(leadKey);
        const lead = classifyLead(row, candidate);
        const saved = await insertLeadBundle(lead, row, candidate, syncRun.id);
        savedLeads.push({
          id: saved.id,
          lead_key: saved.lead_key,
          conversation_id: saved.conversation_id,
          sender_id: saved.sender_id,
          phone: saved.phone_normalized,
          zalo: saved.zalo,
          contact_type: saved.contact_type,
          confidence: saved.confidence,
          phone_detected_at: saved.phone_detected_at,
          phone_message_text: saved.phone_message_text
        });
      }
    }

    await finishSyncRun(syncRun.id, {
      status: 'success',
      messages_scanned: analysis.messagesScanned,
      conversations_scanned: analysis.uniqueConversations,
      leads_created: savedLeads.length,
      evidence_created: savedLeads.length,
      meta: analysis
    });

    return {
      ok: true,
      source: 'messages',
      sync_run_id: syncRun.id,
      stats: {
        messagesScanned: analysis.messagesScanned,
        customerMessages: analysis.customerMessages,
        regexHits: analysis.regexHits,
        phonesFound: analysis.phonesFound,
        uniquePhones: analysis.uniquePhones,
        uniqueLeadKeys: analysis.uniqueLeadKeys,
        uniqueConversations: analysis.uniqueConversations,
        duplicates: analysis.duplicates,
        rejected: analysis.rejected,
        leadsCreated: savedLeads.length,
        evidenceCreated: savedLeads.length
      },
      leads: savedLeads
    };
  } catch (error) {
    await finishSyncRun(syncRun.id, { status: 'error', error_message: error.message }).catch(() => null);
    throw error;
  }
}

async function summary() {
  const rows = await sb('v_lt_lead_summary?select=*', { method: 'GET' });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function listLeads({ limit = 100, offset = 0 } = {}) {
  const l = intLimit(limit, 100, 1000);
  const o = Math.max(parseInt(offset, 10) || 0, 0);
  return await sb(`lt_leads?select=*&status=eq.active&order=phone_detected_at.desc&limit=${l}&offset=${o}`, { method: 'GET' });
}

async function getLead(id) {
  const leads = await sb(`lt_leads?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'GET' });
  const lead = Array.isArray(leads) ? leads[0] : null;
  if (!lead) return null;
  const evidence = await sb(`lt_evidence?lead_id=eq.${encodeURIComponent(id)}&select=*&order=evidence_time.asc`, { method: 'GET' });
  const messages = await sb(`lt_lead_messages?lead_id=eq.${encodeURIComponent(id)}&select=*&order=message_time.asc`, { method: 'GET' });
  return { lead, evidence, messages };
}

async function debugPhone(phone, { limit = 5000 } = {}) {
  const normalized = normalizePhone(phone);
  const rows = await fetchMessages(limit);
  const hits = [];
  const rejected = [];
  for (const row of rows) {
    const input = messageToExtractorInput(row);
    const result = extractPhonesFromMessage(input, {});
    for (const c of result.candidates) {
      if (!normalized || c.normalized === normalized) {
        hits.push({
          matched: c,
          message: {
            id: row.id,
            conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            role: row.role,
            source: row.source,
            created_at: getMessageTime(row),
            text: getMessageText(row)
          },
          accepted: true,
          reason: 'customer_valid_phone'
        });
      }
    }
    for (const r of result.rejected || []) {
      if (!normalized || r.normalized === normalized) {
        rejected.push({
          rejected: r,
          message: {
            id: row.id,
            conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            role: row.role,
            source: row.source,
            created_at: getMessageTime(row),
            text: getMessageText(row)
          },
          accepted: false
        });
      }
    }
  }
  return { phone: normalized || null, hits, rejected, count: hits.length, rejectedCount: rejected.length };
}

module.exports = {
  analyze,
  rescan,
  summary,
  listLeads,
  getLead,
  debugPhone,
  analyzeRows,
  fetchMessages
};
