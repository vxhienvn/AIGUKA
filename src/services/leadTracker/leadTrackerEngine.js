'use strict';

const {
  normalizePhone,
  extractPhonesFromMessage,
  detectZaloContext,
  actorKind
} = require('./phoneExtractor');
const { classifyLeadText, classifyLeadConversation } = require('./leadClassifier');
const {
  buildCustomerMapsFromRows,
  mergeCustomerRecords,
  resolveCustomerName,
  pickFirst,
  clean
} = require('./customerResolver');
const { buildConversations, conversationSummary, getMessageText, getMessageTime } = require('./conversationBuilder');
const { buildTimelineEvents } = require('./timelineBuilder');

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
    const rows = await sb('lt_phone_blacklist?select=phone_normalized,is_active,type&is_active=eq.true', { method: 'GET' });
    for (const row of rows || []) {
      if (row.phone_normalized) phones.add(normalizePhone(row.phone_normalized));
    }
  } catch (_) {}
  return [...phones];
}

async function enrichCustomerMaps(rows = []) {
  const maps = buildCustomerMapsFromRows(rows);
  try {
    const customers = await sb('customers?select=*&limit=5000', { method: 'GET' });
    mergeCustomerRecords(maps, customers, 'customers');
  } catch (_) {}
  try {
    const conversations = await sb('conversations?select=*&limit=5000', { method: 'GET' });
    mergeCustomerRecords(maps, conversations, 'conversations');
  } catch (_) {}
  return maps;
}

function emptyReport(rows = []) {
  return {
    messagesScanned: rows.length,
    conversationsScanned: 0,
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
    rejectedSamples: [],
    productSummary: {},
    intentSummary: {},
    highScoreLeads: 0,
    needCallback: 0,
    needQuotation: 0,
    needSample: 0
  };
}

function addCount(obj, key) {
  const k = key || 'unknown';
  obj[k] = (obj[k] || 0) + 1;
}

function getConversationForRow(row, conversations) {
  return conversations.get(String(row.conversation_id || 'unknown_conversation')) || null;
}

function classifyLead(row, phoneCandidate, maps, conversation = null) {
  const text = getMessageText(row);
  const phone = phoneCandidate.normalized;
  const hasZalo = Boolean(phoneCandidate.hasZalo || detectZaloContext(text) || detectZaloContext(conversation?.customerText || ''));
  const time = getMessageTime(row);
  const conversationText = conversation ? (conversation.customerText || conversation.fullText || '') : text;
  const intelligence = classifyLeadConversation(conversationText, text, phoneCandidate.score || phoneCandidate.confidence || 95);
  const customerName = conversation?.customer_name || resolveCustomerName(row, maps);

  return {
    lead_key: buildLeadKey(row.conversation_id, phone),
    conversation_id: String(row.conversation_id || ''),
    sender_id: row.sender_id || conversation?.sender_id || null,
    customer_id: row.customer_id || conversation?.customer_id || null,
    customer_name: customerName || 'unknown_customer',
    phone,
    phone_normalized: phone,
    zalo: hasZalo ? phone : null,
    contact_type: hasZalo ? 'both' : 'phone',
    lead_level: 1,
    verified: true,
    confidence: phoneCandidate.confidence || 95,
    lead_score: intelligence.lead_score || phoneCandidate.score || phoneCandidate.confidence || 95,

    intent: intelligence.intent,
    product_group: intelligence.product_group,
    product_label: intelligence.product_label,
    quantity: intelligence.quantity,
    location_text: intelligence.location,
    has_address_signal: intelligence.has_address_signal,
    need_callback: intelligence.need_callback,
    need_quotation: intelligence.need_quotation,
    need_sample: intelligence.need_sample,
    intelligence_summary: intelligence.summary || conversationSummary(conversation),

    phone_message_id: row.id || null,
    phone_message_text: text,
    phone_detected_at: time,
    first_message_at: conversation?.firstMessageAt || time,
    last_message_at: conversation?.lastMessageAt || time,
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
      matched_raw: phoneCandidate.raw || null,
      intelligence,
      conversation_summary: conversationSummary(conversation),
      conversation_counts: conversation?.counts || null,
      analyzed_scope: 'full_conversation'
    }
  };
}

