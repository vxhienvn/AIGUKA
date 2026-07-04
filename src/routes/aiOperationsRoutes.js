const express = require('express');
const fs = require('fs');
const path = require('path');
const aiProviderManager = require('../ai/providerManager');
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
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
    id: newUuid(), document_id: docId, position: Number(x.position || i + 1), text_value: String(x.text_value || '').slice(0, 8000), attributes: x.attributes || {}, active: x.active !== false, created_at: now, updated_at: now
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
    id: docId, title: payload.title || `AI Memory - ${payload.topic || payload.productGroup || 'Kiến thức'}`, description: payload.question || '', source_type: 'admin_ai_memory', product_group: payload.productGroup || payload.topic || '', status: 'approved', storage_bucket: 'supabase_row', storage_path: '', original_filename: '', mime_type: 'text/plain', file_size_bytes: Buffer.byteLength(answer, 'utf8'), checksum_sha256: crypto.createHash('sha256').update(answer).digest('hex'), is_active: true, metadata: { provider: payload.provider || '', score: payload.score || null, tags: payload.tags || [], source: 'compare_add_to_knowledge' }, created_at: now, updated_at: now
  }]) });
  await supabaseRequest('learning_segments', { method: 'POST', body: JSON.stringify([{ id: newUuid(), document_id: docId, position: 1, text_value: answer.slice(0, 8000), attributes: { topic: payload.topic || '', product_group: payload.productGroup || '', provider: payload.provider || '', question: payload.question || '', priority: payload.priority || 5, admin_approved: true }, active: true, created_at: now, updated_at: now }]) });
  return { ok: true, documentId: docId };
}

async function buildLearningContext(query = '', limit = 30) {
  const parts = [];
  const q = String(query || '').trim();
  const localKnowledge = readApprovedKnowledge().slice(0, 50).map(x => JSON.stringify(x.draft || x).slice(0, 1200));
  if (localKnowledge.length) parts.push(`KIẾN THỨC ADMIN ĐÃ DUYỆT (LOCAL):\n${localKnowledge.join('\n---\n')}`);
  if (supabaseIsReady()) {
    const encLike = encodeURIComponent(likeValue(q.slice(0, 80) || ''));
    const rows = q ? await supabaseTry(`learning_segments?text_value=ilike.${encLike}&select=text_value,attributes,created_at&active=eq.true&order=updated_at.desc&limit=${limit}`) : await supabaseTry(`learning_segments?select=text_value,attributes,created_at&active=eq.true&order=updated_at.desc&limit=${limit}`);
    if (rows.length) parts.push(`KIẾN THỨC AI TỪ SUPABASE:\n${rows.map(r => `- ${r.text_value}`).join('\n')}`);
  }
  return parts.join('\n\n').slice(0, 20000);
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
      const prompt = req.body?.prompt || '';
      const learningContext = await buildLearningContext(prompt);
      const mergedContext = [req.body?.context || '', learningContext].filter(Boolean).join('\n\n');
      const results = await aiProviderManager.compareModels({ prompt, context: mergedContext, includeOff: req.body?.includeOff === true });
      res.json({ ok: true, results });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });


  router.post('/diagnostics', async (req, res) => {
    try {
      const tests = Array.isArray(req.body?.tests) && req.body.tests.length ? req.body.tests : ['chat'];
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
      const spreadsheetSegments = spreadsheetSegmentsIfPossible(filename, body.mimeType || parsed.mimeType, parsed.buffer);
      if (spreadsheetSegments.length) item.extractedSegments = spreadsheetSegments.slice(0, 2000);
      let supabasePersist = null;
      try {
        supabasePersist = await saveLearningDocumentToSupabase(item, parsed.buffer, spreadsheetSegments);
        if (supabasePersist?.documentId) item.supabaseDocumentId = supabasePersist.documentId;
      } catch (error) {
        console.warn('[AI_LEARNING_SUPABASE_PERSIST_FAILED]', compactError(error));
        supabasePersist = { ok: false, error: compactError(error) };
      }
      const items = readLearningItems();
      items.unshift({ ...item, dataUrl: undefined, filePath: undefined, supabasePersist });
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
    if (status === 'approved') {
      const knowledge = readApprovedKnowledge();
      const draft = items[idx].draft || items[idx].learningResult?.draft || {};
      knowledge.unshift({ id: `know_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, sourceItemId: items[idx].id, filename: items[idx].filename, createdAt: new Date().toISOString(), status: 'approved', draft, adminNote: items[idx].adminNote || '' });
      writeApprovedKnowledge(knowledge.slice(0, 1000));
    }
    res.json({ ok: true, item: items[idx] });
  });


  router.get('/learning/summary', (req, res) => {
    res.json({ ok: true, summary: summarizeLearning(), settings: getLearningSettings() });
  });

  router.get('/learning/knowledge', (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    let items = readApprovedKnowledge();
    if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
    res.json({ ok: true, items: items.slice(0, Number(req.query.limit || 200)) });
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

  router.get('/learning/experiences', (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    let items = readExperiences();
    if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
    res.json({ ok: true, items: items.slice(0, Number(req.query.limit || 200)) });
  });

  router.post('/learning/experience', (req, res) => {
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
    aiProviderManager.appendReport({ type: 'experience_saved', level: 'green', provider: 'mentor', title: item.title, lesson: item.lesson, tags: [item.type, item.appliesTo] });
    res.json({ ok: true, item });
  });

  router.post('/learning/experience/:id/status', (req, res) => {
    const items = readExperiences();
    const idx = items.findIndex(x => x.id === req.params.id);
    if (idx < 0) return res.status(404).json({ ok: false, error: 'experience not found' });
    items[idx] = { ...items[idx], status: req.body?.status || items[idx].status, updatedAt: new Date().toISOString() };
    writeExperiences(items);
    res.json({ ok: true, item: items[idx] });
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
      const item = supa || findConversationById(req.params.id);
      if (!item) return res.status(404).json({ ok: false, error: 'conversation not found' });
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
