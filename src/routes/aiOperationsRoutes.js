const express = require('express');
const fs = require('fs');
const path = require('path');
const aiProviderManager = require('../ai/providerManager');

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
    `customers?zalo=ilike.${encodeURIComponent(likeValue(digits || clean))}&select=*&limit=${limit}`,
    `customers?zalo_phone=ilike.${encodeURIComponent(likeValue(digits || clean))}&select=*&limit=${limit}`
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

  // 1) Tìm trực tiếp theo conversation/sender/ad/product.
  const directAttempts = clean ? [
    `conversations?id=eq.${enc}&select=*&limit=${limit}`,
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
    const msgRows = await supabaseTry(`messages?text=ilike.${encLike}&select=id,conversation_id,sender_id,text,created_at,role,actor_type&order=created_at.desc&limit=60`);
    const convIds = uniqBy(msgRows.map(m => ({ id: m.conversation_id })).filter(x => x.id), x => x.id).slice(0, 40).map(x => x.id);
    if (convIds.length) {
      const inList = convIds.map(id => String(id).replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean).join(',');
      if (inList) out.push(...await supabaseTry(`conversations?id=in.(${inList})&select=*&order=last_message_at.desc&limit=${limit}`));
    }
  }

  return uniqBy(out, x => x.id || `${x.sender_id}:${x.session_key}`).slice(0, limit);
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
    `conversations?id=eq.${encodeURIComponent(clean)}&select=*&limit=1`,
    `conversations?sender_id=eq.${encodeURIComponent(clean)}&select=*&order=last_message_at.desc&limit=1`,
    `conversations?session_key=eq.${encodeURIComponent(clean)}&select=*&limit=1`
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