function analyzeRows(rows = [], options = {}, maps = {}) {
  const report = emptyReport(rows);
  const conversations = buildConversations(rows, maps);
  report.conversationsScanned = conversations.size;

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
          text: String(input.text || '').slice(0, 220)
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
      const conversation = getConversationForRow(row, conversations);
      const lead = classifyLead(row, candidate, maps, conversation);
      addCount(report.productSummary, lead.product_group || 'unknown');
      addCount(report.intentSummary, lead.intent || 'unknown');
      if (Number(lead.lead_score || 0) >= 95) report.highScoreLeads += 1;
      if (lead.need_callback) report.needCallback += 1;
      if (lead.need_quotation) report.needQuotation += 1;
      if (lead.need_sample) report.needSample += 1;
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
        first_message_at: lead.first_message_at,
        last_message_at: lead.last_message_at,
        intent: lead.intent,
        product_group: lead.product_group,
        product_label: lead.product_label,
        quantity: lead.quantity,
        location_text: lead.location_text,
        need_callback: lead.need_callback,
        need_quotation: lead.need_quotation,
        need_sample: lead.need_sample,
        intelligence_summary: lead.intelligence_summary,
        conversation_counts: conversation?.counts || null,
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
    await sb('lt_ai_analysis?id=not.is.null', { method: 'DELETE' }).catch(() => null);
    await sb('lt_evidence?id=not.is.null', { method: 'DELETE' }).catch(() => null);
    await sb('lt_lead_messages?id=not.is.null', { method: 'DELETE' }).catch(() => null);
    await sb('lt_timeline_events?id=not.is.null', { method: 'DELETE' }).catch(() => null);
    await sb('lt_leads?id=not.is.null', { method: 'DELETE' }).catch(() => null);
    return { ok: true, method: 'delete_fallback', warning: error.message };
  }
}

async function insertLeadMessage(leadId, lead, msg, extraction) {
  const messagePayload = {
    lead_id: leadId,
    message_id: msg.id || null,
    conversation_id: lead.conversation_id,
    sender_id: msg.sender_id || lead.sender_id || null,
    role: msg.role || null,
    message_text: msg.text || '',
    message_time: msg.created_at || null,
    contains_phone: Boolean(extraction?.candidates?.length),
    contains_zalo: Boolean(detectZaloContext(msg.text || '')),
    matched_phone: extraction?.candidates?.[0]?.normalized || null,
    matched_zalo: detectZaloContext(msg.text || '') ? (extraction?.candidates?.[0]?.normalized || lead.zalo || null) : null,
    raw: { source: msg.source || null, actor_kind: msg.actorKind || actorKind(msg.role, msg.source) }
  };
  if (!messagePayload.message_id) return null;
  return await sb('lt_lead_messages?on_conflict=lead_id,message_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(messagePayload)
  }).catch(() => null);
}

async function insertTimelineEvent(leadId, lead, ev) {
  const payload = {
    lead_id: leadId,
    conversation_id: lead.conversation_id,
    event_type: ev.event_type,
    event_time: ev.event_time,
    actor_role: ev.actor_role,
    actor_source: ev.actor_source,
    message_id: ev.message_id,
    event_text: ev.event_text,
    raw: { actor_kind: ev.actor_kind, phones: ev.extraction?.candidates || [], rejected: ev.extraction?.rejected || [] }
  };
  return await sb('lt_timeline_events', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  }).catch(() => null);
}

