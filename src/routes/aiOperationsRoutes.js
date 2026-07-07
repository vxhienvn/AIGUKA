const express = require('express');
const fs = require('fs');
const path = require('path');
const aiProviderManager = require('../ai/providerManager');
const { buildProductObjectContextForMessage, resolveProductObjects, parseProductFromSegment, answerProductQuery } = require('../ai/productObjectService');
const { searchKnowledge, inferKnowledgeType, detectProductId } = require('../ai/knowledgeEngine');
const crypto = require('crypto');
let XLSX = null;
try { XLSX = require('xlsx'); } catch (_) { XLSX = null; }

const ROOT_DIR = path.join(__dirname, '..', '..');
const LEARNING_DIR = path.join(ROOT_DIR, 'ai_learning_uploads');
const LEARNING_ITEMS_FILE = path.join(ROOT_DIR, 'ai_learning_items.json');
const LEARNING_SETTINGS_FILE = path.join(ROOT_DIR, 'ai_learning_settings.json');
const LEARNING_EXPERIENCES_FILE = path.join(ROOT_DIR, 'ai_learning_experiences.json');
const LEARNING_KNOWLEDGE_FILE = path.join(ROOT_DIR, 'ai_learning_knowledge.json');
const CONVERSATIONS_FILE = path.join(ROOT_DIR, 'conversations.json');
const MESSAGE_EVENTS_FILE = path.join(ROOT_DIR, 'message_events.json');
let aiBrainBuildJob = { running: false, startedAt: null, finishedAt: null, lastResult: null, error: null };


