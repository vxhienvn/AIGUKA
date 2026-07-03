'use strict';

const {
  normalizePhone,
  extractPhonesFromMessage,
  detectZaloContext,
  actorKind
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

function pickFirst(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
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

async function fetchMessages(limit = 5000, where = '') {
  const max = intLimit(limit, 5000, 20000);
  const prefix = where ? `messages?${where}&` : 'messages?';
  const query = `${prefix}select=*&order=created_at.asc&limit=${max}`;
  return await sb(query, { method: 'GET' });
}

async function fetchActiveBlacklist(extra = []) {
  const phones = new Set((extra || []).map(normalizePhone).filter(Boolean));
  try {
    const rows = await sb('lt_phone_blacklist?select=phone_normalized,is_active&type=not.eq.deleted&is_active=eq.true', { method: 'GET' });
    for (const row of rows || []) {
      if (row.phone_normalized) phones.add(normalizePhone(row.phone_normalized));
    }
  } catch (_) {
    // Bảng blacklist là LT-02.4. Nếu chưa chạy SQL patch thì vẫn dùng env/default trong extractor.
  }
  return [...phones];
}

function resolveCustomerNameFromRow(row) {
  return pickFirst(row, [
    'customer_name', 'sender_name', 'display_name', 'name', 'full_name',
    'customer_full_name', 'profile_name', 'from_name'
  ]);
}

function buildMaps(rows) {
  const bySender = new Map();
  const byCustomer = new Map();
  const byConversation = new Map();
  for (const row of rows || []) {
    const name = resolveCustomerNameFromRow(row);
    if (!name) continue;
    if (row.sender_id && !bySender.has(String(row.sender_id))) bySender.set(String(row.sender_id), name);
    if (row.customer_id && !byCustomer.has(String(row.customer_id))) byCustomer.set(String(row.customer_id), name);
    if (row.conversation_id && !byConversation.has(String(row.conversation_id))) byConversation.set(String(row.conversation_id), name);
  }
  return { bySender, byCustomer, byConversation };
}

async function enrichCustomerMaps(rows = []) {
  const maps = buildMaps(rows);
  // Best-effort từ customers/conversations. Không phụ thuộc bảng này; lỗi thì bỏ qua.
  try {
    const customers = await sb('customers?select=*&limit=5000', { method: 'GET' });
    for (const c of customers || []) {
      const name = pickFirst(c, ['customer_name', 'name', 'full_name', 'display_name', 'profile_name']);
      if (!name) continue;
      for (const k of ['id', 'customer_id', 'sender_id', 'psid', 'fbid']) {
        if (c[k] && !maps.bySender.has(String(c[k]))) maps.bySender.set(String(c[k]), name);
        if (c[k] && !maps.byCustomer.has(String(c[k]))) maps.byCustomer.set(String(c[k]), name);
      }
    }
  } catch (_) {}

  try {
    const conversations = await sb('conversations?select=*&limit=5000', { method: 'GET' });
    for (const c of conversations || []) {
      const name = pickFirst(c, ['customer_name', 'name', 'full_name', 'display_name', 'profile_name']);
      if (!name) continue;
      if (c.id && !maps.byConversation.has(String(c.id))) maps.byConversation.set(String(c.id), name);
      if (c.conversation_id && !maps.byConversation.has(String(c.conversation_id))) maps.byConversation.set(String(c.conversation_id), name);
      if (c.sender_id && !maps.bySender.has(String(c.sender_id))) maps.bySender.set(String(c.sender_id), name);
    }
  } catch (_) {}
  return maps;
}

function resolveCustomerName(row, maps = {}) {
  return resolveCustomerNameFromRow(row)
    || (row.sender_id ? maps.bySender?.get(String(row.sender_id)) : null)
    || (row.customer_id ? maps.byCustomer?.get(String(row.customer_id)) : null)
    || (row.conversation_id ? maps.byConversation?.get(String(row.conversation_id)) : null)
    || null;
}

function classifyLead(row, phoneCandidate, maps) {
  const text = getMessageText(row);
  const phone = phoneCandidate.normalized;
  const hasZalo = Boolean(phoneCandidate.hasZalo || detectZaloContext(text));
  const time = getMessageTime(row);
  return {
    lead_key: buildLeadKey(row.conversation_id, phone),
    conversation_id: String(row.conversation_id || ''),
    sender_id: row.sender_id || null,
    customer_id: row.customer_id || null,
    customer_name: resolveCustomerName(row, maps),
    phone,
    phone_normalized: phone,
    zalo: hasZalo ? phone : null,
    contact_type: hasZalo ? 'both' : 'phone',
    lead_level: 1,
    verified: true,
    confidence: phoneCandidate.confidence || 95,
    lead_score: phoneCandidate.score || phoneCandidate.confidence || 95,
    phone_message_id: row.id || null,
    phone_message_text: text,
    phone_detected_at: time,
    first_message_at: time,
    last_message_at: time,
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
      actor_kind: actorKind(row.role, row.source),
      matched_raw: phoneCandidate.raw || null
    }
  };
}

function emptyReport(rows = []) {
  return {
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
      empty_after_normalize: 0,
      other: 0
    },
    rejectedByActor: {},
    rejectedBySource: {},
    acceptedBySource: {},
    leads: [],
    rejectedSamples: []
  };
}

