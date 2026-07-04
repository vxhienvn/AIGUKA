const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const SETTINGS_FILE = path.join(__dirname, '..', '..', 'ai_model_control.json');
const REPORT_FILE = path.join(__dirname, '..', '..', 'ai_monitor_reports.json');

const DEFAULT_SETTINGS = {
  version: '7.0.7-stable-ai-center',
  strategy: 'active_only', // active_only | best_score | ai_fusion | compare_only
  providers: {
    openai: {
      label: 'OpenAI',
      mode: 'ACTIVE', // legacy: ACTIVE | MONITOR | OFF
      roles: { active: true, monitor: true, learning: true, evaluate: true, propose: true },
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      apiKeyEnv: 'OPENAI_API_KEY',
      capabilities: { sales: 5, reasoning: 5, review: 4, vision: 4, coding: 4, search: 2 }
    },
    deepseek: {
      label: 'DeepSeek',
      mode: process.env.DEEPSEEK_API_KEY ? 'MONITOR' : 'OFF',
      roles: { active: false, monitor: Boolean(process.env.DEEPSEEK_API_KEY), learning: Boolean(process.env.DEEPSEEK_API_KEY), evaluate: Boolean(process.env.DEEPSEEK_API_KEY), propose: Boolean(process.env.DEEPSEEK_API_KEY) },
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      capabilities: { sales: 3, reasoning: 5, review: 5, vision: 1, coding: 5, search: 1 }
    },
    gemini: {
      label: 'Gemini',
      mode: process.env.GEMINI_API_KEY ? 'MONITOR' : 'OFF',
      roles: { active: false, monitor: Boolean(process.env.GEMINI_API_KEY), learning: Boolean(process.env.GEMINI_API_KEY), evaluate: Boolean(process.env.GEMINI_API_KEY), propose: Boolean(process.env.GEMINI_API_KEY) },
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      apiKeyEnv: 'GEMINI_API_KEY',
      capabilities: { sales: 3, reasoning: 4, review: 4, vision: 5, coding: 3, search: 4 }
    }
  },
  monitor: {
    enabled: true,
    saveReports: true,
    timeoutMs: Number(process.env.AI_PROVIDER_TIMEOUT_MS || 16000),
    timeouts: {
      openai: Number(process.env.OPENAI_TIMEOUT_MS || 20000),
      gemini: Number(process.env.GEMINI_TIMEOUT_MS || 45000),
      deepseek: Number(process.env.DEEPSEEK_TIMEOUT_MS || 30000),
      compare: Number(process.env.AI_COMPARE_TIMEOUT_MS || 60000),
      learning: Number(process.env.AI_LEARNING_TIMEOUT_MS || 60000)
    },
    retry: { gemini: Number(process.env.GEMINI_RETRY || 1) }
  },
  guardrails: {
    enabled: true,
    rejectAskKnownProduct: true,
    rejectAskKnownContact: true,
    rejectMissingMediaWhenRequested: true,
    rejectMissingPriceWhenKnown: true
  },
  updatedAt: new Date().toISOString()
};

function safeReadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8') || 'null') || fallback;
  } catch (error) {
    console.warn('[AI_PROVIDER] read failed:', file, error.message);
    return fallback;
  }
}

function safeWriteJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.warn('[AI_PROVIDER] write failed:', file, error.message);
    return false;
  }
}

function mergeSettings(saved = {}) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (saved.strategy) merged.strategy = saved.strategy;
  if (saved.monitor) merged.monitor = { ...merged.monitor, ...saved.monitor };
  if (saved.guardrails) merged.guardrails = { ...merged.guardrails, ...saved.guardrails };
  if (saved.providers && typeof saved.providers === 'object') {
    for (const [id, p] of Object.entries(saved.providers)) {
      merged.providers[id] = { ...(merged.providers[id] || {}), ...p };
      if (merged.providers[id].capabilities || p.capabilities) {
        merged.providers[id].capabilities = { ...((DEFAULT_SETTINGS.providers[id] || {}).capabilities || {}), ...(p.capabilities || {}) };
      }
    }
  }
  merged.updatedAt = saved.updatedAt || merged.updatedAt;
  return merged;
}

function getSettings() {
  return mergeSettings(safeReadJson(SETTINGS_FILE, {}));
}