// ===== Conversation Learning Data Sources =====
// Chức năng "Hội thoại học tập" phải tìm được hội thoại thật, không chỉ đọc file local.
// Ưu tiên Supabase khi đã cấu hình; nếu Supabase chưa sẵn sàng thì fallback local conversations.json/message_events.json.
const SUPABASE_ENABLED = String(process.env.SUPABASE_ENABLED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function supabaseIsReady() {
  return Boolean(SUPABASE_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function compactError(error) {
  return String(error?.message || error || '').replace(/\s+/g, ' ').slice(0, 260);
}

async function supabaseRequest(pathname, options = {}) {
  if (!supabaseIsReady()) return { skipped: true, reason: 'supabase_disabled' };
  const timeoutMs = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(options.headers || {})
      }
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Supabase timeout ${timeoutMs}ms: ${pathname}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
  if (!response.ok) throw new Error(`Supabase ${pathname} failed ${response.status}: ${raw}`);
  return data;
}

async function supabaseTry(pathname, options = {}) {
  try {
    const rows = await supabaseRequest(pathname, options);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn('[AI_LEARNING_CONVERSATION_SUPABASE_FALLBACK]', compactError(error));
    return [];
  }
}

function uniqBy(list, keyFn) {
  const map = new Map();
  for (const item of list || []) {
    const key = keyFn(item);
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }
  return Array.from(map.values());
}

function stripPhone(input = '') {
  return String(input || '').replace(/\D/g, '');
}

function likeValue(q = '') {
  return `*${String(q || '').replace(/[,%()]/g, ' ').trim()}*`;
}

function isUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function newUuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function firstNonEmpty(...values) {
  return values.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
}

function messageText(row = {}) {
  return firstNonEmpty(row.text, row.message, row.message_text, row.content, row.body, row.snippet, row.raw?.message?.text, row.raw?.text);
}

function messageActor(row = {}) {
  return firstNonEmpty(row.actor_type, row.role, row.sender_type, row.from_type, row.source, row.raw?.source, 'message');
}

function conversationTitle(conv = {}, customer = null) {
  return firstNonEmpty(
    customer?.name,
    conv.customer_name,
    conv.name,
    conv.sender_name,
    customer?.phone,
    customer?.zalo,
    customer?.sender_id,
    conv.sender_id,
    conv.session_key,
    conv.id,
    'Hội thoại'
  );
}

function normalizeSupabaseConversationRow(conv = {}, customer = null, sampleMessages = []) {
  const title = conversationTitle(conv, customer);
  const preview = sampleMessages.length
    ? sampleMessages.slice(-5).map(m => `${m.created_at || m.created_time || ''} ${messageActor(m)}: ${messageText(m)}`).join('\n')
    : [conv.product_group, conv.ad_id, conv.post_id, conv.session_key].filter(Boolean).join(' • ');
  return {
    id: conv.id || conv.conversation_id || conv.sender_id,
    customerId: conv.customer_id || customer?.id || '',
    senderId: conv.sender_id || customer?.sender_id || '',
    source: 'supabase',
    title,
    adId: conv.ad_id || '',
    postId: conv.post_id || '',
    productGroup: conv.product_group || customer?.last_product_group || '',
    lastMessageAt: conv.last_message_at || conv.updated_at || conv.started_at || '',
    preview: String(preview || '').slice(0, 900),
    length: String(preview || '').length,
    raw: { conversation: conv, customer }
  };
}

async function supabaseFindCustomerCandidates(q, limit = 20) {
  if (!supabaseIsReady() || !q) return [];
  const clean = String(q || '').trim();
  const digits = stripPhone(clean);
  const enc = encodeURIComponent(clean);
  const encLike = encodeURIComponent(likeValue(clean));
  const candidates = [];

  // Các query được tách nhỏ để chịu được DB schema cũ thiếu một vài cột.
  const attempts = [
    `customers?sender_id=eq.${enc}&select=*&limit=${limit}`,
    `customers?name=ilike.${encLike}&select=*&limit=${limit}`,
    `customers?phone=ilike.${encodeURIComponent(likeValue(digits || clean))}&select=*&limit=${limit}`,
    `customers?zalo=ilike.${encodeURIComponent(likeValue(digits || clean))}&select=*&limit=${limit}`
  ];
  for (const path of attempts) candidates.push(...await supabaseTry(path));
  return uniqBy(candidates, x => x.id || x.sender_id || JSON.stringify(x));
}

async function supabaseFindConversationRows(q, limit = 50) {
  if (!supabaseIsReady()) return [];
  const clean = String(q || '').trim();
  const enc = encodeURIComponent(clean);
  const encLike = encodeURIComponent(likeValue(clean));
  const out = [];

  // 1) Tìm trực tiếp theo conversation/sender/ad/product. Không query conversations.id nếu q không phải UUID.
  const directAttempts = clean ? [
    ...(isUuid(clean) ? [`conversations?id=eq.${enc}&select=*&limit=${limit}`] : []),
    `conversations?sender_id=eq.${enc}&select=*&order=last_message_at.desc&limit=${limit}`,
    `conversations?ad_id=eq.${enc}&select=*&order=last_message_at.desc&limit=${limit}`,
    `conversations?post_id=eq.${enc}&select=*&order=last_message_at.desc&limit=${limit}`,
    `conversations?product_group=ilike.${encLike}&select=*&order=last_message_at.desc&limit=${limit}`,
    `conversations?session_key=ilike.${encLike}&select=*&order=last_message_at.desc&limit=${limit}`
  ] : [`conversations?select=*&order=last_message_at.desc&limit=${limit}`];
  for (const path of directAttempts) out.push(...await supabaseTry(path));

  // 2) Tìm qua bảng customers: tên/SĐT/Zalo/sender_id.
  const customers = await supabaseFindCustomerCandidates(clean, 30);
  for (const c of customers) {
    if (c.id) out.push(...await supabaseTry(`conversations?customer_id=eq.${encodeURIComponent(c.id)}&select=*&order=last_message_at.desc&limit=20`));
    if (c.sender_id) out.push(...await supabaseTry(`conversations?sender_id=eq.${encodeURIComponent(c.sender_id)}&select=*&order=last_message_at.desc&limit=20`));
  }

  // 3) Tìm trong messages.text rồi lấy conversation_id.
  if (clean) {
    const msgRows = await supabaseTry(`messages?text=ilike.${encLike}&select=id,conversation_id,sender_id,text,created_at,role,source&order=created_at.desc&limit=60`);
    const convIds = uniqBy(msgRows.map(m => ({ id: m.conversation_id })).filter(x => x.id), x => x.id).slice(0, 40).map(x => x.id);
    if (convIds.length) {
      const inList = convIds.map(id => String(id).replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean).join(',');
      if (inList) out.push(...await supabaseTry(`conversations?id=in.(${inList})&select=*&order=last_message_at.desc&limit=${limit}`));
    }
  }

  // 4) Luồng lead-tracking mới: tên khách/quảng cáo/nhân viên nằm trong lt_conversation_identities.
  if (clean) {
    const ltRows = [];
    const ltAttempts = [
      `lt_conversation_identities?customer_name=ilike.${encLike}&select=*&order=updated_at.desc&limit=${limit}`,
      `lt_conversation_identities?sender_id=eq.${enc}&select=*&order=updated_at.desc&limit=${limit}`,
      `lt_conversation_identities?ad_name=ilike.${encLike}&select=*&order=updated_at.desc&limit=${limit}`,
      `lt_conversation_identities?pancake_employee=ilike.${encLike}&select=*&order=updated_at.desc&limit=${limit}`
    ];
    for (const path of ltAttempts) ltRows.push(...await supabaseTry(path));
    for (const r of uniqBy(ltRows, x => x.conversation_id || x.sender_id).slice(0, limit)) {
      out.push({
        id: r.conversation_id || r.id,
        conversation_id: r.conversation_id || '',
        customer_id: r.customer_id || '',
        sender_id: r.sender_id || '',
        ad_id: r.ad_id || '',
        post_id: r.post_id || '',
        product_group: r.product_group || '',
        last_message_at: r.updated_at || r.created_at || '',
        customer_name: r.customer_name || '',
        ad_name: r.ad_name || '',
        campaign_name: r.campaign_name || '',
        source_channel: r.source_channel || '',
        raw_lt_identity: r
      });
    }

    const ltMsgRows = await supabaseTry(`lt_lead_messages?message_text=ilike.${encLike}&select=conversation_id,sender_id,message_text,message_time,role&order=message_time.desc&limit=60`);
    for (const m of uniqBy(ltMsgRows, x => x.conversation_id || x.sender_id).slice(0, 40)) {
      if (m.conversation_id) {
        const identities = await supabaseTry(`lt_conversation_identities?conversation_id=eq.${encodeURIComponent(m.conversation_id)}&select=*&limit=1`);
        out.push(identities[0] || { id: m.conversation_id, conversation_id: m.conversation_id, sender_id: m.sender_id, last_message_at: m.message_time, customer_name: '' });
      }
    }
  }

  return uniqBy(out, x => x.id || x.conversation_id || `${x.sender_id}:${x.session_key}`).slice(0, limit);
}

async function supabaseGetCustomerByConversation(conv = {}) {
  if (!supabaseIsReady()) return null;
  if (conv.customer_id) {
    const rows = await supabaseTry(`customers?id=eq.${encodeURIComponent(conv.customer_id)}&select=*&limit=1`);
    if (rows[0]) return rows[0];
  }
  if (conv.sender_id) {
    const rows = await supabaseTry(`customers?sender_id=eq.${encodeURIComponent(conv.sender_id)}&select=*&limit=1`);
    if (rows[0]) return rows[0];
  }
  return null;
}

async function supabaseGetMessagesForConversation(conv = {}, limit = 250) {
  if (!supabaseIsReady()) return [];
  const attempts = [];
  if (conv.id) attempts.push(`messages?conversation_id=eq.${encodeURIComponent(conv.id)}&select=*&order=created_at.asc&limit=${limit}`);
  if (conv.sender_id) attempts.push(`messages?sender_id=eq.${encodeURIComponent(conv.sender_id)}&select=*&order=created_at.asc&limit=${limit}`);
  for (const path of attempts) {
    const rows = await supabaseTry(path);
    if (rows.length) return rows;
  }
  return [];
}

async function searchSupabaseConversations(q, limit = 50) {
  const rows = await supabaseFindConversationRows(q, limit);
  const normalized = [];
  for (const conv of rows.slice(0, limit)) {
    const customer = await supabaseGetCustomerByConversation(conv);
    const messages = await supabaseGetMessagesForConversation(conv, 12);
    normalized.push(normalizeSupabaseConversationRow(conv, customer, messages));
  }
  return normalized;
}

async function getSupabaseConversationByAnyId(idOrSender) {
  if (!supabaseIsReady() || !idOrSender) return null;
  const clean = decodeURIComponent(String(idOrSender || '').trim());
  let conv = null;
  const attempts = [
    ...(isUuid(clean) ? [`conversations?id=eq.${encodeURIComponent(clean)}&select=*&limit=1`] : []),
    `conversations?sender_id=eq.${encodeURIComponent(clean)}&select=*&order=last_message_at.desc&limit=1`,
    `conversations?session_key=eq.${encodeURIComponent(clean)}&select=*&limit=1`,
    `lt_conversation_identities?conversation_id=eq.${encodeURIComponent(clean)}&select=*&limit=1`,
    `lt_conversation_identities?sender_id=eq.${encodeURIComponent(clean)}&select=*&order=updated_at.desc&limit=1`
  ];
  for (const path of attempts) {
    const rows = await supabaseTry(path);
    if (rows[0]) { conv = rows[0]; break; }
  }
  if (!conv) return null;
  const customer = await supabaseGetCustomerByConversation(conv);
  const messages = await supabaseGetMessagesForConversation(conv, 500);
  const text = messages.length
    ? messages.map(m => `${m.created_at || m.created_time || ''} ${messageActor(m)}: ${messageText(m)}`).join('\n')
    : JSON.stringify(conv, null, 2);
  return {
    id: conv.id || clean,
    customerId: conv.customer_id || customer?.id || '',
    senderId: conv.sender_id || customer?.sender_id || '',
    source: 'supabase',
    title: conversationTitle(conv, customer),
    text,
    raw: { conversation: conv, customer, messages },
    adId: conv.ad_id || '',
    postId: conv.post_id || '',
    productGroup: conv.product_group || customer?.last_product_group || ''
  };
}

function ensureLearningDir() { fs.mkdirSync(LEARNING_DIR, { recursive: true }); }
function safeReadJson(file, fallback) { try { if (!fs.existsSync(file)) return fallback; return JSON.parse(fs.readFileSync(file, 'utf8') || 'null') || fallback; } catch (_) { return fallback; } }
function safeWriteJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function getLearningSettings() { return { active: true, startedAt: new Date().toISOString(), targetDays: 7, autoProcess: true, requireApproval: true, ...safeReadJson(LEARNING_SETTINGS_FILE, {}) }; }
function saveLearningSettings(partial = {}) { const next = { ...getLearningSettings(), ...partial, updatedAt: new Date().toISOString() }; safeWriteJson(LEARNING_SETTINGS_FILE, next); return next; }
function readLearningItems() { return safeReadJson(LEARNING_ITEMS_FILE, []); }
function writeLearningItems(items) { safeWriteJson(LEARNING_ITEMS_FILE, items); }

function readExperiences() { return safeReadJson(LEARNING_EXPERIENCES_FILE, []); }
function writeExperiences(items) { safeWriteJson(LEARNING_EXPERIENCES_FILE, items); }
function readApprovedKnowledge() { return safeReadJson(LEARNING_KNOWLEDGE_FILE, []); }
function writeApprovedKnowledge(items) { safeWriteJson(LEARNING_KNOWLEDGE_FILE, items); }

// ===== AI Brain persistence layer =====
// Mọi dữ liệu học quan trọng phải nằm trong Supabase. Local JSON chỉ còn là cache/fallback.
async function saveAiLearningSettingToSupabase(key, value, updatedBy = 'aiguka_admin') {
  if (!supabaseIsReady()) return { ok: false, skipped: true, reason: 'supabase_disabled' };
  const now = new Date().toISOString();
  const row = { setting_key: key, setting_value: value || {}, schema_version: 1, updated_at: now, updated_by: updatedBy };
  try {
    await supabaseRequest(`ai_learning_settings?on_conflict=setting_key`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([row])
    });
    return { ok: true };
  } catch (error) {
    // fallback cho project chưa có unique/upsert chuẩn
    try {
      await supabaseRequest(`ai_learning_settings?setting_key=eq.${encodeURIComponent(key)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      await supabaseRequest('ai_learning_settings', { method: 'POST', body: JSON.stringify([row]) });
      return { ok: true, fallback: 'delete_insert' };
    } catch (inner) {
      return { ok: false, error: compactError(inner) };
    }
  }
}

async function loadAiLearningSettingFromSupabase(key) {
  if (!supabaseIsReady()) return null;
  const rows = await supabaseTry(`ai_learning_settings?setting_key=eq.${encodeURIComponent(key)}&select=*&limit=1`);
  return rows[0]?.setting_value || null;
}

async function getLearningSettingsPersistent() {
  const local = getLearningSettings();
  const remote = await loadAiLearningSettingFromSupabase('learning_settings');
  return { ...local, ...(remote || {}), storage: supabaseIsReady() ? 'supabase+local_cache' : 'local_only' };
}

async function saveLearningSettingsPersistent(partial = {}) {
  const next = saveLearningSettings(partial);
  const supabasePersist = await saveAiLearningSettingToSupabase('learning_settings', next);
  return { settings: { ...next, storage: supabaseIsReady() ? 'supabase+local_cache' : 'local_only' }, supabasePersist };
}

async function getSupabaseLearningCounts() {
  if (!supabaseIsReady()) return { documents: 0, approvedDocuments: 0, versions: 0, segments: 0, approvedSegments: 0, settings: 0 };

  // V7.0.19: mọi request đếm Supabase phải có timeout.
  // Trước đây hàm này dùng fetch trực tiếp không timeout, nếu Supabase/REST bị chậm
  // sẽ làm /learning/summary treo và kéo đơ toàn bộ AI Center ở màn hình Đang tải.
  async function count(pathname) {
    const timeoutMs = Number(process.env.SUPABASE_COUNT_TIMEOUT_MS || 3500);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
        signal: controller.signal,
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, Prefer: 'count=exact' }
      });
      const cr = response.headers.get('content-range') || '';
      const total = Number((cr.split('/')[1] || '0').replace('*','0'));
      return Number.isFinite(total) ? total : 0;
    } catch (error) {
      console.warn('[AI_LEARNING_COUNT_FALLBACK]', pathname, compactError(error));
      return 0;
    } finally {
      clearTimeout(timer);
    }
  }

  const keys = ['documents','approvedDocuments','versions','segments','approvedSegments','settings'];
  const paths = [
    'ai_learning_documents?select=*&limit=1',
    'ai_learning_documents?select=*&status=eq.approved&limit=1',
    'ai_learning_document_versions?select=*&limit=1',
    'learning_segments?select=*&limit=1',
    'learning_segments?select=*&active=eq.true&attributes->>approved=eq.true&limit=1',
    'ai_learning_settings?select=*&limit=1'
  ];
  const values = await Promise.all(paths.map(p => count(p)));
  return Object.fromEntries(keys.map((k, i) => [k, values[i] || 0]));
}

async function listSupabaseKnowledge(q = '', limit = 200) {
  if (!supabaseIsReady()) return [];
  const clean = String(q || '').trim();
  const select = 'id,document_id,position,text_value,attributes,active,created_at,updated_at';
  const baseFilter = `select=${select}&active=eq.true&attributes->>approved=eq.true`;
  const path = clean
    ? `learning_segments?${baseFilter}&text_value=ilike.${encodeURIComponent(likeValue(clean))}&order=updated_at.desc&limit=${Number(limit || 200)}`
    : `learning_segments?${baseFilter}&order=updated_at.desc&limit=${Number(limit || 200)}`;
  const rows = await supabaseTry(path);
  return rows.map(r => ({
    id: r.id,
    documentId: r.document_id,
    source: 'supabase_approved',
    createdAt: r.created_at || r.updated_at || '',
    filename: r.attributes?.title || r.attributes?.filename || r.attributes?.topic || r.attributes?.product_group || 'Supabase Knowledge',
    draft: {
      summary: r.attributes?.absorbed_summary || r.text_value,
      raw_text: r.text_value,
      detected_category: r.attributes?.detected_category || r.attributes?.category || r.attributes?.product_group || r.attributes?.topic || '',
      absorption_status: r.attributes?.absorption_status || 'not_absorbed',
      absorption_score_0_100: r.attributes?.absorption_score_0_100 ?? null,
      detected_products: r.attributes?.detected_products || (r.attributes?.knowledge_object && r.attributes.knowledge_object.object_type === 'product_knowledge' ? [r.attributes.knowledge_object] : []),
      sales_faq: r.attributes?.sales_faq || [],
      missing_info: r.attributes?.missing_info || [],
      self_tests: r.attributes?.self_tests || [],
      metadata: r.attributes || {}
    }
  }));
}



function safeJsonParseObject(text = '', fallback = {}) {
  const raw = String(text || '').trim();
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (_) {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch (_) {} }
  return fallback;
}

function queryTokens(q = '') {
  return Array.from(new Set(String(q || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(x => x.length >= 3)
    .slice(0, 8)));
}

async function searchApprovedLearningSegments(query = '', limit = 30) {
  if (!supabaseIsReady()) return [];
  const q = String(query || '').trim();
  const select = 'id,document_id,position,text_value,attributes,created_at,updated_at';
  const seen = new Set();
  const out = [];
  async function addRows(rows = []) {
    for (const r of rows || []) {
      if (!r?.id || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
      if (out.length >= limit) break;
    }
  }
  if (q) {
    await addRows(await supabaseTry(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&text_value=ilike.${encodeURIComponent(likeValue(q.slice(0, 90)))}&order=updated_at.desc&limit=${limit}`));
    if (out.length < Math.min(5, limit)) {
      for (const tk of queryTokens(q)) {
        await addRows(await supabaseTry(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&text_value=ilike.${encodeURIComponent(likeValue(tk))}&order=updated_at.desc&limit=${Math.max(10, Math.ceil(limit/2))}`));
        if (out.length >= limit) break;
      }
    }
    // Fallback client-side: lấy recent approved rồi lọc cả metadata filename/category để tránh bỏ sót tên file như Navier.
    if (out.length < Math.min(3, limit)) {
      const recent = await supabaseTry(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&order=updated_at.desc&limit=300`);
      const toks = queryTokens(q);
      const filtered = recent.filter(r => {
        const hay = JSON.stringify({ text: r.text_value || '', attributes: r.attributes || {} }).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return toks.some(t => hay.includes(t));
      });
      await addRows(filtered);
    }
  }
  if (!q || !out.length) {
    await addRows(await supabaseTry(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&order=updated_at.desc&limit=${limit}`));
  }
  return out.slice(0, limit);
}

function buildHeuristicAbsorption({ document = {}, segments = [], item = {} } = {}) {
  const joined = segments.map(s => s.text_value || '').join('\n').trim();
  const draft = item.draft || item.learningResult?.draft || {};
  const filename = item.filename || document.original_filename || document.title || segments[0]?.attributes?.filename || '';
  const category = draft.detected_category || item.productGroup || document.product_group || guessCategoryFromFilename(filename || joined);
  const products = Array.isArray(draft.detected_products) ? draft.detected_products : [];
  const faqs = Array.isArray(draft.sales_faq) ? draft.sales_faq : [];
  const hasRealText = joined.length >= 120 && !/chưa có (văn bản|nội dung)|không trích xuất/i.test(joined.slice(0, 600));
  const score = Math.max(0, Math.min(100,
    (hasRealText ? 45 : 8) +
    (category ? 12 : 0) +
    Math.min(20, products.length * 4) +
    Math.min(10, faqs.length * 2) +
    (/(giá|vnd|vnđ|bảo hành|kích thước|model|mã|chất liệu)/i.test(joined) ? 13 : 0)
  ));
  const status = score >= 70 ? 'absorbed' : score >= 35 ? 'partial' : 'needs_extraction';
  const summary = draft.summary || (hasRealText ? joined.slice(0, 900) : `Đã lưu file ${filename}, nhưng chưa trích xuất được nội dung tư vấn đủ chi tiết.`);
  const selfTests = [];
  if (filename || category) selfTests.push({ q: `Khách hỏi ${category || filename}, AI có nêu được tài liệu liên quan không?`, expected: summary.slice(0, 220), pass: score >= 35 });
  if (products.length) selfTests.push({ q: `Có những mẫu/sản phẩm nào trong ${filename}?`, expected: products.map(p => p.name || p.code || '').filter(Boolean).slice(0, 8).join(', '), pass: true });
  if (!hasRealText) selfTests.push({ q: 'Có đủ model/giá/kích thước để tư vấn không?', expected: 'Chưa đủ, cần OCR/parser hoặc upload file có text rõ hơn.', pass: false });
  return {
    absorption_status: status,
    absorption_score_0_100: score,
    absorbed_summary: summary,
    detected_category: category,
    detected_products: products,
    sales_faq: faqs,
    missing_info: draft.missing_info || (hasRealText ? [] : ['Chưa trích xuất được nội dung thật từ file.']),
    self_tests: selfTests,
    source: 'heuristic_absorption_v7_0_15'
  };
}

async function generateAbsorptionWithAI({ document = {}, segments = [], item = {} } = {}) {
  const text = segments.map(s => s.text_value || '').join('\n---\n').slice(0, 18000);
  const filename = item.filename || document.original_filename || document.title || '';
  const prompt = `Bạn là AI Comparison Learning Engine của AIGUKA. Nhiệm vụ của bạn KHÔNG phải trả lời khách, mà là kiểm tra xem AI đã hấp thụ được knowledge chưa.\n\nHãy đọc nội dung knowledge dưới đây và trả về JSON hợp lệ. Không viết ngoài JSON.\n\nSchema:\n{\n  "absorption_status":"absorbed|partial|needs_extraction",\n  "absorption_score_0_100":0,\n  "absorbed_summary":"AI đã hiểu được gì để vận dụng khi tư vấn",\n  "detected_category":"",\n  "detected_products":[{"name":"","brand":"","model":"","price":"","size":"","warranty":"","notes":""}],\n  "sales_faq":[{"q":"khách có thể hỏi","a":"câu trả lời dựa trên knowledge"}],\n  "missing_info":[],\n  "self_tests":[{"q":"câu hỏi tự kiểm tra","expected":"đáp án mong đợi","pass":true}]\n}\n\nQuy tắc:\n- Nếu chỉ có tên file/ghi chú mà không có model, giá, thông số, ảnh hoặc nội dung tư vấn thật thì status phải là needs_extraction hoặc partial, không được chấm cao.\n- Nếu đủ dữ liệu để tư vấn linh hoạt thì status absorbed.\n- Không bịa giá/model/thông số.\n\nTên file: ${filename}\nNhóm hiện có: ${document.product_group || item.productGroup || ''}\n\nNỘI DUNG KNOWLEDGE:\n${text || JSON.stringify(item.draft || item.learningResult?.draft || {})}`;
  try {
    const res = await aiProviderManager.generateText({ input: prompt, task: 'knowledge_absorption', meta: { filename, documentId: document.id || '' } });
    const parsed = safeJsonParseObject(res.text || '', null);
    if (parsed && typeof parsed === 'object') return { ...parsed, provider: res.provider || '', source: 'ai_absorption_v7_0_15' };
  } catch (error) {
    console.warn('[KNOWLEDGE_ABSORPTION_AI_FAILED]', compactError(error));
  }
  return buildHeuristicAbsorption({ document, segments, item });
}

async function absorbApprovedDocument(documentId, item = {}) {
  if (!supabaseIsReady() || !documentId) return { ok: false, skipped: true, reason: 'supabase_disabled_or_missing_document' };
  const now = new Date().toISOString();
  const docs = await supabaseTry(`ai_learning_documents?id=eq.${encodeURIComponent(documentId)}&select=*&limit=1`);
  const document = docs[0] || { id: documentId };
  const segments = await supabaseTry(`learning_segments?document_id=eq.${encodeURIComponent(documentId)}&active=eq.true&attributes->>approved=eq.true&select=id,document_id,position,text_value,attributes,created_at,updated_at&order=position.asc&limit=2000`);
  const absorption = await generateAbsorptionWithAI({ document, segments, item });
  const normalized = {
    absorption_status: String(absorption.absorption_status || '').match(/^(absorbed|partial|needs_extraction)$/) ? absorption.absorption_status : 'partial',
    absorption_score_0_100: Math.max(0, Math.min(100, Number(absorption.absorption_score_0_100 || 0))),
    absorbed_summary: String(absorption.absorbed_summary || absorption.summary || '').slice(0, 6000),
    detected_category: absorption.detected_category || document.product_group || item.productGroup || '',
    detected_products: Array.isArray(absorption.detected_products) ? absorption.detected_products.slice(0, 200) : [],
    sales_faq: Array.isArray(absorption.sales_faq) ? absorption.sales_faq.slice(0, 100) : [],
    missing_info: Array.isArray(absorption.missing_info) ? absorption.missing_info.slice(0, 100) : [],
    self_tests: Array.isArray(absorption.self_tests) ? absorption.self_tests.slice(0, 50) : [],
    source: absorption.source || 'absorption_v7_0_15',
    provider: absorption.provider || ''
  };
  for (const row of segments) {
    await supabaseRequest(`learning_segments?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ attributes: { ...(row.attributes || {}), ...normalized, absorbed_at: now, approved: true }, updated_at: now })
    });
  }
  await supabaseRequest(`ai_learning_documents?id=eq.${encodeURIComponent(documentId)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: normalized.absorption_status === 'absorbed' ? 'approved' : 'approved',
      product_group: normalized.detected_category || document.product_group || null,
      metadata: { ...(document.metadata || {}), knowledge_absorption: { ...normalized, absorbed_at: now, segment_count: segments.length } },
      updated_at: now
    })
  });
  aiProviderManager.appendReport({ type: 'knowledge_absorbed', level: normalized.absorption_score_0_100 >= 70 ? 'green' : normalized.absorption_score_0_100 >= 35 ? 'yellow' : 'orange', title: `Knowledge Absorption: ${document.original_filename || document.title || documentId}`, score: normalized.absorption_score_0_100, lesson: normalized.absorbed_summary, tags: ['knowledge_absorption', normalized.detected_category || ''] });
  return { ok: true, documentId, segments: segments.length, absorption: normalized };
}

async function exportAiBrainPayload() {
  const local = { learningItems: readLearningItems(), approvedKnowledge: readApprovedKnowledge(), experiences: readExperiences(), learningSettings: getLearningSettings() };
  const remote = { documents: [], versions: [], segments: [], settings: [] };
  if (supabaseIsReady()) {
    remote.documents = await supabaseTry('ai_learning_documents?select=*&order=created_at.desc&limit=5000');
    remote.versions = await supabaseTry('ai_learning_document_versions?select=*&order=created_at.desc&limit=5000');
    remote.segments = await supabaseTry('learning_segments?select=*&order=created_at.desc&limit=20000');
    remote.settings = await supabaseTry('ai_learning_settings?select=*&order=updated_at.desc&limit=1000');
  }
  return { ok: true, exportedAt: new Date().toISOString(), schema: 'aiguka_ai_brain_v1', project: 'AIGUKA', remote, local, counts: { remote: { documents: remote.documents.length, versions: remote.versions.length, segments: remote.segments.length, settings: remote.settings.length }, local: { learningItems: local.learningItems.length, approvedKnowledge: local.approvedKnowledge.length, experiences: local.experiences.length } } };
}

async function importAiBrainPayload(payload = {}) {
  if (!supabaseIsReady()) return { ok: false, error: 'Supabase chưa bật nên không import được.' };
  const remote = payload.remote || payload;
  const result = { documents: 0, versions: 0, segments: 0, settings: 0, errors: [] };
  async function insertChunks(table, rows, chunkSize = 200) {
    const cleanRows = (rows || []).filter(Boolean);
    for (let i = 0; i < cleanRows.length; i += chunkSize) {
      try {
        await supabaseRequest(`${table}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(cleanRows.slice(i, i + chunkSize)) });
      } catch (error) { result.errors.push(`${table}: ${compactError(error)}`); }
    }
    return cleanRows.length;
  }
  result.documents = await insertChunks('ai_learning_documents', remote.documents || []);
  result.versions = await insertChunks('ai_learning_document_versions', remote.versions || []);
  result.segments = await insertChunks('learning_segments', remote.segments || []);
  for (const row of (remote.settings || [])) {
    const r = await saveAiLearningSettingToSupabase(row.setting_key || 'imported_setting', row.setting_value || {}, row.updated_by || 'import');
    if (r.ok) result.settings += 1; else result.errors.push(`ai_learning_settings: ${r.error || r.reason}`);
  }
  return { ok: result.errors.length === 0, result };
}


