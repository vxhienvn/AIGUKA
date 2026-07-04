const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const SETTINGS_FILE = path.join(__dirname, '..', '..', 'ai_model_control.json');
const REPORT_FILE = path.join(__dirname, '..', '..', 'ai_monitor_reports.json');

const DEFAULT_SETTINGS = {
  version: '7.0.1-core-multi-role',
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
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
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
    timeoutMs: Number(process.env.AI_PROVIDER_TIMEOUT_MS || 16000)
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
      const text = await withTimeout(callProvider(providerId, prompt), settings.monitor.timeoutMs || 16000, `monitor:${providerId}`);
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
  const timeout = settings.monitor?.timeoutMs || 16000;
  try {
    if (!activeInfo?.hasApiKey) throw new Error(`Active provider ${activeId} missing API key`);
    text = await withTimeout(callProvider(activeId, finalInput), timeout, `active:${activeId}`);
  } catch (error) {
    console.error('[AI_PROVIDER_ACTIVE_ERROR]', activeId, error.message);
    if (activeId !== 'openai' && providerRuntimeInfo(settings).openai?.hasApiKey) {
      provider = 'openai';
      text = await withTimeout(callProvider('openai', finalInput), timeout, 'fallback:openai');
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
    if (!runtime[id]?.hasApiKey) return { provider: id, ok: false, error: `Missing API key (${runtime[id]?.apiKeyEnv})` };
    try {
      const text = await withTimeout(callProvider(id, input), settings.monitor?.timeoutMs || 16000, `compare:${id}`);
      return { provider: id, ok: true, text };
    } catch (error) {
      return { provider: id, ok: false, error: error.message };
    }
  });
  return Promise.all(jobs);
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
  DEFAULT_SETTINGS,
  normalizeRoles,
  modeFromRoles,
  getProviderIdsByRole
};