function saveSettings(partial = {}) {
  const current = getSettings();
  const next = mergeSettings({ ...current, ...partial, updatedAt: new Date().toISOString() });
  safeWriteJson(SETTINGS_FILE, next);
  return next;
}

function maskKey(value = '') {
  const s = String(value || '');
  if (!s) return '';
  if (s.length <= 8) return '********';
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function providerRuntimeInfo(settings = getSettings()) {
  const out = {};
  for (const [id, p] of Object.entries(settings.providers || {})) {
    const key = process.env[p.apiKeyEnv] || p.apiKey || '';
    out[id] = {
      id,
      label: p.label || id,
      mode: modeFromRoles(normalizeRoles(p)),
      roles: normalizeRoles(p),
      model: p.model || '',
      baseURL: p.baseURL || '',
      apiKeyEnv: p.apiKeyEnv || '',
      hasApiKey: Boolean(key),
      maskedKey: maskKey(key),
      capabilities: p.capabilities || {}
    };
  }
  return out;
}

function normalizeMode(mode) {
  const m = String(mode || '').toUpperCase();
  if (m === 'ACTIVE' || m === 'MONITOR' || m === 'OFF') return m;
  return 'OFF';
}

function normalizeRoles(provider = {}) {
  const legacyMode = normalizeMode(provider.mode);
  const saved = provider.roles && typeof provider.roles === 'object' ? provider.roles : {};
  const hasSavedRoles = Object.keys(saved).length > 0;
  const roles = {
    active: hasSavedRoles ? saved.active === true : legacyMode === 'ACTIVE',
    monitor: hasSavedRoles ? saved.monitor === true : legacyMode === 'MONITOR',
    learning: hasSavedRoles ? saved.learning === true : legacyMode !== 'OFF',
    evaluate: hasSavedRoles ? saved.evaluate === true : legacyMode === 'MONITOR',
    propose: hasSavedRoles ? saved.propose === true : legacyMode === 'MONITOR'
  };
  return roles;
}

function modeFromRoles(roles = {}) {
  if (roles.active) return 'ACTIVE';
  if (roles.monitor || roles.learning || roles.evaluate || roles.propose) return 'MONITOR';
  return 'OFF';
}

function providerHasRole(provider = {}, role) {
  const roles = normalizeRoles(provider);
  return roles[String(role || '').toLowerCase()] === true;
}

function getActiveProviderId(settings = getSettings()) {
  const entries = Object.entries(settings.providers || {});
  const active = entries.find(([, p]) => providerHasRole(p, 'active')) || entries.find(([, p]) => normalizeMode(p.mode) === 'ACTIVE');
  return active ? active[0] : 'openai';
}

function getProviderIdsByRole(role, settings = getSettings()) {
  return Object.entries(settings.providers || {})
    .filter(([, p]) => providerHasRole(p, role))
    .map(([id]) => id);
}

function getMonitorProviderIds(settings = getSettings()) {
  return Array.from(new Set([
    ...getProviderIdsByRole('monitor', settings),
    ...getProviderIdsByRole('evaluate', settings),
    ...getProviderIdsByRole('propose', settings)
  ]));
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label || 'task'} timeout after ${ms}ms`)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}


function getProviderTimeoutMs(providerId, task = 'default', settings = getSettings()) {
  const t = settings.monitor?.timeouts || {};
  const id = String(providerId || '').toLowerCase();
  if (task === 'compare' && Number(t.compare) > 0) return Number(t[id] || t.compare || settings.monitor?.timeoutMs || 16000);
  if (task === 'learning' && Number(t.learning) > 0) return Number(t[id] || t.learning || settings.monitor?.timeoutMs || 16000);
  return Number(t[id] || settings.monitor?.timeoutMs || 16000);
}

function classifyProviderError(error) {
  const msg = String(error?.message || error || '');
  if (/402|insufficient balance|quota|billing/i.test(msg)) return { code: 'balance', level: 'red', userMessage: 'Hết quota/số dư API' };
  if (/timeout/i.test(msg)) return { code: 'timeout', level: 'orange', userMessage: 'Quá thời gian phản hồi' };
  if (/401|403|api key|permission|unauthorized|forbidden/i.test(msg)) return { code: 'auth', level: 'red', userMessage: 'API key hoặc quyền truy cập không hợp lệ' };
  if (/model|not found|invalid/i.test(msg)) return { code: 'model', level: 'orange', userMessage: 'Model không tồn tại hoặc chưa được cấp quyền' };
  return { code: 'error', level: 'yellow', userMessage: msg.slice(0, 220) || 'Lỗi không xác định' };
}

async function callProviderTimed(providerId, input, { task = 'default', label = '', retries = 0 } = {}) {
  const settings = getSettings();
  const timeout = getProviderTimeoutMs(providerId, task, settings);
  const startedAt = Date.now();
  let lastError = null;
  const maxAttempts = Math.max(1, Number(retries || 0) + 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const text = await withTimeout(callProvider(providerId, input), timeout, label || `${task}:${providerId}`);
      return { ok: true, provider: providerId, text, elapsedMs: Date.now() - startedAt, timeoutMs: timeout, attempt };
    } catch (error) {
      lastError = error;
      if (!/timeout/i.test(String(error?.message || '')) || attempt >= maxAttempts) break;
    }
  }
  const kind = classifyProviderError(lastError);
  return { ok: false, provider: providerId, error: lastError?.message || String(lastError), errorCode: kind.code, errorLevel: kind.level, userMessage: kind.userMessage, elapsedMs: Date.now() - startedAt, timeoutMs: timeout };
}

function getProviderConfig(providerId, settings = getSettings()) {
  return settings.providers?.[providerId] || null;
}

function makeOpenAICompatibleClient(p) {
  return new OpenAI({
    apiKey: process.env[p.apiKeyEnv] || p.apiKey || 'missing-key',
    baseURL: p.baseURL || undefined
  });
}

async function callOpenAICompatible(providerId, input, options = {}) {
  const settings = getSettings();
  const p = getProviderConfig(providerId, settings);
  if (!p) throw new Error(`Unknown provider: ${providerId}`);
  const apiKey = process.env[p.apiKeyEnv] || p.apiKey || '';
  if (!apiKey) throw new Error(`${p.label || providerId} API key is missing (${p.apiKeyEnv})`);
  const client = makeOpenAICompatibleClient(p);
  // Dùng Chat Completions để tương thích cả OpenAI và DeepSeek-compatible API.
  const response = await client.chat.completions.create({
    model: options.model || p.model || process.env.OPENAI_MODEL || 'gpt-5.4-mini',
    messages: [{ role: 'user', content: input }],
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.35
  });
  return response.choices?.[0]?.message?.content || '';
}

async function callGemini(input, options = {}) {
  const settings = getSettings();
  const p = getProviderConfig('gemini', settings);
  const apiKey = process.env[p.apiKeyEnv] || p.apiKey || '';
  if (!apiKey) throw new Error(`Gemini API key is missing (${p.apiKeyEnv})`);
  const model = options.model || p.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: input }] }] })
  });
  if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim() || '';
}

async function callProvider(providerId, input, options = {}) {
  if (providerId === 'gemini') return callGemini(input, options);
  if (providerId === 'openai' || providerId === 'deepseek') return callOpenAICompatible(providerId, input, options);
  const p = getProviderConfig(providerId);
  if (p?.baseURL) return callOpenAICompatible(providerId, input, options);
  throw new Error(`Provider ${providerId} is not implemented yet`);
}

function buildMonitorPrompt({ context = '', candidateReply = '', task = 'sales_reply', roles = {} }) {
  const roleText = Object.entries(roles || {}).filter(([, v]) => v === true).map(([k]) => k).join(', ') || 'monitor';
  return `Bạn là AI giám sát của AIGUKA. Bạn KHÔNG trả lời khách và KHÔNG gửi tin cho khách.\n\nVAI TRÒ ĐANG BẬT: ${roleText}\nNHIỆM VỤ: ${task}\n\nHãy đánh giá câu trả lời dự kiến theo mục tiêu bán hàng của Showroom Ánh Dương:\n- Có hiểu đúng yêu cầu khách không?\n- Có nhận diện đúng sản phẩm/quảng cáo không?\n- Có báo giá min-max khi khách hỏi giá và Context có giá không?\n- Có gửi/đề xuất media/slide khi khách xin xem mẫu không?\n- Có hỏi lại điều đã biết không?\n- Có xin lại SĐT/Zalo khi đã có hoặc sale đã gọi không?\n\nNGỮ CẢNH CHUẨN HÓA:\n${context}\n\nCÂU TRẢ LỜI DỰ KIẾN:\n${candidateReply}\n\nTrả về JSON hợp lệ, ngắn gọn, gồm: score_0_100, level (green/yellow/orange/red), issues[], suggestions[], better_reply, experience_note, proposed_action. Không thêm chữ ngoài JSON.`;
}

function parseMonitorJson(text = '') {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch (_) {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }
  return { score_0_100: null, level: 'yellow', issues: ['monitor_json_parse_failed'], suggestions: [raw.slice(0, 500)], better_reply: '' };
}

function appendReport(report) {
  const settings = getSettings();
  if (!settings.monitor?.saveReports) return;
  const list = safeReadJson(REPORT_FILE, []);
  list.unshift({ id: `air_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), ...report });
  safeWriteJson(REPORT_FILE, list.slice(0, 500));
}