// ===== AI Provider settings persistence =====
// Provider roles là cấu hình vận hành quan trọng, không được chỉ lưu local JSON.
const AI_PROVIDER_SETTINGS_KEY = 'ai_provider_settings';

async function getProviderSettingsPersistent() {
  const local = aiProviderManager.getSettings();
  const remote = await loadAiLearningSettingFromSupabase(AI_PROVIDER_SETTINGS_KEY);
  if (remote && typeof remote === 'object' && remote.providers) {
    const merged = aiProviderManager.saveSettings({ ...local, ...remote, updatedAt: remote.updatedAt || new Date().toISOString() });
    return { settings: merged, source: 'supabase', supabasePersist: { ok: true, loaded: true } };
  }
  return { settings: local, source: supabaseIsReady() ? 'local_cache_no_remote' : 'local_only', supabasePersist: { ok: false, skipped: true, reason: supabaseIsReady() ? 'remote_missing' : 'supabase_disabled' } };
}

async function saveProviderSettingsPersistent(settings, updatedBy = 'aiguka_admin') {
  const next = aiProviderManager.saveSettings({ ...(settings || {}), updatedAt: new Date().toISOString() });
  const payload = {
    version: next.version || '7.0.10-provider-persistence',
    strategy: next.strategy,
    providers: next.providers,
    monitor: next.monitor,
    guardrails: next.guardrails,
    updatedAt: next.updatedAt
  };
  const supabasePersist = await saveAiLearningSettingToSupabase(AI_PROVIDER_SETTINGS_KEY, payload, updatedBy);
  return { settings: next, source: supabasePersist.ok ? 'supabase+local_cache' : 'local_cache_only', supabasePersist };
}

function learningLevelFromConfidence(conf = 0) {
  const n = Number(conf || 0);
  if (n >= 80) return 'green';
  if (n >= 55) return 'yellow';
  if (n >= 30) return 'orange';
  return 'red';
}
function summarizeLearning(items = readLearningItems(), experiences = readExperiences(), knowledge = readApprovedKnowledge()) {
  const byStatus = items.reduce((acc, item) => { acc[item.status || 'unknown'] = (acc[item.status || 'unknown'] || 0) + 1; return acc; }, {});
  const pending = items.filter(x => ['uploaded','pending_review','needs_attention'].includes(x.status || '')).length;
  const needsAttention = items.filter(x => (x.status || '') === 'needs_attention').length;
  const approved = items.filter(x => (x.status || '') === 'approved').length;
  const products = [];
  for (const item of items) {
    const draft = item.draft || item.learningResult?.draft || {};
    for (const p of draft.detected_products || []) {
      if (p?.name) products.push({ name: p.name, category: draft.detected_category || '', confidence: draft.confidence_0_100 || 0, itemId: item.id });
    }
  }
  return {
    totalDocuments: items.length,
    byStatus,
    pending,
    needsAttention,
    approvedDocuments: approved,
    approvedKnowledge: knowledge.length,
    experiences: experiences.length,
    productsDetected: products.length,
    lowConfidence: items.filter(x => Number((x.draft || x.learningResult?.draft || {}).confidence_0_100 || 0) < 55 && x.status !== 'approved').length,
    topProducts: products.slice(0, 12),
    todayTodo: {
      documents: pending,
      needsAttention,
      lowConfidence: items.filter(x => Number((x.draft || x.learningResult?.draft || {}).confidence_0_100 || 0) < 55 && x.status !== 'approved').length,
      experiencesNeedReview: experiences.filter(x => x.status !== 'applied' && x.status !== 'archived').length
    }
  };
}
function flattenConversationRecords() {
  const conv = safeReadJson(CONVERSATIONS_FILE, {});
  const events = safeReadJson(MESSAGE_EVENTS_FILE, []);
  const rows = [];
  if (Array.isArray(conv)) {
    conv.forEach((x, i) => rows.push({ id: x.id || x.senderId || `conv_${i}`, source: 'conversations', title: x.name || x.senderName || x.id || `Conversation ${i+1}`, text: typeof x === 'string' ? x : JSON.stringify(x, null, 2), raw: x }));
  } else if (conv && typeof conv === 'object') {
    for (const [id, value] of Object.entries(conv)) {
      let text = '';
      if (Array.isArray(value)) text = value.map(m => typeof m === 'string' ? m : `${m.role || m.from || ''}: ${m.text || m.message || JSON.stringify(m)}`).join('\n');
      else if (typeof value === 'string') text = value;
      else text = JSON.stringify(value, null, 2);
      rows.push({ id, source: 'conversations', title: id, text, raw: value });
    }
  }
  if (Array.isArray(events)) {
    const grouped = new Map();
    for (const ev of events) {
      const id = ev.senderId || ev.sender_id || ev.psid || ev.customer_id || ev.from?.id || ev.id || 'unknown';
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(ev);
    }
    for (const [id, list] of grouped.entries()) {
      const text = list.slice(-80).map(ev => `${ev.created_time || ev.timestamp || ev.time || ''} ${ev.senderName || ev.sender_name || ev.from?.name || id}: ${ev.text || ev.message || ev.message_text || ev.snippet || JSON.stringify(ev).slice(0, 300)}`).join('\n');
      rows.push({ id: `events_${id}`, customerId: id, source: 'message_events', title: `${id} (${list.length} events)`, text, raw: list.slice(-120) });
    }
  }
  return rows;
}
function findConversationById(id) { return flattenConversationRecords().find(x => x.id === id || x.customerId === id); }

function cleanFilename(name = 'upload.bin') { return String(name || 'upload.bin').replace(/[^a-zA-Z0-9._()\-\s]/g, '_').slice(0, 180); }
function dataUrlToBuffer(dataUrl = '') { const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/s); if (!m) return null; return { mimeType: m[1], buffer: Buffer.from(m[2], 'base64') }; }
function extractPlainTextIfPossible(filename = '', mimeType = '', buffer) {
  const ext = path.extname(filename).toLowerCase();
  if (['.xlsx', '.xls', '.xlsm', '.csv'].includes(ext) || String(mimeType || '').includes('spreadsheet')) {
    const parsed = extractSpreadsheetKnowledge(filename, buffer);
    return parsed.text;
  }
  const textual = String(mimeType || '').startsWith('text/') || ['.txt','.csv','.json','.md','.html','.htm','.log'].includes(ext);
  if (!textual) return '';
  try { return buffer.toString('utf8').slice(0, 80000); } catch (_) { return ''; }
}