async function insertLeadBundle(lead, originalRow, candidate, syncRunId, conversation = null, activeBlacklist = []) {
  const payload = { ...lead, sync_run_id: syncRunId || null };
  const leadRows = await sb('lt_leads?on_conflict=lead_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload)
  });
  const savedLead = Array.isArray(leadRows) ? leadRows[0] : leadRows;
  const leadId = savedLead.id;

  const convMessages = conversation?.messages || [{
    id: originalRow.id || null,
    conversation_id: lead.conversation_id,
    sender_id: lead.sender_id,
    role: originalRow.role || null,
    source: originalRow.source || null,
    actorKind: actorKind(originalRow.role, originalRow.source),
    created_at: getMessageTime(originalRow),
    text: getMessageText(originalRow)
  }];

  for (const msg of convMessages) {
    const extraction = extractPhonesFromMessage({
      id: msg.id,
      conversation_id: msg.conversation_id,
      sender_id: msg.sender_id,
      role: msg.role,
      source: msg.source,
      text: msg.text,
      created_at: msg.created_at
    }, { blacklist: activeBlacklist });
    await insertLeadMessage(leadId, lead, msg, extraction);
  }

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
    raw: { source: originalRow.source || null, role: originalRow.role || null, score: lead.lead_score, analyzed_scope: 'full_conversation' }
  };
  await sb('lt_evidence', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(evidencePayload)
  });

  const timeline = buildTimelineEvents(conversation || null, { blacklist: activeBlacklist });
  if (timeline.length) {
    for (const ev of timeline) await insertTimelineEvent(leadId, lead, ev);
  } else {
    await insertTimelineEvent(leadId, lead, {
      event_type: 'phone_shared',
      event_time: getMessageTime(originalRow),
      actor_role: originalRow.role || null,
      actor_source: originalRow.source || null,
      actor_kind: actorKind(originalRow.role, originalRow.source),
      message_id: originalRow.id || null,
      event_text: getMessageText(originalRow),
      extraction: { candidates: [candidate], rejected: [] }
    });
  }

  const intelligence = lead.raw?.intelligence || classifyLeadConversation(conversation?.customerText || getMessageText(originalRow), getMessageText(originalRow), lead.lead_score || lead.confidence || 95);
  const aiPayload = {
    lead_id: leadId,
    conversation_id: lead.conversation_id,
    sender_id: lead.sender_id,
    analysis_source: 'rule_engine_full_conversation',
    model_name: 'aiguka-rule-lt-03',
    intent: intelligence.intent || lead.intent || null,
    product_group: intelligence.product_group || lead.product_group || null,
    product_label: intelligence.product_label || lead.product_label || null,
    quantity: intelligence.quantity || lead.quantity || null,
    location_text: intelligence.location || lead.location_text || null,
    has_address_signal: Boolean(intelligence.has_address_signal || lead.has_address_signal),
    need_callback: Boolean(intelligence.need_callback || lead.need_callback),
    need_quotation: Boolean(intelligence.need_quotation || lead.need_quotation),
    need_sample: Boolean(intelligence.need_sample || lead.need_sample),
    lead_score: lead.lead_score,
    summary: intelligence.summary || lead.intelligence_summary || null,
    signals: intelligence.signals || [],
    raw: {
      source: originalRow.source || null,
      message_id: originalRow.id || null,
      analyzed_scope: 'full_conversation',
      conversation_summary: conversationSummary(conversation),
      conversation_counts: conversation?.counts || null
    }
  };
  await sb('lt_ai_analysis?on_conflict=lead_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(aiPayload)
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
    const conversations = buildConversations(rows, maps);
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
        const conversation = getConversationForRow(row, conversations);
        const lead = classifyLead(row, candidate, maps, conversation);
        const saved = await insertLeadBundle(lead, row, candidate, syncRun.id, conversation, activeBlacklist);
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
          phone_message_text: saved.phone_message_text,
          first_message_at: saved.first_message_at,
          last_message_at: saved.last_message_at,
          intent: saved.intent,
          product_group: saved.product_group,
          product_label: saved.product_label,
          location_text: saved.location_text,
          need_callback: saved.need_callback,
          need_quotation: saved.need_quotation,
          need_sample: saved.need_sample,
          intelligence_summary: saved.intelligence_summary
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
      mode: 'full_conversation',
      sync_run_id: syncRun.id,
      stats: {
        messagesScanned: analysis.messagesScanned,
        conversationsScanned: analysis.conversationsScanned,
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

async function intelligenceSummary() {
  const basicRows = await sb('v_lt_lead_summary?select=*', { method: 'GET' }).catch(() => []);
  const intelRows = await sb('v_lt_intelligence_summary?select=*', { method: 'GET' }).catch(() => []);
  const productRows = await sb('v_lt_product_summary?select=*&order=total_leads.desc', { method: 'GET' }).catch(() => []);
  return {
    basic: Array.isArray(basicRows) ? basicRows[0] : basicRows,
    intelligence: Array.isArray(intelRows) ? intelRows[0] : intelRows,
    products: productRows || []
  };
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
  const aiAnalysis = await sb(`lt_ai_analysis?lead_id=eq.${encodeURIComponent(id)}&select=*`, { method: 'GET' }).catch(() => []);
  return { lead, evidence, messages, timeline, aiAnalysis: Array.isArray(aiAnalysis) ? aiAnalysis[0] || null : aiAnalysis };
}

async function debugPhone(phone, { limit = 5000 } = {}) {
  const normalized = normalizePhone(phone);
  const rows = await fetchMessages(limit);
  const maps = await enrichCustomerMaps(rows);
  const conversations = buildConversations(rows, maps);
  const activeBlacklist = await fetchActiveBlacklist([]);
  const hits = [];
  const rejected = [];
  for (const row of rows) {
    const input = messageToExtractorInput(row);
    const result = extractPhonesFromMessage(input, { blacklist: activeBlacklist });
    for (const c of result.candidates) {
      if (!normalized || c.normalized === normalized) {
        const conv = getConversationForRow(row, conversations);
        hits.push({
          matched: c,
          message: {
            id: row.id,
            conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            customer_name: resolveCustomerName(row, maps),
            role: row.role,
            source: row.source,
            actorKind: actorKind(row.role, row.source),
            created_at: getMessageTime(row),
            text: getMessageText(row)
          },
          conversation: conv ? { count: conv.counts, firstMessageAt: conv.firstMessageAt, lastMessageAt: conv.lastMessageAt, customerName: conv.customer_name } : null,
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
            customer_name: resolveCustomerName(row, maps),
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

  // Bổ sung tìm trong lt_* nếu đã rescan.
  const leadMatches = normalized ? await sb(`lt_leads?or=(phone_normalized.eq.${encodeURIComponent(normalized)},phone.eq.${encodeURIComponent(normalized)},zalo.eq.${encodeURIComponent(normalized)})&select=*`, { method: 'GET' }).catch(() => []) : [];
  const evidenceMatches = normalized ? await sb(`lt_evidence?matched_text=ilike.*${encodeURIComponent(normalized)}*&select=*`, { method: 'GET' }).catch(() => []) : [];

  return { phone: normalized || null, hits, rejected, leadMatches, evidenceMatches, count: hits.length, rejectedCount: rejected.length };
}

async function debugConversation(conversationId, { limit = 300 } = {}) {
  const cid = String(conversationId || '').trim();
  if (!cid) throw new Error('conversation_id_required');
  const rows = await fetchMessages(limit, `conversation_id=eq.${encodeURIComponent(cid)}`);
  const maps = await enrichCustomerMaps(rows);
  const activeBlacklist = await fetchActiveBlacklist([]);
  const conversations = buildConversations(rows, maps);
  const conv = conversations.get(cid);
  const timeline = (conv?.messages || []).map(msg => {
    const extraction = extractPhonesFromMessage({
      id: msg.id,
      conversation_id: msg.conversation_id,
      sender_id: msg.sender_id,
      role: msg.role,
      source: msg.source,
      text: msg.text,
      created_at: msg.created_at
    }, { blacklist: activeBlacklist });
    return {
      id: msg.id,
      conversation_id: msg.conversation_id,
      sender_id: msg.sender_id,
      customer_name: conv?.customer_name || null,
      role: msg.role,
      source: msg.source,
      actorKind: msg.actorKind,
      created_at: msg.created_at,
      text: msg.text,
      phones: extraction.candidates,
      rejected: extraction.rejected
    };
  });
  const leads = await sb(`lt_leads?conversation_id=eq.${encodeURIComponent(cid)}&select=*&order=phone_detected_at.asc`, { method: 'GET' }).catch(() => []);
  const analysis = conv ? classifyLeadConversation(conv.customerText || conv.fullText, '', 80) : null;
  return { conversation_id: cid, customer_name: conv?.customer_name || null, count: timeline.length, counts: conv?.counts || null, summary: conversationSummary(conv), analysis, leads, timeline };
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
  intelligenceSummary,
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
