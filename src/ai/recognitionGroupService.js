// AIGUKA V7.2.7 - Persistent Recognition Group Service
// Recognition Groups are business configuration and must live in Supabase, not code/RAM.

const SUPABASE_ENABLED = String(process.env.SUPABASE_ENABLED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

const CACHE_TTL_MS = Number(process.env.RECOGNITION_GROUP_CACHE_TTL_MS || 60_000);
let cache = { at: 0, rows: null };

function ready() { return Boolean(SUPABASE_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY); }
function compactError(error) { return String(error?.message || error || '').replace(/\s+/g, ' ').slice(0, 260); }
function stripVietnamese(str = '') { return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'); }
function normalizeText(str = '') { return stripVietnamese(str).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }

const fallbackGroups = [
  { id: 'fallback-general', group_key: 'general', name: 'Tổng hợp', mode: 'GENERAL', priority: 1, active: true, aliases: ['tổng hợp','showroom','cửa hàng','trang bị nhà mới','xây nhà mới','hoàn thiện nhà'], products: [] },
  { id: 'fallback-bathroom', group_key: 'bathroom', name: 'Bathroom / Thiết bị vệ sinh', mode: 'GENERAL', priority: 2, active: true, aliases: ['bathroom','phòng tắm','thiết bị vệ sinh','nhà tắm','wc'], products: [] },
  { id: 'fallback-fan', group_key: 'fan', name: 'Quạt', mode: 'PRODUCT', priority: 10, active: true, aliases: ['quạt','quạt trần','quạt vàng','quạt mạ vàng','quạt 10 cánh','guka'], products: [] },
  { id: 'fallback-bathtub', group_key: 'bathtub', name: 'Bồn tắm', mode: 'PRODUCT', priority: 20, active: true, aliases: ['bồn tắm','bồn massage','jacuzzi','ares'], products: [] },
  { id: 'fallback-kitchen', group_key: 'kitchen', name: 'Bếp / Hút mùi / Chậu vòi bếp', mode: 'CATEGORY', priority: 30, active: true, aliases: ['bếp','bếp từ','hút mùi','fudeer','chậu rửa bát','vòi rửa bát'], products: [] },
  { id: 'fallback-lighting', group_key: 'lighting', name: 'Đèn trang trí', mode: 'CATEGORY', priority: 40, active: true, aliases: ['đèn','đèn chùm','đèn trang trí'], products: [] }
];

async function supabaseRequest(pathname, options = {}) {
  if (!ready()) throw new Error('supabase_disabled');
  const timeoutMs = Number(process.env.RECOGNITION_GROUP_SUPABASE_TIMEOUT_MS || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
    if (!res.ok) throw new Error(`Supabase ${pathname} failed ${res.status}: ${raw}`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Supabase timeout ${timeoutMs}ms: ${pathname}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeGroupRow(g = {}) {
  return {
    id: g.id,
    group_key: g.group_key || g.id || '',
    name: g.name || g.group_key || '',
    mode: ['GENERAL','CATEGORY','PRODUCT'].includes(String(g.mode || '').toUpperCase()) ? String(g.mode).toUpperCase() : 'CATEGORY',
    description: g.description || '',
    priority: Number.isFinite(Number(g.priority)) ? Number(g.priority) : 100,
    active: g.active !== false,
    aliases: [],
    products: [],
    metadata: g.metadata || {}
  };
}

async function loadRecognitionGroups(options = {}) {
  const now = Date.now();
  if (!options.force && cache.rows && now - cache.at < CACHE_TTL_MS) return cache.rows;
  if (!ready()) return fallbackGroups;
  try {
    const groupRows = await supabaseRequest('recognition_groups?select=*&order=priority.asc&limit=500', { method: 'GET' });
    const aliasRows = await supabaseRequest('recognition_group_aliases?select=*&active=eq.true&order=priority.asc&limit=2000', { method: 'GET' }).catch(() => []);
    const productRows = await supabaseRequest('recognition_group_products?select=*&active=eq.true&limit=2000', { method: 'GET' }).catch(() => []);
    const byId = new Map((Array.isArray(groupRows) ? groupRows : []).map(g => [g.id, normalizeGroupRow(g)]));
    for (const a of (Array.isArray(aliasRows) ? aliasRows : [])) {
      const g = byId.get(a.recognition_group_id);
      if (g && a.alias) g.aliases.push(String(a.alias));
    }
    for (const p of (Array.isArray(productRows) ? productRows : [])) {
      const g = byId.get(p.recognition_group_id);
      if (g && p.product_group_id) g.products.push({ id: String(p.product_group_id), name: String(p.product_group_name || p.product_group_id), active: p.active !== false });
    }
    const rows = Array.from(byId.values()).filter(g => g.active).sort((a,b)=>(a.priority-b.priority)||a.name.localeCompare(b.name,'vi'));
    cache = { at: now, rows: rows.length ? rows : fallbackGroups };
    return cache.rows;
  } catch (error) {
    console.warn('[RECOGNITION_GROUP_LOAD_ERROR]', compactError(error));
    return cache.rows || fallbackGroups;
  }
}

function matchRecognitionGroupSync(text = '', groups = fallbackGroups) {
  const q = normalizeText(text);
  if (!q) return { group: null, confidence: 0, alias: '', reason: 'empty' };
  let best = null;
  for (const g of groups || []) {
    const candidates = [g.name, g.group_key, ...(Array.isArray(g.aliases) ? g.aliases : [])].filter(Boolean);
    for (const alias of candidates) {
      const an = normalizeText(alias);
      if (!an) continue;
      let score = 0;
      if (q === an) score = 100;
      else if (q.includes(an)) score = Math.min(96, 65 + Math.min(25, an.length));
      else if (an.includes(q) && q.length >= 3) score = Math.min(78, 45 + Math.min(20, q.length));
      if (score > 0) {
        score += Math.max(0, 40 - Number(g.priority || 100)) / 10;
        if (!best || score > best.confidence) best = { group: g, confidence: Math.round(score), alias, normalized_alias: an, reason: 'alias_match' };
      }
    }
  }
  return best || { group: null, confidence: 0, alias: '', reason: 'no_match' };
}

async function resolveRecognitionGroup(text = '', options = {}) {
  const groups = await loadRecognitionGroups(options);
  const result = matchRecognitionGroupSync(text, groups);
  console.log('[RECOGNITION_GROUP_RESOLVER]', JSON.stringify({ query: String(text || '').slice(0,160), matched: Boolean(result.group), group: result.group?.name || '', mode: result.group?.mode || '', confidence: result.confidence, alias: result.alias || '' }));
  return result;
}

async function createRecognitionGroup(input = {}) {
  const group = {
    group_key: String(input.group_key || input.key || input.name || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || null,
    name: String(input.name || '').trim(),
    mode: ['GENERAL','CATEGORY','PRODUCT'].includes(String(input.mode || '').toUpperCase()) ? String(input.mode).toUpperCase() : 'CATEGORY',
    description: String(input.description || '').trim(),
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 100,
    active: input.active !== false,
    metadata: input.metadata || {}
  };
  if (!group.name) throw new Error('Thiếu tên nhóm nhận dạng');
  const rows = await supabaseRequest('recognition_groups?on_conflict=group_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(group) });
  cache.rows = null;
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateRecognitionGroup(id, patch = {}) {
  const allowed = {};
  for (const k of ['name','mode','description','priority','active','metadata']) if (patch[k] !== undefined) allowed[k] = patch[k];
  if (allowed.mode) allowed.mode = ['GENERAL','CATEGORY','PRODUCT'].includes(String(allowed.mode).toUpperCase()) ? String(allowed.mode).toUpperCase() : 'CATEGORY';
  allowed.updated_at = new Date().toISOString();
  const rows = await supabaseRequest(`recognition_groups?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(allowed) });
  cache.rows = null;
  return Array.isArray(rows) ? rows[0] : rows;
}

async function deleteRecognitionGroup(id) {
  const rows = await supabaseRequest(`recognition_groups?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  cache.rows = null;
  return rows;
}

async function setRecognitionAliases(groupId, aliases = []) {
  const clean = Array.from(new Set((Array.isArray(aliases) ? aliases : String(aliases || '').split(/[\n,]+/)).map(x => String(x || '').trim()).filter(Boolean)));
  await supabaseRequest(`recognition_group_aliases?recognition_group_id=eq.${encodeURIComponent(groupId)}`, { method: 'DELETE' }).catch(() => null);
  if (!clean.length) { cache.rows = null; return []; }
  const payload = clean.map((alias, idx) => ({ recognition_group_id: groupId, alias, normalized_alias: normalizeText(alias), priority: idx + 1, active: true }));
  const rows = await supabaseRequest('recognition_group_aliases', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  cache.rows = null;
  return rows;
}

async function setRecognitionProducts(groupId, products = []) {
  const normalized = Array.from(new Map((Array.isArray(products) ? products : []).map(p => {
    if (typeof p === 'string') return [p, { id: p, name: p }];
    return [String(p.id || p.product_group_id || ''), { id: String(p.id || p.product_group_id || ''), name: String(p.name || p.product_group_name || p.id || p.product_group_id || '') }];
  }).filter(([id]) => id)).values());
  await supabaseRequest(`recognition_group_products?recognition_group_id=eq.${encodeURIComponent(groupId)}`, { method: 'DELETE' }).catch(() => null);
  if (!normalized.length) { cache.rows = null; return []; }
  const payload = normalized.map(p => ({ recognition_group_id: groupId, product_group_id: p.id, product_group_name: p.name, active: true }));
  const rows = await supabaseRequest('recognition_group_products', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  cache.rows = null;
  return rows;
}

module.exports = {
  loadRecognitionGroups,
  resolveRecognitionGroup,
  matchRecognitionGroupSync,
  createRecognitionGroup,
  updateRecognitionGroup,
  deleteRecognitionGroup,
  setRecognitionAliases,
  setRecognitionProducts,
  normalizeText,
  fallbackGroups
};