function guessCategoryFromFilename(filename = '') {
  const s = String(filename || '').toLowerCase();
  if (s.includes('bồn') || s.includes('bon') || s.includes('tắm') || s.includes('tam')) return 'Bồn tắm';
  if (s.includes('quạt') || s.includes('quat')) return 'Quạt trần';
  if (s.includes('sen') || s.includes('vòi') || s.includes('voi')) return 'Sen vòi';
  if (s.includes('lavabo') || s.includes('tủ') || s.includes('tu')) return 'Tủ lavabo';
  return '';
}

function extractSpreadsheetKnowledge(filename = '', buffer) {
  if (!XLSX) return { text: '', segments: [], summary: 'Thiếu dependency xlsx nên chưa đọc được Excel.' };
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
    const lines = [`FILE: ${filename}`, `SHEETS: ${workbook.SheetNames.join(', ')}`];
    const segments = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      lines.push(`\n## Sheet: ${sheetName}`);
      const nonEmptyRows = rows.filter(r => r.some(c => String(c || '').trim() !== ''));
      lines.push(`Rows: ${nonEmptyRows.length}`);
      const headerIndex = nonEmptyRows.findIndex(r => r.filter(c => String(c || '').trim()).length >= 2);
      const header = headerIndex >= 0 ? nonEmptyRows[headerIndex].map(c => String(c || '').trim()) : [];
      if (header.length) lines.push(`Columns: ${header.join(' | ')}`);
      const dataRows = nonEmptyRows.slice(Math.max(0, headerIndex + 1));
      for (const row of dataRows.slice(0, 300)) {
        const cells = row.map(c => String(c || '').trim()).filter(Boolean);
        if (cells.length < 2) continue;
        const rowText = cells.join(' | ');
        lines.push(rowText);
        const code = cells.find(c => /^[A-Z]{1,5}\d{2,}[A-Z0-9-]*$/i.test(c)) || cells[0];
        const price = cells.find(c => /\d[\d.,\s]{4,}/.test(c) && !/x|\*/i.test(c)) || '';
        const size = cells.find(c => /\d{3,4}\s*[x*]\s*\d{3,4}/i.test(c)) || '';
        segments.push({ position: segments.length + 1, text_value: `[${sheetName}] ${rowText}`.slice(0, 4000), attributes: { filename, sheet: sheetName, code, price, size, category: guessCategoryFromFilename(filename), source: 'excel_parser' }, active: true });
      }
    }
    return { text: lines.join('\n').slice(0, 120000), segments, summary: `${workbook.SheetNames.length} sheet, ${segments.length} dòng kiến thức` };
  } catch (error) {
    console.warn('[AI_LEARNING_EXCEL_PARSE_FAILED]', compactError(error));
    return { text: '', segments: [], summary: compactError(error) };
  }
}

function spreadsheetSegmentsIfPossible(filename = '', mimeType = '', buffer) {
  const ext = path.extname(filename).toLowerCase();
  if (!['.xlsx', '.xls', '.xlsm', '.csv'].includes(ext) && !String(mimeType || '').includes('spreadsheet')) return [];
  return extractSpreadsheetKnowledge(filename, buffer).segments || [];
}

async function saveLearningDocumentToSupabase(item, buffer, segments = []) {
  if (!supabaseIsReady()) return { ok: false, skipped: true, reason: 'supabase_disabled' };
  const docId = item.supabaseDocumentId || newUuid();
  const versionId = newUuid();
  const now = new Date().toISOString();
  const checksum = buffer ? crypto.createHash('sha256').update(buffer).digest('hex') : item.checksum_sha256 || '';
  await supabaseRequest('ai_learning_documents', { method: 'POST', body: JSON.stringify([{
    id: docId, title: item.filename || item.title || 'Tài liệu học tập', description: item.note || '', source_type: item.sourceType || 'upload', product_group: item.productGroup || guessCategoryFromFilename(item.filename || ''), status: item.status || 'uploaded', storage_bucket: 'local_runtime', storage_path: item.storedName || '', original_filename: item.filename || '', mime_type: item.mimeType || '', file_size_bytes: Number(item.size || (buffer ? buffer.length : 0) || 0), checksum_sha256: checksum || null, is_active: true, metadata: { local_item_id: item.id, parser: 'aiguka_v708_excel_parser', note: item.note || '' }, created_at: item.createdAt || now, updated_at: now
  }]) });
  await supabaseRequest('ai_learning_document_versions', { method: 'POST', body: JSON.stringify([{
    id: versionId, document_id: docId, version_no: 1, storage_path: item.storedName || '', checksum_sha256: checksum || null, parser_name: 'aiguka_excel_text_parser', parser_version: '7.0.8', extraction_status: item.text ? 'extracted' : 'empty', extracted_text: String(item.text || '').slice(0, 200000), extraction_error: item.text ? null : 'Không trích xuất được văn bản', metadata: { local_item_id: item.id }, created_at: now, indexed_at: now
  }]) });
  const segmentRows = (segments && segments.length ? segments : [{ position: 1, text_value: String(item.text || '').slice(0, 4000), attributes: { filename: item.filename || '', source: 'plain_text' }, active: true }]).filter(x => String(x.text_value || '').trim()).slice(0, 2000).map((x, i) => ({
    id: newUuid(), document_id: docId, position: Number(x.position || i + 1), text_value: String(x.text_value || '').slice(0, 8000), attributes: { ...(x.attributes || {}), local_item_id: item.id, filename: item.filename || '', approved: item.status === 'approved' }, active: item.status === 'approved', created_at: now, updated_at: now
  }));
  for (let i = 0; i < segmentRows.length; i += 200) await supabaseRequest('learning_segments', { method: 'POST', body: JSON.stringify(segmentRows.slice(i, i + 200)) });
  return { ok: true, documentId: docId, versionId, segments: segmentRows.length };
}

async function addApprovedKnowledgeToSupabase(payload = {}) {
  if (!supabaseIsReady()) return { ok: false, skipped: true, reason: 'supabase_disabled' };
  const now = new Date().toISOString();
  const docId = newUuid();
  const answer = String(payload.answer || payload.text || '');
  await supabaseRequest('ai_learning_documents', { method: 'POST', body: JSON.stringify([{
    id: docId, title: payload.title || `AI Memory - ${payload.topic || payload.productGroup || 'Kiến thức'}`, description: payload.question || '', source_type: 'admin_ai_memory', product_group: payload.productGroup || payload.topic || '', status: 'indexed', storage_bucket: 'supabase_row', storage_path: '', original_filename: '', mime_type: 'text/plain', file_size_bytes: Buffer.byteLength(answer, 'utf8'), checksum_sha256: crypto.createHash('sha256').update(answer).digest('hex'), is_active: true, metadata: { provider: payload.provider || '', score: payload.score || null, tags: payload.tags || [], source: 'compare_add_to_knowledge' }, created_at: now, updated_at: now
  }]) });
  await supabaseRequest('learning_segments', { method: 'POST', body: JSON.stringify([{ id: newUuid(), document_id: docId, position: 1, text_value: answer.slice(0, 8000), attributes: { topic: payload.topic || '', product_group: payload.productGroup || '', provider: payload.provider || '', question: payload.question || '', priority: payload.priority || 5, admin_approved: true, approved: true, absorption_status: 'absorbed', absorption_score_0_100: 100, absorbed_summary: answer.slice(0, 1200), source: 'admin_memory_absorbed' }, active: true, created_at: now, updated_at: now }]) });
  return { ok: true, documentId: docId };
}



function normalizeBrainObjectPayload(body = {}) {
  const objectType = String(body.objectType || body.type || 'business_rule').trim();
  const title = String(body.title || body.name || 'Tri thức AI Brain').trim();
  const category = String(body.category || body.productGroup || body.appliesTo || '').trim();
  const priority = Math.max(1, Math.min(5, Number(body.priority || 4)));
  const rawContent = String(body.content || body.lesson || body.answer || body.text || '').trim();
  let extra = {};
  if (body.objectJson && typeof body.objectJson === 'string') extra = safeJsonParseObject(body.objectJson, {});
  else if (body.object && typeof body.object === 'object') extra = body.object;
  const aliases = Array.isArray(body.aliases) ? body.aliases : String(body.aliases || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  const tags = Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  const object = {
    object_type: objectType,
    title,
    category,
    product_group: String(body.productGroup || category || '').trim(),
    brand: String(body.brand || extra.brand || '').trim(),
    model: String(body.model || extra.model || '').trim(),
    aliases,
    priority,
    content: rawContent,
    fields: extra,
    tags,
    source: body.source || 'admin_direct_brain_input',
    version: '7.2.0'
  };
  const textParts = [
    `AI BRAIN OBJECT`,
    `Loại: ${objectType}`,
    `Tiêu đề: ${title}`,
    category ? `Nhóm/áp dụng: ${category}` : '',
    object.brand ? `Thương hiệu: ${object.brand}` : '',
    object.model ? `Model/Mã: ${object.model}` : '',
    aliases.length ? `Alias/từ khóa: ${aliases.join(', ')}` : '',
    tags.length ? `Tags: ${tags.join(', ')}` : '',
    rawContent ? `Nội dung:\n${rawContent}` : '',
    Object.keys(extra || {}).length ? `Dữ liệu cấu trúc:\n${JSON.stringify(extra, null, 2)}` : ''
  ].filter(Boolean);
  return { object, text: textParts.join('\n') };
}

async function addBrainObjectToSupabase(body = {}) {
  if (!supabaseIsReady()) return { ok: false, skipped: true, reason: 'supabase_disabled' };
  const now = new Date().toISOString();
  const { object, text } = normalizeBrainObjectPayload(body);
  if (!String(text || '').trim() || !object.title) throw new Error('Thiếu tiêu đề hoặc nội dung tri thức.');
  const docId = newUuid();
  const checksum = crypto.createHash('sha256').update(text).digest('hex');
  await supabaseRequest('ai_learning_documents', { method: 'POST', body: JSON.stringify([{
    id: docId,
    title: object.title,
    description: `${object.object_type} • ${object.category || object.product_group || ''}`,
    source_type: 'ai_brain_manual_object',
    product_group: object.product_group || object.category || '',
    status: 'indexed',
    storage_bucket: 'supabase_row',
    storage_path: '',
    original_filename: '',
    mime_type: 'application/aiguka-brain-object+json',
    file_size_bytes: Buffer.byteLength(text, 'utf8'),
    checksum_sha256: checksum,
    is_active: true,
    metadata: { object_type: object.object_type, source: object.source, tags: object.tags, version: object.version },
    created_at: now,
    updated_at: now
  }]) });
  const attributes = {
    approved: true,
    approved_at: now,
    object_type: object.object_type,
    title: object.title,
    category: object.category || '',
    product_group: object.product_group || object.category || '',
    brand: object.brand || '',
    model: object.model || '',
    aliases: object.aliases || [],
    tags: object.tags || [],
    priority: object.priority || 4,
    source: object.source,
    absorption_status: 'absorbed',
    absorption_score_0_100: 100,
    absorbed_summary: String(object.content || object.title || '').slice(0, 1200),
    knowledge_object: object,
    ai_brain_version: '7.2.0'
  };
  await supabaseRequest('learning_segments', { method: 'POST', body: JSON.stringify([{
    id: newUuid(),
    document_id: docId,
    position: 1,
    text_value: text.slice(0, 8000),
    attributes,
    active: true,
    created_at: now,
    updated_at: now
  }]) });
  return { ok: true, documentId: docId, object, textPreview: text.slice(0, 800) };
}

async function approveLearningItemInSupabase(item = {}) {
  if (!supabaseIsReady()) return { ok: false, skipped: true, reason: 'supabase_disabled' };
  const now = new Date().toISOString();
  let docId = item.supabaseDocumentId || '';
  const draft = item.draft || item.learningResult?.draft || {};
  const category = draft.detected_category || item.productGroup || guessCategoryFromFilename(item.filename || '');
  const summaryParts = [
    draft.summary,
    category ? `Nhóm: ${category}` : '',
    Array.isArray(draft.detected_products) && draft.detected_products.length ? `Sản phẩm: ${draft.detected_products.map(p => p.name || p.code || JSON.stringify(p)).join(', ')}` : '',
    Array.isArray(draft.sales_faq) && draft.sales_faq.length ? draft.sales_faq.map(x => `${x.q || ''} ${x.a || ''}`.trim()).join('\n') : ''
  ].filter(Boolean);
  const fallbackText = summaryParts.join('\n').trim() || `${item.filename || 'Tài liệu'}${category ? ' - ' + category : ''}`;

  if (!docId) {
    const rows = await supabaseTry(`ai_learning_documents?metadata->>local_item_id=eq.${encodeURIComponent(item.id || '')}&select=id&limit=1`);
    docId = rows[0]?.id || '';
  }
  if (docId) {
    await supabaseRequest(`ai_learning_documents?id=eq.${encodeURIComponent(docId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'approved', product_group: category || item.productGroup || null, updated_at: now })
    });
    // Mở khóa những segment đã được tạo từ file này và đánh dấu approved=true để Knowledge chỉ đọc dữ liệu đã duyệt.
    const existing = await supabaseTry(`learning_segments?document_id=eq.${encodeURIComponent(docId)}&select=id,attributes&limit=2000`);
    if (existing.length) {
      for (const row of existing) {
        await supabaseRequest(`learning_segments?id=eq.${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ active: true, attributes: { ...(row.attributes || {}), approved: true, approved_at: now, filename: item.filename || row.attributes?.filename || '', category }, updated_at: now })
        });
      }
      const absorption = await absorbApprovedDocument(docId, item);
      return { ok: true, documentId: docId, approvedSegments: existing.length, absorption };
    }
  }

  // Ảnh/video/PDF không trích xuất được text vẫn cần một bản ghi Knowledge bền vững thay vì chỉ nằm trong local JSON.
  if (!docId) {
    docId = newUuid();
    await supabaseRequest('ai_learning_documents', { method: 'POST', body: JSON.stringify([{
      id: docId,
      title: item.filename || 'Tài liệu học tập',
      description: item.note || '',
      source_type: item.sourceType || 'upload',
      product_group: category || item.productGroup || '',
      status: 'approved',
      storage_bucket: 'local_runtime',
      storage_path: item.storedName || '',
      original_filename: item.filename || '',
      mime_type: item.mimeType || '',
      file_size_bytes: Number(item.size || 0),
      checksum_sha256: null,
      is_active: true,
      metadata: { local_item_id: item.id || '', note: item.note || '', approved_from: 'admin_review' },
      created_at: item.createdAt || now,
      updated_at: now
    }]) });
  }
  await supabaseRequest('learning_segments', { method: 'POST', body: JSON.stringify([{
    id: newUuid(),
    document_id: docId,
    position: 1,
    text_value: fallbackText.slice(0, 8000),
    attributes: { filename: item.filename || '', local_item_id: item.id || '', category, product_group: category, source: 'admin_approved_upload', approved: true, approved_at: now, mime_type: item.mimeType || '', draft },
    active: true,
    created_at: now,
    updated_at: now
  }]) });
  const absorption = await absorbApprovedDocument(docId, item);
  return { ok: true, documentId: docId, approvedSegments: 1, createdFallbackSegment: true, absorption };
}