function readReports({ limit = 100, level = '', provider = '', q = '' } = {}) {
  let list = safeReadJson(REPORT_FILE, []);
  if (level) list = list.filter(r => String(r.level || '').toLowerCase() === String(level).toLowerCase());
  if (provider) list = list.filter(r => String(r.provider || '').toLowerCase() === String(provider).toLowerCase());
  if (q) {
    const n = String(q).toLowerCase();
    list = list.filter(r => JSON.stringify(r).toLowerCase().includes(n));
  }
  return list.slice(0, Number(limit || 100));
}

async function monitorCandidate({ context, candidateReply, meta = {} }) {
  const settings = getSettings();
  if (!settings.monitor?.enabled) return [];
  const monitorIds = getMonitorProviderIds(settings).filter(id => providerRuntimeInfo(settings)[id]?.hasApiKey);
  
  const jobs = monitorIds.map(async providerId => {
    const roles = normalizeRoles(settings.providers?.[providerId] || {});
    const prompt = buildMonitorPrompt({ context, candidateReply, task: meta.task || 'sales_reply', roles });
    try {
      const aiRes = await callProviderTimed(providerId, prompt, { task: 'compare', label: `monitor:${providerId}`, retries: providerId === 'gemini' ? Number(settings.monitor?.retry?.gemini || 1) : 0 });
      if (!aiRes.ok) throw new Error(aiRes.error || aiRes.userMessage || 'AI monitor failed');
      const text = aiRes.text;
      const parsed = parseMonitorJson(text);
      const result = { provider: providerId, roles, ...parsed, raw: text.slice(0, 2000) };
      appendReport({ ...meta, type: 'ai_monitor', provider: providerId, roles, candidateReply, level: parsed.level || 'yellow', score: parsed.score_0_100, issues: parsed.issues || [], suggestions: parsed.suggestions || [], betterReply: parsed.better_reply || '', experienceNote: parsed.experience_note || '', proposedAction: parsed.proposed_action || '' });
      return result;
    } catch (error) {
      return { provider: providerId, level: 'yellow', score_0_100: null, issues: [`monitor_error: ${error.message}`], suggestions: [] };
    }
  });
  return Promise.all(jobs);
}