function addCount(obj, key) {
  const k = key || 'unknown';
  obj[k] = (obj[k] || 0) + 1;
}

function analyzeRows(rows = [], options = {}, maps = {}) {
  const report = emptyReport(rows);
  const phoneSet = new Set();
  const leadKeySet = new Set();
  const conversationSet = new Set();

  for (const row of rows) {
    const input = messageToExtractorInput(row);
    const kind = actorKind(input.role, input.source);
    const result = extractPhonesFromMessage(input, options);

    if (kind === 'customer') report.customerMessages += 1;

    for (const rej of result.rejected || []) {
      const key = report.rejected[rej.reason] !== undefined ? rej.reason : 'other';
      report.rejected[key] += 1;
      addCount(report.rejectedByActor, rej.actorKind || kind);
      addCount(report.rejectedBySource, input.source || 'unknown');
      if (report.rejectedSamples.length < 50) {
        report.rejectedSamples.push({
          reason: rej.reason,
          actorKind: rej.actorKind || kind,
          role: input.role,
          source: input.source,
          normalized: rej.normalized || null,
          raw: rej.raw || null,
          text: input.text.slice(0, 220)
        });
      }
    }

    if (result.candidates.length) report.regexHits += result.candidates.length;

    for (const candidate of result.candidates) {
      report.phonesFound += 1;
      addCount(report.acceptedBySource, input.source || 'unknown');
      phoneSet.add(candidate.normalized);
      conversationSet.add(String(row.conversation_id || ''));
      const leadKey = buildLeadKey(row.conversation_id, candidate.normalized);
      if (leadKeySet.has(leadKey)) {
        report.duplicates += 1;
        continue;
      }
      leadKeySet.add(leadKey);
      const lead = classifyLead(row, candidate, maps);
      report.leads.push({
        lead_key: lead.lead_key,
        conversation_id: lead.conversation_id,
        sender_id: lead.sender_id,
        customer_name: lead.customer_name,
        phone: lead.phone,
        zalo: lead.zalo,
        contact_type: lead.contact_type,
        confidence: lead.confidence,
        lead_score: lead.lead_score,
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
  const maps = await enrichCustomerMaps(rows);
  const activeBlacklist = await fetchActiveBlacklist(blacklist);
  return analyzeRows(rows, { blacklist: activeBlacklist }, maps);
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
    await sb('lt_evidence?id=not.is.null', { method: 'DELETE' }).catch(() => null);
    await sb('lt_lead_messages?id=not.is.null', { method: 'DELETE' }).catch(() => null);
    await sb('lt_timeline_events?id=not.is.null', { method: 'DELETE' }).catch(() => null);
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
    raw: { source: originalRow.source || null, actor_kind: actorKind(originalRow.role, originalRow.source) }
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
    raw: { source: originalRow.source || null, role: originalRow.role || null, score: lead.lead_score }
  };
  await sb('lt_evidence', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(evidencePayload)
  });

  const timelinePayload = {
    lead_id: leadId,
    conversation_id: lead.conversation_id,
    event_type: 'lead_detected',
    event_time: getMessageTime(originalRow),
    actor_role: originalRow.role || null,
    actor_source: originalRow.source || null,
    message_id: originalRow.id || null,
    event_text: getMessageText(originalRow),
    raw: { phone: lead.phone_normalized, contact_type: lead.contact_type }
  };
  await sb('lt_timeline_events', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(timelinePayload)
  }).catch(() => null);

  return savedLead;
}

async function insertScanStatistics(syncRunId, analysis, status = 'success', durationMs = null, errorMessage = null) {
  const payload = {
    sync_run_id: syncRunId || null,
    status,
    messages_scanned: analysis?.messagesScanned || 0,
    customer_messages: analysis?.customerMessages || 0,
    regex_hits: analysis?.regexHits || 0,
    phones_found: analysis?.phonesFound || 0,
    unique_phones: analysis?.uniquePhones || 0,
    unique_lead_keys: analysis?.uniqueLeadKeys || 0,
    unique_conversations: analysis?.uniqueConversations || 0,
    duplicates: analysis?.duplicates || 0,
    rejected: analysis?.rejected || {},
    rejected_by_actor: analysis?.rejectedByActor || {},
    rejected_by_source: analysis?.rejectedBySource || {},
    accepted_by_source: analysis?.acceptedBySource || {},
    duration_ms: durationMs,
    error_message: errorMessage
  };
  return await sb('lt_scan_statistics', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  }).catch(() => null);
}