async function buildLearningContext(query = '', limit = 30) {
  const parts = [];
  const q = String(query || '').trim();
  const localKnowledge = readApprovedKnowledge().slice(0, 50).map(x => JSON.stringify(x.draft || x).slice(0, 1200));
  if (localKnowledge.length) parts.push(`KIẾN THỨC ADMIN ĐÃ DUYỆT (LOCAL):\n${localKnowledge.join('\n---\n')}`);
  if (supabaseIsReady()) {
    const rows = await searchApprovedLearningSegments(q, limit);
    if (rows.length) {
      const lines = rows.map(r => {
        const a = r.attributes || {};
        const absorbed = a.absorbed_summary ? `\n  HẤP THỤ: ${a.absorbed_summary}` : '';
        const products = Array.isArray(a.detected_products) && a.detected_products.length ? `\n  SẢN PHẨM: ${a.detected_products.map(p => p.name || p.model || p.code || '').filter(Boolean).slice(0,8).join(', ')}` : '';
        return `- FILE: ${a.filename || a.topic || a.product_group || ''} | NHÓM: ${a.category || a.product_group || a.detected_category || ''} | ABSORB: ${a.absorption_status || 'chưa đánh giá'} ${a.absorption_score_0_100 != null ? '('+a.absorption_score_0_100+'/100)' : ''}\n  RAW: ${String(r.text_value || '').slice(0, 1600)}${absorbed}${products}`;
      });
      parts.push(`KIẾN THỨC AI ĐÃ DUYỆT/HẤP THỤ TỪ SUPABASE:\n${lines.join('\n---\n')}`);
    }
  }
  return parts.join('\n\n').slice(0, 30000);
}

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



function readRequestBuffer(req, limitMb = Number(process.env.LEARNING_UPLOAD_LIMIT_MB || 80)) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const limit = Math.max(1, limitMb) * 1024 * 1024;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error(`File quá lớn. Giới hạn hiện tại ${limitMb}MB. Hãy nén/chia nhỏ file hoặc tăng LEARNING_UPLOAD_LIMIT_MB.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipartFormData(req, buffer) {
  const contentType = String(req.headers['content-type'] || '');
  const m = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
  if (!m) throw new Error('Thiếu multipart boundary. Frontend phải gửi FormData, không gửi JSON base64 cho file lớn.');
  const boundary = Buffer.from('--' + (m[1] || m[2] || '').trim());
  const parts = [];
  let start = buffer.indexOf(boundary);
  while (start !== -1) {
    start += boundary.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;
    const headerText = buffer.slice(start, headerEnd).toString('utf8');
    let dataStart = headerEnd + 4;
    let next = buffer.indexOf(boundary, dataStart);
    if (next === -1) break;
    let dataEnd = next;
    if (buffer[dataEnd - 2] === 13 && buffer[dataEnd - 1] === 10) dataEnd -= 2;
    const disposition = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(headerText)?.[1] || '';
    const name = /name="([^"]+)"/i.exec(disposition)?.[1] || '';
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1] || '';
    const mimeType = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() || 'application/octet-stream';
    const valueBuffer = buffer.slice(dataStart, dataEnd);
    parts.push({ name, filename, mimeType, buffer: valueBuffer, text: valueBuffer.toString('utf8') });
    start = next;
  }
  const fields = {};
  const files = [];
  for (const part of parts) {
    if (part.filename) files.push(part);
    else if (part.name) fields[part.name] = part.text;
  }
  return { fields, files };
}

async function createLearningUploadItemFromBuffer({ filename, mimeType, size, note, sourceType }, buffer) {
  ensureLearningDir();
  const safeFilename = cleanFilename(filename || 'upload.bin');
  const id = `learn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const storedName = `${id}_${safeFilename}`;
  const filePath = path.join(LEARNING_DIR, storedName);
  fs.writeFileSync(filePath, buffer);
  const item = {
    id,
    filename: safeFilename,
    storedName,
    mimeType: mimeType || 'application/octet-stream',
    size: Number(size || buffer.length),
    note: note || '',
    sourceType: sourceType || 'upload',
    status: 'uploaded',
    createdAt: new Date().toISOString(),
    text: extractPlainTextIfPossible(safeFilename, mimeType || '', buffer)
  };
  const spreadsheetSegments = spreadsheetSegmentsIfPossible(safeFilename, mimeType || '', buffer);
  if (spreadsheetSegments.length) item.extractedSegments = spreadsheetSegments.slice(0, 2000);
  const ext = path.extname(safeFilename).toLowerCase();
  if (!item.text && (String(mimeType || '').includes('pdf') || String(mimeType || '').startsWith('image/') || ['.pdf','.jpg','.jpeg','.png','.webp'].includes(ext))) {
    item.needsOcrParser = true;
    item.status = 'needs_attention';
    item.draft = {
      summary: 'File dạng ảnh/scan hoặc PDF không có text layer. Cần OCR/Vision Parser trước khi đưa vào Knowledge.',
      detected_category: guessCategoryFromFilename(safeFilename),
      detected_products: [],
      missing_info: ['Cần OCR/Vision Parser để đọc chữ nằm trên ảnh/catalog.'],
      confidence_0_100: 0,
      needs_admin_review: true
    };
  }
  let supabasePersist = null;
  try {
    supabasePersist = await saveLearningDocumentToSupabase(item, buffer, spreadsheetSegments);
    if (supabasePersist?.documentId) item.supabaseDocumentId = supabasePersist.documentId;
  } catch (error) {
    console.warn('[AI_LEARNING_SUPABASE_PERSIST_FAILED]', compactError(error));
    supabasePersist = { ok: false, error: compactError(error) };
  }
  const items = readLearningItems();
  items.unshift({ ...item, filePath: undefined, supabasePersist });
  writeLearningItems(items);
  let learningResult = null;
  const settings = getLearningSettings();
  if (settings.active && settings.autoProcess && !item.needsOcrParser) learningResult = await processLearningItem(item);
  return { item, learningResult, supabasePersist };
}