function shouldBlockByMonitor(monitorResults = []) {
  return monitorResults.some(r => String(r.level || '').toLowerCase() === 'red' && Array.isArray(r.issues) && r.issues.length);
}

async function generateText({ input, context, task = 'sales_reply', meta = {} } = {}) {
  const settings = getSettings();
  const activeId = getActiveProviderId(settings);
  const activeInfo = providerRuntimeInfo(settings)[activeId];
  const finalInput = input || context || '';
  if (!finalInput) return { text: '', provider: activeId, monitor: [] };

  let text = '';
  let provider = activeId;
  try {
    if (!activeInfo?.hasApiKey) throw new Error(`Active provider ${activeId} missing API key`);
    const activeRes = await callProviderTimed(activeId, finalInput, { task: 'default', label: `active:${activeId}`, retries: activeId === 'gemini' ? Number(settings.monitor?.retry?.gemini || 1) : 0 });
    if (!activeRes.ok) throw new Error(activeRes.error || activeRes.userMessage || 'Active provider failed');
    text = activeRes.text;
  } catch (error) {
    console.error('[AI_PROVIDER_ACTIVE_ERROR]', activeId, error.message);
    if (activeId !== 'openai' && providerRuntimeInfo(settings).openai?.hasApiKey) {
      provider = 'openai';
      const fallbackRes = await callProviderTimed('openai', finalInput, { task: 'default', label: 'fallback:openai' });
      if (!fallbackRes.ok) throw new Error(fallbackRes.error || fallbackRes.userMessage || 'OpenAI fallback failed');
      text = fallbackRes.text;
    } else {
      throw error;
    }
  }

  const monitor = await monitorCandidate({ context: context || finalInput, candidateReply: text, meta: { ...meta, task, activeProvider: provider } });
  // Không tự chặn live reply ở bản đầu để tránh làm mất luồng đang ổn định; chỉ log cảnh báo.
  return { text, provider, monitor, blocked: false, strategy: settings.strategy };
}