async function rescan({ limit = 5000, blacklist = [] } = {}) {
  const start = Date.now();
  const syncRun = await createSyncRun();
  try {
    await clearLtData();
    const rows = await fetchMessages(limit);
    const maps = await enrichCustomerMaps(rows);
    const activeBlacklist = await fetchActiveBlacklist(blacklist);
    const analysis = analyzeRows(rows, { blacklist: activeBlacklist }, maps);
    const leadKeySet = new Set();
    const savedLeads = [];

    for (const row of rows) {
      const input = messageToExtractorInput(row);
      const result = extractPhonesFromMessage(input, { blacklist: activeBlacklist });
      for (const candidate of result.candidates) {
        const leadKey = buildLeadKey(row.conversation_id, candidate.normalized);
        if (leadKeySet.has(leadKey)) continue;
        leadKeySet.add(leadKey);
        const lead = classifyLead(row, candidate, maps);
        const saved = await insertLeadBundle(lead, row, candidate, syncRun.id);
        savedLeads.push({
          id: saved.id,
          lead_key: saved.lead_key,
          conversation_id: saved.conversation_id,
          sender_id: saved.sender_id,
          customer_name: saved.customer_name,
          phone: saved.phone_normalized,
          zalo: saved.zalo,
          contact_type: saved.contact_type,
          confidence: saved.confidence,
          lead_score: saved.lead_score,
          phone_detected_at: saved.phone_detected_at,
          phone_message_text: saved.phone_message_text
        });
      }
    }

    const durationMs = Date.now() - start;
    await finishSyncRun(syncRun.id, {
      status: 'success',
      messages_scanned: analysis.messagesScanned,
      conversations_scanned: analysis.uniqueConversations,
      leads_created: savedLeads.length,
      evidence_created: savedLeads.length,
      meta: analysis
    });
    await insertScanStatistics(syncRun.id, analysis, 'success', durationMs);

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
        rejectedByActor: analysis.rejectedByActor,
        rejectedBySource: analysis.rejectedBySource,
        leadsCreated: savedLeads.length,
        evidenceCreated: savedLeads.length,
        durationMs
      },
      leads: savedLeads
    };
  } catch (error) {
    await finishSyncRun(syncRun.id, { status: 'error', error_message: error.message }).catch(() => null);
    await insertScanStatistics(syncRun.id, null, 'error', Date.now() - start, error.message);
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
  const timeline = await sb(`lt_timeline_events?lead_id=eq.${encodeURIComponent(id)}&select=*&order=event_time.asc`, { method: 'GET' }).catch(() => []);
  return { lead, evidence, messages, timeline };
}

async function debugPhone(phone, { limit = 5000 } = {}) {
  const normalized = normalizePhone(phone);
  const rows = await fetchMessages(limit);
  const activeBlacklist = await fetchActiveBlacklist([]);
  const hits = [];
  const rejected = [];
  for (const row of rows) {
    const input = messageToExtractorInput(row);
    const result = extractPhonesFromMessage(input, { blacklist: activeBlacklist });
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
            actorKind: actorKind(row.role, row.source),
            created_at: getMessageTime(row),
            text: getMessageText(row)
          },
          accepted: true,
          reason: 'customer_valid_phone'
        });
      }
    }
    for (const r of result.rejected || []) {
      if (!normalized || r.normalized === normalized || r.raw === phone) {
        rejected.push({
          rejected: r,
          message: {
            id: row.id,
            conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            role: row.role,
            source: row.source,
            actorKind: actorKind(row.role, row.source),
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

async function debugConversation(conversationId, { limit = 300 } = {}) {
  const cid = String(conversationId || '').trim();
  if (!cid) throw new Error('conversation_id_required');
  const rows = await fetchMessages(limit, `conversation_id=eq.${encodeURIComponent(cid)}`);
  const activeBlacklist = await fetchActiveBlacklist([]);
  const timeline = rows.map(row => {
    const input = messageToExtractorInput(row);
    const extraction = extractPhonesFromMessage(input, { blacklist: activeBlacklist });
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      role: row.role,
      source: row.source,
      actorKind: actorKind(row.role, row.source),
      created_at: getMessageTime(row),
      text: getMessageText(row),
      phones: extraction.candidates,
      rejected: extraction.rejected
    };
  });
  const leads = await sb(`lt_leads?conversation_id=eq.${encodeURIComponent(cid)}&select=*&order=phone_detected_at.asc`, { method: 'GET' }).catch(() => []);
  return { conversation_id: cid, count: timeline.length, leads, timeline };
}

async function latestStats(limit = 20) {
  const l = intLimit(limit, 20, 100);
  return await sb(`lt_scan_statistics?select=*&order=created_at.desc&limit=${l}`, { method: 'GET' }).catch(() => []);
}

async function listBlacklist() {
  return await sb('lt_phone_blacklist?select=*&order=created_at.desc', { method: 'GET' });
}

async function addBlacklist(phone, payload = {}) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('invalid_phone');
  const body = {
    phone: String(phone || ''),
    phone_normalized: normalized,
    type: payload.type || 'manual',
    label: payload.label || null,
    note: payload.note || null,
    is_active: payload.is_active !== false
  };
  const rows = await sb('lt_phone_blacklist?on_conflict=phone_normalized', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

module.exports = {
  analyze,
  rescan,
  summary,
  listLeads,
  getLead,
  debugPhone,
  debugConversation,
  latestStats,
  listBlacklist,
  addBlacklist,
  analyzeRows,
  fetchMessages
};