module.exports = function createAiOperationsRoutes() {
  const router = express.Router();

  router.get('/settings', async (req, res) => {
    try {
      const loaded = await getProviderSettingsPersistent();
      res.json({ ok: true, settings: loaded.settings, runtime: aiProviderManager.providerRuntimeInfo(loaded.settings), persistence: { source: loaded.source, supabase: loaded.supabasePersist } });
    } catch (error) {
      const settings = aiProviderManager.getSettings();
      res.json({ ok: true, settings, runtime: aiProviderManager.providerRuntimeInfo(settings), persistence: { source: 'local_fallback', error: compactError(error) } });
    }
  });

  router.post('/settings', async (req, res) => {
    try {
      const body = req.body || {};
      const loaded = await getProviderSettingsPersistent();
      const current = loaded.settings;
      const saved = await saveProviderSettingsPersistent({
        ...current,
        ...body,
        providers: body.providers || current.providers,
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, settings: saved.settings, runtime: aiProviderManager.providerRuntimeInfo(saved.settings), persistence: { source: saved.source, supabase: saved.supabasePersist } });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.post('/provider/:id/mode', async (req, res) => {
    const id = String(req.params.id || '').trim();
    const mode = String(req.body?.mode || '').toUpperCase();
    if (!['ACTIVE', 'MONITOR', 'OFF'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be ACTIVE, MONITOR or OFF' });
    const loaded = await getProviderSettingsPersistent();
    const settings = loaded.settings;
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
    const saved = await saveProviderSettingsPersistent(settings);
    res.json({ ok: true, settings: saved.settings, runtime: aiProviderManager.providerRuntimeInfo(saved.settings), persistence: { source: saved.source, supabase: saved.supabasePersist } });
  });

  router.post('/provider/:id/role', async (req, res) => {
    const id = String(req.params.id || '').trim();
    const role = String(req.body?.role || '').toLowerCase();
    const enabled = req.body?.enabled === true;
    if (!['active', 'monitor', 'learning', 'evaluate', 'propose'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'role must be active, monitor, learning, evaluate or propose' });
    }
    const loaded = await getProviderSettingsPersistent();
    const settings = loaded.settings;
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
    const saved = await saveProviderSettingsPersistent(settings);
    res.json({ ok: true, settings: saved.settings, runtime: aiProviderManager.providerRuntimeInfo(saved.settings), persistence: { source: saved.source, supabase: saved.supabasePersist } });
  });

  router.post('/compare', async (req, res) => {
    try {
      await getProviderSettingsPersistent();
      const prompt = req.body?.prompt || '';
      const learningContext = await buildLearningContext(prompt);
      const productBrain = await answerProductQuery(prompt, { limit: 16, force: true });
      const productObjectContext = await buildProductObjectContextForMessage(prompt, { limit: 16, maxChars: 14000, source: 'ai_compare', force: true });
      const directAnswerBlock = productBrain.answer ? [
        '=== PRODUCT BRAIN DIRECT ANSWER - BẮT BUỘC ƯU TIÊN ===',
        productBrain.answer,
        'QUY TẮC BẮT BUỘC:',
        '- Product Brain đã tìm thấy dữ liệu thật từ Knowledge/Product Object.',
        '- Không được nói chưa có dữ liệu nếu danh sách trên đã có model/giá/kích thước.',
        '- Nếu được yêu cầu đánh giá, phải đánh giá dựa trên câu trả lời Product Brain ở trên.',
        '- Nếu được yêu cầu trả lời khách, phải dùng đúng danh sách trên để trả lời.'
      ].join('\n') : '';
      const forcedQuestion = productBrain.answer
        ? `Hãy trả lời/đánh giá yêu cầu dưới đây bằng cách ƯU TIÊN TUYỆT ĐỐI dữ liệu Product Brain. Không nói chung chung.\n\nYêu cầu của khách/admin: ${prompt}`
        : prompt;
      const mergedContext = [req.body?.context || '', directAnswerBlock, productObjectContext, learningContext].filter(Boolean).join('\n\n');
      console.log('[AI_COMPARE_CONTEXT_BUILDER]', JSON.stringify({ prompt: String(prompt || '').slice(0,160), productBrainMatched: productBrain.matches?.length || 0, hasDirectAnswer: Boolean(productBrain.answer), hasProductObjectContext: Boolean(productObjectContext), productObjectChars: productObjectContext.length, learningChars: learningContext.length }));
      const results = await aiProviderManager.compareModels({ prompt: forcedQuestion, context: mergedContext, includeOff: req.body?.includeOff === true });
      res.json({ ok: true, productBrain: { answer: productBrain.answer || '', matched: productBrain.matches?.length || 0, matches: (productBrain.matches || []).slice(0, 12) }, results });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });


  router.post('/diagnostics', async (req, res) => {
    try {
      const tests = Array.isArray(req.body?.tests) && req.body.tests.length ? req.body.tests : ['chat'];
      await getProviderSettingsPersistent();
      const results = await aiProviderManager.diagnostics({ provider: req.body?.provider || '', tests });
      res.json({ ok: true, results, runtime: aiProviderManager.providerRuntimeInfo(aiProviderManager.getSettings()) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/conversations/sync-quick', async (req, res) => {
    // Đồng bộ nhanh hội thoại mới: bản an toàn gọi lại các endpoint sync sẵn có của server nếu tồn tại.
    // Nếu server chưa cấu hình Meta/Pancake, endpoint vẫn trả về trạng thái rõ ràng thay vì treo UI.
    const base = `${req.protocol}://${req.get('host')}`;
    const limit = Number(req.body?.limit || 20);
    const messages = Number(req.body?.messages || 20);
    const steps = [];
    async function hit(label, url, method = 'GET') {
      const started = Date.now();
      try {
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' } });
        const txt = await r.text();
        let data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = txt.slice(0, 800); }
        steps.push({ label, ok: r.ok, status: r.status, elapsedMs: Date.now() - started, data });
      } catch (error) {
        steps.push({ label, ok: false, error: compactError(error), elapsedMs: Date.now() - started });
      }
    }
    await hit('Messenger sync', `${base}/api/sync/messenger?limit=${encodeURIComponent(limit)}&messages=${encodeURIComponent(messages)}`, 'POST');
    await hit('Pancake sync', `${base}/pancake-sync-to-supabase?limit=${encodeURIComponent(limit)}`, 'GET');
    res.json({ ok: true, message: 'Đã chạy đồng bộ nhanh. Hãy tìm lại hội thoại sau vài giây.', steps });
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


  router.get('/learning/settings', async (req, res) => {
    try {
      res.json({ ok: true, settings: await getLearningSettingsPersistent() });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.post('/learning/settings', async (req, res) => {
    try {
      const body = req.body || {};
      const { settings, supabasePersist } = await saveLearningSettingsPersistent({
        active: body.active !== undefined ? body.active === true : undefined,
        autoProcess: body.autoProcess !== undefined ? body.autoProcess === true : undefined,
        requireApproval: body.requireApproval !== undefined ? body.requireApproval === true : undefined,
        targetDays: Number(body.targetDays || getLearningSettings().targetDays || 7),
        aiMemory: body.aiMemory || getLearningSettings().aiMemory || { enabled: true, requireAdminApproval: true, exportEnabled: true }
      });
      res.json({ ok: true, settings, supabasePersist });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get('/learning/items', (req, res) => {
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').toLowerCase();
    let items = readLearningItems();
    if (status) items = items.filter(x => String(x.status || '') === status);
    if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
    res.json({ ok: true, items: items.slice(0, Number(req.query.limit || 200)), settings: getLearningSettings() });
  });



  router.post('/learning/upload-chunk', async (req, res) => {
    try {
      const chunkLimitMb = Number(process.env.LEARNING_CHUNK_UPLOAD_LIMIT_MB || 12);
      const raw = await readRequestBuffer(req, chunkLimitMb);
      const parsed = parseMultipartFormData(req, raw);
      const file = parsed.files[0];
      if (!file) return res.status(400).json({ ok: false, error: 'Không nhận được chunk upload.' });
      const fields = parsed.fields || {};
      const uploadId = cleanFilename(fields.uploadId || 'chunk_upload').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = fields.filename || file.filename || 'upload.bin';
      const mimeType = fields.mimeType || file.mimeType || 'application/octet-stream';
      const note = fields.note || '';
      const sourceType = fields.sourceType || 'upload_chunked';
      const index = Number(fields.index || 0);
      const total = Number(fields.total || 0);
      if (!uploadId || !Number.isFinite(index) || !Number.isFinite(total) || total < 1 || index < 0 || index >= total) {
        return res.status(400).json({ ok: false, error: 'Thông tin chunk không hợp lệ.' });
      }
      ensureLearningDir();
      const chunkDir = path.join(LEARNING_DIR, '_chunks', uploadId);
      fs.mkdirSync(chunkDir, { recursive: true });
      fs.writeFileSync(path.join(chunkDir, `${String(index).padStart(5, '0')}.part`), file.buffer);
      fs.writeFileSync(path.join(chunkDir, 'meta.json'), JSON.stringify({ filename, mimeType, note, sourceType, total, updatedAt: new Date().toISOString() }, null, 2));
      const received = fs.readdirSync(chunkDir).filter(x => x.endsWith('.part')).length;
      if (received < total) {
        return res.json({ ok: true, uploadId, received, total, complete: false });
      }
      const buffers = [];
      for (let i = 0; i < total; i++) {
        const partPath = path.join(chunkDir, `${String(i).padStart(5, '0')}.part`);
        if (!fs.existsSync(partPath)) return res.status(409).json({ ok: false, error: `Thiếu chunk ${i + 1}/${total}.`, uploadId, received, total });
        buffers.push(fs.readFileSync(partPath));
      }
      const fullBuffer = Buffer.concat(buffers);
      const saved = await createLearningUploadItemFromBuffer({ filename, mimeType, size: fullBuffer.length, note, sourceType }, fullBuffer);
      try { fs.rmSync(chunkDir, { recursive: true, force: true }); } catch (_) {}
      res.json({ ok: true, uploadId, received, total, complete: true, item: { ...saved.item, filePath: undefined }, learningResult: saved.learningResult, supabasePersist: saved.supabasePersist });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/learning/upload-file', async (req, res) => {
    try {
      const limitMb = Number(process.env.LEARNING_UPLOAD_LIMIT_MB || 80);
      const directLimitMb = Number(process.env.LEARNING_DIRECT_UPLOAD_WARN_MB || 30);
      const contentLength = Number(req.headers['content-length'] || 0);
      if (contentLength && contentLength > limitMb * 1024 * 1024) {
        return res.status(413).json({ ok: false, error: `File quá lớn (${Math.round(contentLength/1024/1024)}MB). Giới hạn backend hiện tại ${limitMb}MB. Hãy tách/nén file trước khi upload.` });
      }
      if (contentLength && contentLength > directLimitMb * 1024 * 1024) {
        return res.status(413).json({ ok: false, error: `File ${Math.round(contentLength/1024/1024)}MB quá lớn để upload trực tiếp ổn định. Hãy tách/nén xuống dưới ${directLimitMb}MB để tránh lỗi Render 520.` });
      }
      const raw = await readRequestBuffer(req, limitMb);
      const parsed = parseMultipartFormData(req, raw);
      if (!parsed.files.length) return res.status(400).json({ ok: false, error: 'Không nhận được file upload.' });
      const results = [];
      for (const file of parsed.files) {
        const saved = await createLearningUploadItemFromBuffer({
          filename: file.filename || 'upload.bin',
          mimeType: file.mimeType || 'application/octet-stream',
          size: file.buffer.length,
          note: parsed.fields.note || '',
          sourceType: parsed.fields.sourceType || 'upload'
        }, file.buffer);
        results.push({ item: { ...saved.item, filePath: undefined }, learningResult: saved.learningResult, supabasePersist: saved.supabasePersist });
      }
      res.json({ ok: true, items: results.map(x => x.item), results });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/learning/upload', async (req, res) => {
    try {
      const body = req.body || {};
      const parsed = dataUrlToBuffer(body.dataUrl || '');
      if (!parsed) return res.status(400).json({ ok: false, error: 'dataUrl is required. Nếu file lớn, frontend nên dùng /learning/upload-file bằng FormData.' });
      const saved = await createLearningUploadItemFromBuffer({
        filename: body.filename || 'upload.bin',
        mimeType: body.mimeType || parsed.mimeType,
        size: Number(body.size || parsed.buffer.length),
        note: body.note || '',
        sourceType: body.sourceType || 'upload'
      }, parsed.buffer);
      res.json({ ok: true, item: { ...saved.item, filePath: undefined }, learningResult: saved.learningResult, supabasePersist: saved.supabasePersist });
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

  router.post('/learning/item/:id/status', async (req, res) => {
    try {
      const allowed = ['uploaded','pending_review','approved','rejected','needs_attention'];
      const status = String(req.body?.status || '');
      if (!allowed.includes(status)) return res.status(400).json({ ok: false, error: 'invalid status' });
      const items = readLearningItems();
      const idx = items.findIndex(x => x.id === req.params.id);
      if (idx < 0) return res.status(404).json({ ok: false, error: 'item not found' });
      items[idx] = { ...items[idx], status, adminNote: req.body?.adminNote || items[idx].adminNote || '', reviewedAt: new Date().toISOString() };
      let supabaseApprove = null;
      if (status === 'approved') {
        const knowledge = readApprovedKnowledge();
        const draft = items[idx].draft || items[idx].learningResult?.draft || {};
        knowledge.unshift({ id: `know_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, sourceItemId: items[idx].id, filename: items[idx].filename, createdAt: new Date().toISOString(), status: 'approved', draft, adminNote: items[idx].adminNote || '' });
        writeApprovedKnowledge(knowledge.slice(0, 1000));
        try { supabaseApprove = await approveLearningItemInSupabase(items[idx]); }
        catch (error) { supabaseApprove = { ok: false, error: compactError(error) }; }
        items[idx].supabaseApprove = supabaseApprove;
      }
      writeLearningItems(items);
      res.json({ ok: true, item: items[idx], supabaseApprove });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });



  router.post('/learning/knowledge/:documentId/absorb', async (req, res) => {
    try {
      const result = await absorbApprovedDocument(req.params.documentId, req.body?.item || {});
      res.json({ ok: result.ok === true, result });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.post('/learning/knowledge/absorb-all', async (req, res) => {
    try {
      if (!supabaseIsReady()) return res.status(400).json({ ok: false, error: 'Supabase chưa bật.' });
      const onlyMissing = req.body?.onlyMissing !== false;
      const docs = await supabaseTry('ai_learning_documents?select=*&status=eq.approved&order=updated_at.desc&limit=200');
      const results = [];
      for (const doc of docs) {
        if (onlyMissing && doc.metadata?.knowledge_absorption?.absorption_status) continue;
        try { results.push(await absorbApprovedDocument(doc.id, {})); }
        catch (error) { results.push({ ok: false, documentId: doc.id, error: compactError(error) }); }
        if (results.length >= Number(req.body?.limit || 50)) break;
      }
      res.json({ ok: true, processed: results.length, results });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get('/learning/summary', async (req, res) => {
    try {
      const summary = summarizeLearning();
      const counts = await getSupabaseLearningCounts();
      summary.supabase = counts;
      if (supabaseIsReady()) {
        const absorbedRows = await supabaseTry('learning_segments?select=id&active=eq.true&attributes->>approved=eq.true&attributes->>absorption_status=eq.absorbed&limit=10000');
        const partialRows = await supabaseTry('learning_segments?select=id&active=eq.true&attributes->>approved=eq.true&attributes->>absorption_status=eq.partial&limit=10000');
        const needsRows = await supabaseTry('learning_segments?select=id&active=eq.true&attributes->>approved=eq.true&attributes->>absorption_status=eq.needs_extraction&limit=10000');
        summary.absorption = { absorbed: absorbedRows.length, partial: partialRows.length, needsExtraction: needsRows.length };
      }
      // Ưu tiên số liệu Supabase cho Knowledge vì đây là nguồn bền vững sau deploy.
      summary.approvedKnowledge = Math.max(summary.approvedKnowledge || 0, counts.approvedSegments || 0);
      res.json({ ok: true, summary, settings: await getLearningSettingsPersistent() });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });


  router.get('/learning/knowledge/search', async (req, res) => {
    try {
      const query = String(req.query.query || req.query.q || '').trim();
      const limit = Number(req.query.limit || 10);
      const productId = req.query.productId || req.query.product_id || detectProductId(query);
      const knowledgeType = req.query.knowledgeType || req.query.knowledge_type || inferKnowledgeType(query);
      const result = await searchKnowledge(query, { limit, productId, knowledgeType });
      res.json({
        ok: true,
        version: '7.4.0',
        productId,
        knowledgeType,
        trace: result.trace,
        items: result.items.map(r => ({
          id: r.id,
          documentId: r.document_id,
          position: r.position,
          score: r._score || 0,
          productIds: r._productIds || [],
          knowledgeTypes: r._knowledgeTypes || [],
          text: String(r.text_value || '').slice(0, 2000),
          attributes: r.attributes || {},
          updatedAt: r.updated_at
        }))
      });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get('/learning/knowledge', async (req, res) => {
    try {
      const q = String(req.query.q || '').toLowerCase();
      const limit = Number(req.query.limit || 200);
      let localItems = readApprovedKnowledge();
      if (q) localItems = localItems.filter(x => JSON.stringify(x).toLowerCase().includes(q));
      const remoteItems = await listSupabaseKnowledge(q, limit);
      res.json({ ok: true, source: supabaseIsReady() ? 'supabase+local' : 'local_only', items: [...remoteItems, ...localItems].slice(0, limit) });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.post('/learning/knowledge/add', async (req, res) => {
    try {
      const body = req.body || {};
      const text = String(body.answer || body.text || '').trim();
      if (!text) return res.status(400).json({ ok: false, error: 'Thiếu nội dung kiến thức cần lưu.' });
      const item = { id: `know_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), status: 'approved', source: 'ai_compare_admin_saved', provider: body.provider || '', question: body.question || '', topic: body.topic || guessCategoryFromFilename(body.question || ''), productGroup: body.productGroup || body.topic || '', answer: text, score: body.score || null, tags: Array.isArray(body.tags) ? body.tags : [], draft: { summary: text.slice(0, 500), detected_category: body.productGroup || body.topic || '', sales_faq: body.question ? [{ q: body.question, a: text }] : [], confidence_0_100: 100, needs_admin_review: false } };
      const knowledge = readApprovedKnowledge();
      knowledge.unshift(item);
      writeApprovedKnowledge(knowledge.slice(0, 3000));
      let supabasePersist = null;
      try { supabasePersist = await addApprovedKnowledgeToSupabase(item); } catch (error) { supabasePersist = { ok: false, error: compactError(error) }; }
      aiProviderManager.appendReport({ type: 'knowledge_saved', level: 'green', provider: item.provider || 'admin', title: 'Admin thêm vào kiến thức AI', lesson: text.slice(0, 1000), tags: ['ai_memory', item.productGroup || ''] });
      res.json({ ok: true, item, supabasePersist });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });



async function inferAiBrainObjectFromSegment(row = {}) {
  const text = String(row.text_value || '').trim();
  const a = row.attributes || {};
  const hay = `${text}\n${JSON.stringify(a)}`.toLowerCase();
  const productGroup = String(a.product_group || a.category || a.detected_category || a.topic || '').trim();
  let objectType = a.object_type || 'knowledge_note';
  if (/(giá|vnđ|vnd|model|mã|kich thuoc|kích thước|size|bảo hành|bao hanh|chất liệu|chat lieu|sản phẩm|san pham|bồn tắm|bon tam|quạt|quat|lavabo|sen|bệt|bon cau|bồn cầu)/i.test(hay)) objectType = 'product_knowledge';
  if (/(faq|câu hỏi|khách hỏi|hoi dap|hỏi đáp)/i.test(hay)) objectType = 'faq';
  if (/(quy tắc|rule|không được|phải|ưu tiên|bắt buộc|nguyên tắc)/i.test(hay)) objectType = 'business_rule';
  if (/(kinh nghiệm|sale|chốt|tư vấn|xử lý tình huống|khách từ chối)/i.test(hay)) objectType = 'sales_experience';
  if (/(hiến pháp|constitution|kỷ luật|nguyên tắc ai)/i.test(hay)) objectType = 'ai_constitution';
  const productObject = parseProductFromSegment(row);
  const aliases = [];
  if (productObject) {
    objectType = 'product';
    aliases.push(...(productObject.aliases || []));
  }
  if (Array.isArray(a.aliases)) aliases.push(...a.aliases);
  if (a.filename) aliases.push(a.filename);
  if (a.title) aliases.push(a.title);
  if (productGroup) aliases.push(productGroup);
  const hasRealText = text.length >= 80 && !/chưa có (văn bản|nội dung)|không trích xuất|chưa trích xuất/i.test(text.slice(0, 800));
  const productSignals = /(giá|vnđ|vnd|model|mã|kích thước|size|bảo hành|chất liệu|thông số)/i.test(text);
  const score = Math.max(25, Math.min(100, (hasRealText ? 55 : 20) + (productGroup ? 10 : 0) + (productSignals ? 25 : 0) + (a.absorption_status === 'absorbed' ? 10 : 0)));
  const title = a.title || a.filename || a.topic || a.product_group || a.category || `AI Brain Object ${row.id || ''}`;
  const finalScore = productObject ? Math.max(score, productObject.confidence || 0) : score;
  return {
    object_type: objectType,
    title: String((productObject && (productObject.name || productObject.model)) || title || '').slice(0, 220),
    category: (productObject && productObject.category) || productGroup,
    product_group: (productObject && productObject.category) || productGroup,
    aliases: Array.from(new Set(aliases.filter(Boolean).map(x => String(x).trim()).filter(Boolean))).slice(0, 40),
    content: text.slice(0, 12000),
    product_object: productObject || null,
    source_segment_id: row.id || '',
    source_document_id: row.document_id || '',
    confidence_0_100: finalScore,
    status: finalScore >= 70 ? 'absorbed' : 'partial'
  };
}

async function buildAiBrainFromExistingKnowledge(options = {}) {
  if (!supabaseIsReady()) return { ok: false, error: 'Supabase chưa bật nên không thể xây dựng AI Brain.' };
  const now = new Date().toISOString();
  const totalLimit = Math.max(1, Math.min(50000, Number(options.totalLimit || options.limit || 20000)));
  const batchSize = Math.max(5, Math.min(25, Number(options.batchSize || 25))); // V7.2.5: batch nhỏ để không timeout/502 trên Render
  const offset = Math.max(0, Number(options.offset || 0));
  const includeInactive = options.includeInactive !== false;
  const select = 'id,document_id,position,text_value,attributes,active,created_at,updated_at';
  // V7.2.4: build theo batch nhỏ để không còn 502/timeout Render.
  const rows = await supabaseTry(`learning_segments?select=${select}&order=updated_at.desc&limit=${batchSize}&offset=${offset}`);
  const candidates = rows.filter(r => {
    const text = String(r?.text_value || '').trim();
    if (!r?.id || text.length < 20) return false;
    if (!includeInactive && r.active === false) return false;
    return true;
  });
  const result = {
    ok: true,
    version: '7.2.5',
    offset,
    batchSize,
    totalLimit,
    scanned: candidates.length,
    fetched: rows.length,
    updated: 0,
    reactivated: 0,
    skipped: 0,
    byType: {},
    errors: [],
    hasMore: rows.length === batchSize && (offset + batchSize) < totalLimit,
    nextOffset: offset + batchSize
  };
  for (const row of candidates) {
    try {
      const object = await inferAiBrainObjectFromSegment(row);
      const old = row.attributes || {};
      const merged = {
        ...old,
        approved: old.approved !== false,
        admin_approved: old.admin_approved !== false,
        ai_brain_version: '7.2.5',
        brain_built_at: now,
        brain_object_type: object.object_type,
        object_type: object.object_type || old.object_type,
        title: old.title || object.title,
        category: object.category || old.category,
        product_group: object.product_group || old.product_group,
        aliases: Array.from(new Set([...(Array.isArray(old.aliases) ? old.aliases : []), ...object.aliases])).slice(0, 80),
        absorption_status: object.status || old.absorption_status || 'partial',
        absorption_score_0_100: Math.max(Number(old.absorption_score_0_100 || 0), object.confidence_0_100),
        absorbed_summary: old.absorbed_summary || object.content.slice(0, 1200),
        knowledge_object: object,
        product_object: object.product_object || old.product_object || null,
        product_brain_ready: Boolean(object.product_object || old.product_object),
        source: old.source || 'ai_brain_build_existing_knowledge'
      };
      await supabaseRequest(`learning_segments?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ active: true, attributes: merged, updated_at: now })
      });
      if (row.active === false) result.reactivated += 1;
      result.updated += 1;
      result.byType[object.object_type] = (result.byType[object.object_type] || 0) + 1;
    } catch (error) {
      result.errors.push({ id: row.id, error: compactError(error) });
      result.skipped += 1;
    }
  }
  const prev = await loadAiLearningSettingFromSupabase('ai_brain_build_status') || {};
  const aggregate = {
    ...prev,
    ok: true,
    version: '7.2.5',
    builtAt: now,
    lastBatch: result,
    updated: Number(prev.updated || 0) + result.updated,
    reactivated: Number(prev.reactivated || 0) + result.reactivated,
    scanned: Number(prev.scanned || 0) + result.scanned,
    errors: [...(Array.isArray(prev.errors) ? prev.errors : []), ...result.errors].slice(-50),
    byType: { ...(prev.byType || {}) }
  };
  for (const [k, v] of Object.entries(result.byType || {})) aggregate.byType[k] = (aggregate.byType[k] || 0) + v;
  await saveAiLearningSettingToSupabase('ai_brain_build_status', aggregate, 'system');
  aiProviderManager.appendReport({ type: 'ai_brain_built_batch', level: result.errors.length ? 'yellow' : 'green', provider: 'system', title: 'Xây dựng AI Brain theo batch', lesson: `Batch offset ${offset}: quét ${result.scanned}, cập nhật ${result.updated}, hasMore=${result.hasMore}.`, tags: ['ai_brain', 'build', 'v7.2.5'] });
  return result;
}

async function getAiBrainBuildStatus() {
  const counts = { total: 0, built: 0, absorbed: 0, partial: 0, needsExtraction: 0, inactive: 0 };
  let lastBuild = null;
  if (supabaseIsReady()) {
    const all = await supabaseTry('learning_segments?select=id,active,attributes&limit=20000');
    counts.total = all.length;
    for (const r of all) {
      const a = r.attributes || {};
      if (r.active === false) counts.inactive += 1;
      if (a.ai_brain_version) counts.built += 1;
      if (a.absorption_status === 'absorbed') counts.absorbed += 1;
      else if (a.absorption_status === 'partial') counts.partial += 1;
      else if (a.absorption_status === 'needs_extraction') counts.needsExtraction += 1;
    }
    const settings = await loadAiLearningSettingFromSupabase('ai_brain_build_status');
    lastBuild = settings || null;
  }
  return { ok: true, counts, lastBuild, job: aiBrainBuildJob };
}


  router.post('/learning/brain/build', async (req, res) => {
    try {
      const body = req.body || {};
      // V7.2.6: không xử lý toàn bộ build trong một HTTP request nữa để tránh timeout/502.
      // Mặc định enqueue job nền; nếu cần debug từng batch có thể gửi {background:false}.
      if (body.background === false) {
        const result = await buildAiBrainFromExistingKnowledge(body);
        return res.json(result);
      }
      if (aiBrainBuildJob.running) return res.json({ ok: true, queued: true, running: true, message: 'AI Brain đang được xây dựng nền, vui lòng bấm Kiểm tra trạng thái sau ít phút.', job: aiBrainBuildJob });
      aiBrainBuildJob = { running: true, startedAt: new Date().toISOString(), finishedAt: null, lastResult: null, error: null };
      setImmediate(async () => {
        let offset = 0;
        const totalLimit = Math.max(1, Math.min(50000, Number(body.totalLimit || body.limit || 20000)));
        const batchSize = Math.max(5, Math.min(25, Number(body.batchSize || 25)));
        try {
          let last = null;
          while (offset < totalLimit) {
            last = await buildAiBrainFromExistingKnowledge({ ...body, background: false, totalLimit, batchSize, offset });
            aiBrainBuildJob.lastResult = last;
            if (!last?.hasMore) break;
            offset = Number(last.nextOffset || (offset + batchSize));
          }
          aiBrainBuildJob.finishedAt = new Date().toISOString();
        } catch (error) {
          aiBrainBuildJob.error = compactError(error);
          aiBrainBuildJob.finishedAt = new Date().toISOString();
          console.error('[AI_BRAIN_BACKGROUND_BUILD_ERROR]', error);
        } finally {
          aiBrainBuildJob.running = false;
        }
      });
      res.json({ ok: true, queued: true, running: true, message: 'Đã đưa AI Brain Build vào hàng đợi nền. UI không bị treo nữa.', job: aiBrainBuildJob });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get('/learning/brain/status', async (req, res) => {
    try {
      const result = await getAiBrainBuildStatus();
      res.json(result);
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get('/learning/brain/summary', async (req, res) => {
    try {
      const summary = await loadAiLearningSettingFromSupabase('brain_summary');
      res.json({ ok: true, summary: summary || null });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });


  router.post('/learning/brain-object/add', async (req, res) => {
    try {
      const body = req.body || {};
      const content = String(body.content || body.lesson || body.answer || body.text || '').trim();
      const title = String(body.title || body.name || '').trim();
      if (!title || !content) return res.status(400).json({ ok: false, error: 'Thiếu tiêu đề hoặc nội dung tri thức cần đưa vào AI Brain.' });
      const result = await addBrainObjectToSupabase(body);
      aiProviderManager.appendReport({
        type: 'ai_brain_object_saved',
        level: 'green',
        provider: 'admin',
        title: `AI Brain Object: ${title}`,
        lesson: content.slice(0, 1000),
        tags: ['ai_brain', body.objectType || body.type || 'knowledge_object', body.productGroup || body.category || '']
      });
      res.json({ ok: true, result });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get('/learning/brain-objects', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const limit = Number(req.query.limit || 200);
      const base = 'active=eq.true&attributes->>approved=eq.true&attributes->>ai_brain_version=eq.7.2.0&select=id,document_id,text_value,attributes,created_at,updated_at';
      const path = q
        ? `learning_segments?${base}&text_value=ilike.${encodeURIComponent(likeValue(q.slice(0, 90)))}&order=updated_at.desc&limit=${limit}`
        : `learning_segments?${base}&order=updated_at.desc&limit=${limit}`;
      const rows = await supabaseTry(path);
      res.json({ ok: true, items: rows.map(r => ({ id: r.id, documentId: r.document_id, text: r.text_value, attributes: r.attributes || {}, createdAt: r.created_at, updatedAt: r.updated_at })) });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });


  router.post('/learning/product-objects/resolve', async (req, res) => {
    try {
      const query = String(req.body?.query || req.body?.prompt || req.body?.q || '').trim();
      const result = await answerProductQuery(query, { limit: Number(req.body?.limit || 20), force: req.body?.force === true });
      res.json({ ok: true, ...result });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });


  router.post('/learning/feedback', async (req, res) => {
    try {
      const body = req.body || {};
      const productId = body.productId || body.product_id || detectProductId([body.customerMessage, body.botReply, body.correctReply, body.note].filter(Boolean).join('\n')) || '';
      const errorType = body.errorType || body.error_type || 'unknown';
      const status = body.status || 'pending';
      const item = {
        id: `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        type: 'feedback_memory',
        title: body.title || `Feedback ${errorType}${productId ? ` - ${productId}` : ''}`,
        errorType,
        productId,
        customerMessage: body.customerMessage || body.customer_message || '',
        botReply: body.botReply || body.bot_reply || '',
        correctReply: body.correctReply || body.correct_reply || '',
        lesson: body.lesson || body.note || body.correctReply || '',
        wrongExample: body.wrongExample || body.botReply || '',
        rightExample: body.rightExample || body.correctReply || '',
        appliesTo: productId || body.appliesTo || 'all',
        priority: Number(body.priority || 5),
        status,
        source: body.source || 'ai_comparison_feedback'
      };
      const items = readExperiences();
      items.unshift(item);
      writeExperiences(items.slice(0, 3000));
      let supabasePersist = null;
      if (['approved', 'active', 'applied'].includes(String(status).toLowerCase())) {
        supabasePersist = await addApprovedKnowledgeToSupabase({
          title: `Feedback Memory - ${item.title}`,
          topic: item.appliesTo,
          productGroup: item.productId || item.appliesTo,
          provider: 'feedback',
          question: item.customerMessage || item.title,
          answer: [
            item.lesson,
            item.wrongExample ? `Ví dụ sai: ${item.wrongExample}` : '',
            item.rightExample ? `Ví dụ đúng: ${item.rightExample}` : '',
            item.errorType ? `Loại lỗi: ${item.errorType}` : ''
          ].filter(Boolean).join('\n'),
          tags: ['feedback_memory', item.errorType, item.productId].filter(Boolean),
          score: item.priority
        });
      }
      aiProviderManager.appendReport({ type: 'feedback_memory_saved', level: status === 'pending' ? 'yellow' : 'green', provider: 'feedback', title: item.title, lesson: item.lesson, tags: ['feedback_memory', item.errorType, item.productId].filter(Boolean) });
      res.json({ ok: true, item, supabasePersist, note: status === 'pending' ? 'Feedback đã lưu ở trạng thái chờ duyệt, chưa áp dụng vào bot.' : 'Feedback đã được lưu và đưa vào Knowledge Engine.' });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.post('/learning/feedback/:id/approve', async (req, res) => {
    try {
      const items = readExperiences();
      const idx = items.findIndex(x => x.id === req.params.id);
      if (idx < 0) return res.status(404).json({ ok: false, error: 'feedback not found' });
      const item = { ...items[idx], status: 'approved', approvedAt: new Date().toISOString() };
      items[idx] = item;
      writeExperiences(items);
      const supabasePersist = await addApprovedKnowledgeToSupabase({
        title: `Feedback Memory - ${item.title}`,
        topic: item.appliesTo,
        productGroup: item.productId || item.appliesTo,
        provider: 'feedback',
        question: item.customerMessage || item.title,
        answer: [item.lesson, item.wrongExample ? `Ví dụ sai: ${item.wrongExample}` : '', item.rightExample ? `Ví dụ đúng: ${item.rightExample}` : '', item.errorType ? `Loại lỗi: ${item.errorType}` : ''].filter(Boolean).join('\n'),
        tags: ['feedback_memory', item.errorType, item.productId].filter(Boolean),
        score: item.priority || 5
      });
      aiProviderManager.appendReport({ type: 'feedback_memory_approved', level: 'green', provider: 'feedback', title: item.title, lesson: item.lesson, tags: ['feedback_memory', item.errorType, item.productId].filter(Boolean) });
      res.json({ ok: true, item, supabasePersist });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get('/learning/experiences', (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    let items = readExperiences();
    if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
    res.json({ ok: true, items: items.slice(0, Number(req.query.limit || 200)) });
  });

  router.post('/learning/experience', async (req, res) => {
    const body = req.body || {};
    const item = {
      id: `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      title: body.title || 'Kinh nghiệm mới',
      type: body.type || 'sales_experience',
      appliesTo: body.appliesTo || 'all',
      priority: Number(body.priority || 3),
      lesson: body.lesson || '',
      wrongExample: body.wrongExample || '',
      rightExample: body.rightExample || '',
      status: body.status || 'draft',
      source: body.source || 'mentor'
    };
    const items = readExperiences();
    items.unshift(item);
    writeExperiences(items.slice(0, 1000));
    let supabasePersist = null;
    try {
      supabasePersist = await addApprovedKnowledgeToSupabase({ title: `Experience - ${item.title}`, topic: item.appliesTo, productGroup: item.appliesTo, provider: 'mentor', question: item.title, answer: [item.lesson, item.wrongExample ? `Ví dụ sai: ${item.wrongExample}` : '', item.rightExample ? `Ví dụ đúng: ${item.rightExample}` : ''].filter(Boolean).join('\n'), tags: [item.type, item.appliesTo, 'experience'], score: item.priority });
    } catch (error) { supabasePersist = { ok: false, error: compactError(error) }; }
    aiProviderManager.appendReport({ type: 'experience_saved', level: 'green', provider: 'mentor', title: item.title, lesson: item.lesson, tags: [item.type, item.appliesTo] });
    res.json({ ok: true, item, supabasePersist });
  });

  router.post('/learning/experience/:id/status', (req, res) => {
    const items = readExperiences();
    const idx = items.findIndex(x => x.id === req.params.id);
    if (idx < 0) return res.status(404).json({ ok: false, error: 'experience not found' });
    items[idx] = { ...items[idx], status: req.body?.status || items[idx].status, updatedAt: new Date().toISOString() };
    writeExperiences(items);
    res.json({ ok: true, item: items[idx] });
  });

  router.get('/learning/export', async (req, res) => {
    try {
      const payload = await exportAiBrainPayload();
      const filename = `aiguka_ai_brain_export_${new Date().toISOString().slice(0,10)}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(JSON.stringify(payload, null, 2));
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.post('/learning/import', async (req, res) => {
    try {
      const body = req.body || {};
      let payload = body.payload || body;
      if (body.dataUrl) {
        const parsed = dataUrlToBuffer(body.dataUrl);
        if (!parsed) return res.status(400).json({ ok: false, error: 'dataUrl không hợp lệ.' });
        payload = JSON.parse(parsed.buffer.toString('utf8'));
      }
      const result = await importAiBrainPayload(payload);
      res.json(result);
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get('/learning/persistence-check', async (req, res) => {
    try {
      const counts = await getSupabaseLearningCounts();
      const settings = await getLearningSettingsPersistent();
      const providerLoaded = await getProviderSettingsPersistent();
      const providerRoles = aiProviderManager.providerRuntimeInfo(providerLoaded.settings);
      res.json({ ok: true, supabaseReady: supabaseIsReady(), counts, settingsStorage: settings.storage, providerPersistence: { source: providerLoaded.source, supabase: providerLoaded.supabasePersist, roles: Object.fromEntries(Object.entries(providerRoles).map(([k,v]) => [k, v.roles])) }, safeToDeploy: supabaseIsReady() && counts.documents >= 1 && counts.segments >= 1 && providerLoaded.source === 'supabase' });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get('/conversations/search', async (req, res) => {
    try {
      const qRaw = String(req.query.q || '').trim();
      const q = qRaw.toLowerCase();
      const source = String(req.query.source || '');
      const limit = Number(req.query.limit || 50);
      const rows = [];

      // Ưu tiên Supabase vì hội thoại production được log ở đây.
      if (!source || source === 'supabase') {
        rows.push(...await searchSupabaseConversations(qRaw, limit));
      }

      // Fallback local để không mất chức năng cũ khi Supabase tắt hoặc chưa có dữ liệu.
      if (!source || source !== 'supabase') {
        let localRows = flattenConversationRecords();
        if (source && source !== 'supabase') localRows = localRows.filter(x => x.source === source);
        if (q) localRows = localRows.filter(x => `${x.id} ${x.customerId || ''} ${x.title} ${x.text}`.toLowerCase().includes(q));
        rows.push(...localRows.map(x => ({ id: x.id, customerId: x.customerId || '', senderId: x.customerId || x.id || '', source: x.source, title: x.title, preview: String(x.text || '').slice(0, 900), length: String(x.text || '').length })));
      }

      const unique = uniqBy(rows, x => `${x.source}:${x.id}`);
      res.json({
        ok: true,
        source: supabaseIsReady() ? 'supabase+local' : 'local_only',
        conversations: unique.slice(0, limit).map(x => ({
          id: x.id,
          customerId: x.customerId || '',
          senderId: x.senderId || '',
          source: x.source,
          title: x.title,
          adId: x.adId || '',
          postId: x.postId || '',
          productGroup: x.productGroup || '',
          lastMessageAt: x.lastMessageAt || '',
          preview: String(x.preview || x.text || '').slice(0, 900),
          length: x.length || String(x.preview || x.text || '').length
        }))
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/conversations/:id', async (req, res) => {
    try {
      const supa = await getSupabaseConversationByAnyId(req.params.id);
      const item = supa || findConversationById(req.params.id);
      if (!item) return res.status(404).json({ ok: false, error: 'conversation not found' });
      res.json({ ok: true, conversation: item, source: supa ? 'supabase' : 'local' });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.post('/conversations/:id/evaluate', async (req, res) => {
    try {
      const supa = await getSupabaseConversationByAnyId(req.params.id);
      let item = supa || findConversationById(req.params.id);
      const bodyText = String(req.body?.timeline || req.body?.text || '').trim();
      if (!item && bodyText) {
        item = { id: req.params.id, title: req.body?.title || req.params.id, source: 'ui_selected_timeline', text: bodyText, senderId: req.body?.senderId || '', adId: req.body?.adId || '', productGroup: req.body?.productGroup || '' };
      }
      if (item && bodyText && String(item.text || '').trim().length < bodyText.length) item.text = bodyText;
      if (!item) return res.status(404).json({ ok: false, error: 'conversation not found and no timeline payload supplied' });
      const prompt = `Bạn là AI huấn luyện bán hàng của AIGUKA. Hãy đọc toàn bộ hội thoại thật dưới đây và đánh giá để cải thiện bot lần sau.\n\nYÊU CẦU:\n- Chỉ ra bot/sale đã làm tốt gì.\n- Chỉ ra lỗi: nhận diện sai sản phẩm, hỏi lại điều đã biết, quên báo giá, quên gửi slide, xin lại số, follow-up sai, chen sale.\n- Đánh giá khả năng nhận diện QC/sản phẩm/intent/timeline.\n- Đề xuất câu trả lời tốt hơn nếu có.\n- Rút ra 1-3 kinh nghiệm ngắn gọn có thể lưu vào Experience Library.\n- Chấm điểm 0-100.\n\nTHÔNG TIN HỘI THOẠI:\nID: ${item.id}\nNguồn: ${item.source || ''}\nKhách/Sender: ${item.senderId || item.customerId || ''}\nQuảng cáo: ${item.adId || ''}\nPost: ${item.postId || ''}\nSản phẩm hệ thống nhận diện: ${item.productGroup || ''}\n\nHỘI THOẠI:\n${String(item.text || '').slice(-30000)}`;
      const results = await aiProviderManager.compareModels({ prompt, context: req.body?.context || '', includeOff: false });
      aiProviderManager.appendReport({ type: 'conversation_learning', level: 'yellow', provider: 'multi_ai', title: `Đánh giá hội thoại ${item.title || item.id}`, conversationId: item.id, results });
      res.json({ ok: true, conversation: { id: item.id, title: item.title, source: item.source, text: item.text, adId: item.adId || '', productGroup: item.productGroup || '' }, results });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
};