async function compareModels({ prompt, context = '', includeOff = false } = {}) {
  const settings = getSettings();
  const entries = Object.entries(settings.providers || {}).filter(([id, p]) => includeOff || modeFromRoles(normalizeRoles(p)) !== 'OFF');
  const runtime = providerRuntimeInfo(settings);
  const input = context ? `${context}\n\nCÂU HỎI/YÊU CẦU:\n${prompt}` : prompt;
  const jobs = entries.map(async ([id]) => {
    if (!runtime[id]?.hasApiKey) return { provider: id, ok: false, error: `Missing API key (${runtime[id]?.apiKeyEnv})`, errorCode: 'missing_key', userMessage: 'Chưa cấu hình API key' };
    const retry = id === 'gemini' ? Number(settings.monitor?.retry?.gemini || 1) : 0;
    return callProviderTimed(id, input, { task: 'compare', label: `compare:${id}`, retries: retry });
  });
  return Promise.all(jobs);
}

async function testProvider(providerId, { test = 'chat', prompt = 'Xin chào, hãy trả lời bằng tiếng Việt trong một câu.' } = {}) {
  const settings = getSettings();
  const runtime = providerRuntimeInfo(settings);
  if (!runtime[providerId]) return { provider: providerId, ok: false, error: 'provider not found', errorCode: 'not_found' };
  if (!runtime[providerId].hasApiKey) return { provider: providerId, ok: false, error: `Missing API key (${runtime[providerId].apiKeyEnv})`, errorCode: 'missing_key', userMessage: 'Chưa cấu hình API key' };
  const startedAt = Date.now();
  const input = test === 'compare'
    ? `Bạn là AI đánh giá của AIGUKA. Hãy trả lời ngắn gọn theo JSON: {"score":10,"note":"ok"}. Nội dung test: ${prompt}`
    : prompt;
  const retry = providerId === 'gemini' ? Number(settings.monitor?.retry?.gemini || 1) : 0;
  const result = await callProviderTimed(providerId, input, { task: test === 'learning' ? 'learning' : 'compare', label: `diagnostics:${test}:${providerId}`, retries: retry });
  return { ...result, test, model: runtime[providerId].model, baseURL: runtime[providerId].baseURL || '', totalElapsedMs: Date.now() - startedAt };
}

async function diagnostics({ provider = '', tests = ['chat'] } = {}) {
  const settings = getSettings();
  const runtime = providerRuntimeInfo(settings);
  const ids = provider ? [provider] : Object.keys(settings.providers || {});
  const out = [];
  for (const id of ids) {
    const info = runtime[id] || { id };
    const row = { provider: id, label: info.label || id, model: info.model || '', mode: info.mode || 'OFF', hasApiKey: info.hasApiKey === true, tests: [] };
    if (!row.hasApiKey) {
      row.tests.push({ ok: false, test: 'api_key', errorCode: 'missing_key', userMessage: 'Chưa cấu hình API key' });
    } else {
      for (const test of tests) row.tests.push(await testProvider(id, { test }));
    }
    out.push(row);
  }
  return out;
}

function extractDataUrl(dataUrl = '') {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function buildLearningPrompt(item = {}) {
  return `Bạn là AI thủ thư sản phẩm của AIGUKA cho Showroom Ánh Dương.\n\nNHIỆM VỤ:\nĐọc tài liệu/ảnh/catalog/bảng giá được admin upload, sau đó tạo BẢN NHÁP kiến thức để admin duyệt.\nKhông được khẳng định giá là chính thức nếu tài liệu không ghi rõ. Không được tự đưa vào tư vấn khách.\n\nHãy trả về JSON hợp lệ gồm:\n{\n  "summary": "tóm tắt ngắn",\n  "detected_category": "nhóm sản phẩm",\n  "detected_products": [{"name":"", "brand":"", "aliases":[], "price_min":"", "price_max":"", "warranty":"", "notes":""}],\n  "sales_faq": [{"q":"", "a":""}],\n  "missing_info": [],\n  "confidence_0_100": 0,\n  "needs_admin_review": true\n}\n\nTHÔNG TIN FILE:\n- Tên file: ${item.filename || ''}\n- MIME: ${item.mimeType || ''}\n- Ghi chú admin: ${item.note || ''}\n\nNếu có văn bản trích xuất sẵn thì dùng văn bản này:\n${item.text || ''}`;
}

function parseLearningJson(text = '') {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch (_) {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }
  return {
    summary: raw.slice(0, 1200),
    detected_category: '',
    detected_products: [],
    sales_faq: [],
    missing_info: ['AI chưa trả về JSON hợp lệ, cần admin xem lại.'],
    confidence_0_100: 30,
    needs_admin_review: true
  };
}

async function callGeminiWithInlineData(prompt, { mimeType, base64 } = {}, options = {}) {
  const settings = getSettings();
  const p = getProviderConfig('gemini', settings);
  const apiKey = process.env[p.apiKeyEnv] || p.apiKey || '';
  if (!apiKey) throw new Error(`Gemini API key is missing (${p.apiKeyEnv})`);
  const model = options.model || p.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts = [{ text: prompt }];
  if (mimeType && base64) parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }] })
  });
  if (!resp.ok) throw new Error(`Gemini learning HTTP ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim() || '';
}

async function generateLearningDraft(item = {}) {
  const settings = getSettings();
  const runtime = providerRuntimeInfo(settings);
  const learningIds = getProviderIdsByRole('learning', settings).filter(id => runtime[id]?.hasApiKey);
  const prompt = buildLearningPrompt(item);
  const file = extractDataUrl(item.dataUrl || '');
  const timeout = getProviderTimeoutMs('gemini', 'learning', settings);

  // Ưu tiên Gemini cho ảnh/PDF vì có Vision/OCR tốt hơn. Nếu không có Gemini thì fallback text-only provider.
  const ordered = [...new Set(['gemini', ...learningIds])].filter(id => learningIds.includes(id));
  const attempts = [];
  for (const id of ordered) {
    try {
      let text;
      if (id === 'gemini') text = await withTimeout(callGeminiWithInlineData(prompt, file || {}, {}), getProviderTimeoutMs('gemini','learning',settings), 'learning:gemini');
      else text = await withTimeout(callProvider(id, prompt), getProviderTimeoutMs(id,'learning',settings), `learning:${id}`);
      const parsed = parseLearningJson(text);
      appendReport({ type: 'ai_learning_draft', provider: id, level: parsed.confidence_0_100 >= 80 ? 'green' : parsed.confidence_0_100 >= 55 ? 'yellow' : 'orange', title: `Learning draft: ${item.filename || 'document'}`, score: parsed.confidence_0_100, lesson: parsed.summary, itemId: item.id, draft: parsed });
      return { ok: true, provider: id, raw: text.slice(0, 3000), draft: parsed };
    } catch (error) {
      attempts.push({ provider: id, error: error.message });
    }
  }
  return { ok: false, provider: '', error: attempts.map(a => `${a.provider}: ${a.error}`).join(' | ') || 'No learning provider enabled', draft: { summary: 'Chưa xử lý được tự động. File đã được lưu để admin xem lại.', detected_products: [], missing_info: ['Bật Gemini/OpenAI/DeepSeek ở chế độ Learning hoặc kiểm tra API key.'], confidence_0_100: 0, needs_admin_review: true } };
}

module.exports = {
  getSettings,
  saveSettings,
  providerRuntimeInfo,
  generateText,
  compareModels,
  monitorCandidate,
  readReports,
  appendReport,
  generateLearningDraft,
  testProvider,
  diagnostics,
  classifyProviderError,
  getProviderTimeoutMs,
  DEFAULT_SETTINGS,
  normalizeRoles,
  modeFromRoles,
  getProviderIdsByRole
};
