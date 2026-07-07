'use strict';

/**
 * AIGUKA V7.4.0 - Knowledge Engine
 * Mục tiêu: biến AI Learning từ kho lưu/UI thành nguồn tri thức có truy xuất theo:
 * - Product ID chuẩn từ Product Center
 * - loại kiến thức: giá, bảo hành, kỹ thuật, catalogue, quy tắc, kinh nghiệm...
 * - hybrid keyword + metadata scoring
 *
 * Bản 7.4.0 chưa yêu cầu pgvector/embedding để tránh phá production.
 * Khi có bảng vector, có thể bổ sung semantic search ở đây mà không đổi luồng bot.
 */

const { loadProductCenter, detectProductByAlias, normalizeText } = require('../product-center/product-center');

const SUPABASE_ENABLED = String(process.env.SUPABASE_ENABLED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function ready() {
  return Boolean(SUPABASE_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function compactError(error) {
  return String(error?.message || error || '').replace(/\s+/g, ' ').slice(0, 240);
}

function likeValue(q = '') {
  return `*${String(q || '').replace(/[,%()]/g, ' ').trim()}*`;
}

async function supabaseRequest(pathname, options = {}) {
  if (!ready()) return [];
  const timeoutMs = Number(process.env.KNOWLEDGE_ENGINE_FETCH_TIMEOUT_MS || process.env.AI_BRAIN_FETCH_TIMEOUT_MS || 4500);
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
        Prefer: 'return=representation',
        ...(options.headers || {})
      }
    });
    const raw = await res.text();
    let data = [];
    try { data = raw ? JSON.parse(raw) : []; } catch (_) { data = []; }
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${raw.slice(0, 180)}`);
    return Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(timer);
  }
}

async function safeFetch(pathname) {
  try { return await supabaseRequest(pathname); }
  catch (error) {
    console.warn('[KNOWLEDGE_ENGINE_FALLBACK]', compactError(error));
    return [];
  }
}

function lastUsefulText(historyText = '') {
  const lines = String(historyText || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  return lines.slice(-12).join('\n') || String(historyText || '').slice(-1500);
}

function queryTokens(input = '') {
  const text = normalizeText(input);
  const tokens = text.split(/\s+/).filter(x => x.length >= 3);
  const priority = [
    'combo phong tam', 'bet ve sinh', 'bon cau', 'bon cau thong minh', 'lavabo',
    'guong tu', 'guong', 'sen cay', 'sen tam', 'sen voi', 'voi lavabo', 'bon tam',
    'chau voi rua bat', 'chau rua bat', 'voi rua bat', 'bep tu', 'hut mui',
    'phu kien nha bep', 'quat tran', 'den trum', 'den chum', 'gach ngoi', 'gach 80x80',
    'bao hanh', 'gia', 'khuyen mai', 'van chuyen', 'lap dat', 'catalog', 'catalogue'
  ].filter(p => text.includes(p));
  return Array.from(new Set([...priority, ...tokens])).slice(0, 14);
}

function inferKnowledgeType(input = '') {
  const q = normalizeText(input);
  const rules = [
    ['price', ['gia', 'bao gia', 'bao nhieu', 'trieu', 'vnd', 'vnđ', 'khuyen mai', 'giam gia']],
    ['warranty', ['bao hanh', 'bao tri', 'doi tra', 'loi', 'hong']],
    ['installation', ['lap dat', 'van chuyen', 'ship', 'freeship', 'thi cong', 'giao hang']],
    ['catalog', ['catalog', 'catalogue', 'mau', 'slide', 'hinh', 'anh', 'video', 'xem mau']],
    ['spec', ['kich thuoc', 'size', 'thong so', 'chat lieu', 'cong suat', 'dong co', 'canh']],
    ['policy', ['chinh sach', 'quy dinh', 'quy tac', 'dia chi', 'hotline', 'showroom']],
    ['sales_experience', ['kinh nghiem', 'sale', 'chot', 'tu van', 'khach tu choi']],
    ['business_rule', ['khong duoc', 'bat buoc', 'uu tien', 'rule', 'nguyen tac']]
  ];
  for (const [type, keys] of rules) if (keys.some(k => q.includes(k))) return type;
  return 'general';
}

function detectProductId(input = '') {
  try {
    const pc = loadProductCenter();
    const detected = detectProductByAlias(input, pc);
    return detected?.productId || null;
  } catch (_) {
    return null;
  }
}

function rowText(row = {}) {
  return String(row.text_value || row.content || row.text || '');
}

function rowAttributes(row = {}) {
  return row.attributes && typeof row.attributes === 'object' ? row.attributes : {};
}

function attributeProductIds(row = {}) {
  const a = rowAttributes(row);
  const values = [
    a.product_id, a.productId, a.canonical_product_id, a.product_group, a.category,
    a.detected_category, a.topic, a.title, a.filename, a.appliesTo
  ];
  if (Array.isArray(a.product_ids)) values.push(...a.product_ids);
  if (Array.isArray(a.products)) values.push(...a.products);
  if (Array.isArray(a.aliases)) values.push(...a.aliases);
  if (a.knowledge_object) values.push(a.knowledge_object.title, a.knowledge_object.category, a.knowledge_object.product_group);
  if (a.product_object) values.push(a.product_object.name, a.product_object.model, a.product_object.category, ...(a.product_object.aliases || []));
  const hay = `${values.filter(Boolean).join(' ')}\n${rowText(row).slice(0, 1200)}`;
  const ids = new Set();
  try {
    const pc = loadProductCenter();
    const detected = detectProductByAlias(hay, pc);
    if (detected?.productId) ids.add(detected.productId);
    for (const [alias, productId] of Object.entries(pc.aliases || {})) {
      const aNorm = normalizeText(alias);
      if (aNorm && normalizeText(hay).includes(aNorm)) ids.add(productId);
    }
  } catch (_) {}
  for (const raw of values) {
    const v = String(raw || '').trim().toUpperCase();
    if (/^[A-Z0-9_]{3,}$/.test(v)) ids.add(v);
  }
  return Array.from(ids);
}

function rowKnowledgeTypes(row = {}) {
  const a = rowAttributes(row);
  const values = [a.knowledge_type, a.type, a.object_type, a.brain_object_type, a.topic, a.title, a.filename, rowText(row).slice(0, 1200)];
  const out = new Set();
  for (const v of values) {
    const t = inferKnowledgeType(String(v || ''));
    if (t && t !== 'general') out.add(t);
  }
  if (/product|knowledge_note|faq/i.test(String(a.object_type || a.brain_object_type || ''))) out.add('general');
  return Array.from(out.size ? out : ['general']);
}

function rowMatchesProduct(row, productId) {
  if (!productId) return true;
  const ids = attributeProductIds(row);
  if (ids.includes(productId)) return true;
  const hay = normalizeText(`${rowText(row)} ${JSON.stringify(rowAttributes(row))}`);
  try {
    const pc = loadProductCenter();
    const product = (pc.products || {})[productId] || {};
    const aliases = [product.name, product.displayName, ...(product.aliases || [])].filter(Boolean);
    return aliases.some(a => normalizeText(a) && hay.includes(normalizeText(a)));
  } catch (_) {
    return false;
  }
}

function rowMatchesType(row, knowledgeType) {
  if (!knowledgeType || knowledgeType === 'general') return true;
  const types = rowKnowledgeTypes(row);
  if (types.includes(knowledgeType)) return true;
  // giá/catalog/spec thường có thể nằm trong product_knowledge chung.
  if (types.includes('general') || types.includes('product_knowledge')) {
    const hay = normalizeText(`${rowText(row)} ${JSON.stringify(rowAttributes(row))}`);
    const inferred = inferKnowledgeType(hay);
    return inferred === knowledgeType || inferred === 'general';
  }
  return false;
}

function scoreRow(row, query = '', opts = {}) {
  const hay = normalizeText(`${rowText(row)} ${JSON.stringify(rowAttributes(row))}`);
  const toks = queryTokens(query);
  let score = 0;
  for (const tk of toks) {
    const n = normalizeText(tk);
    if (!n) continue;
    if (hay.includes(n)) score += n.includes(' ') ? 35 : 12;
  }
  const productId = opts.productId || detectProductId(query);
  if (productId && rowMatchesProduct(row, productId)) score += 60;
  const type = opts.knowledgeType || inferKnowledgeType(query);
  if (type && type !== 'general' && rowMatchesType(row, type)) score += 25;
  const a = rowAttributes(row);
  if (a.priority) score += Math.min(15, Number(a.priority || 0));
  if (a.absorption_status === 'absorbed') score += 10;
  if (a.object_type || a.brain_object_type) score += 6;
  if (a.source === 'admin_memory_absorbed' || /experience|rule/i.test(String(a.object_type || ''))) score += 8;
  return score;
}

async function fetchCandidateRows(query = '', limit = 16) {
  if (!ready()) return [];
  const select = 'id,document_id,position,text_value,attributes,updated_at,created_at';
  const seen = new Set();
  const out = [];
  async function add(rows = []) {
    for (const r of rows || []) {
      if (!r?.id || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  const q = String(query || '').trim();
  if (q) {
    await add(await safeFetch(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&text_value=ilike.${encodeURIComponent(likeValue(q.slice(0, 90)))}&order=updated_at.desc&limit=${Math.max(8, limit)}`));
    for (const tk of queryTokens(q)) {
      if (out.length >= limit * 3) break;
      await add(await safeFetch(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&text_value=ilike.${encodeURIComponent(likeValue(tk))}&order=updated_at.desc&limit=${Math.max(8, Math.ceil(limit / 2))}`));
    }
  }
  // Luôn lấy recent để lọc metadata/product_id vì text ilike không tìm được attributes JSON.
  if (out.length < limit * 2) {
    await add(await safeFetch(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&order=updated_at.desc&limit=${Number(process.env.KNOWLEDGE_ENGINE_RECENT_LIMIT || 350)}`));
  }
  return out;
}

async function searchKnowledge(query = '', options = {}) {
  const q = String(query || '').trim();
  const limit = Math.max(1, Math.min(30, Number(options.limit || 10)));
  const productId = options.productId || detectProductId(q);
  const knowledgeType = options.knowledgeType || inferKnowledgeType(q);
  const rows = await fetchCandidateRows(q, Math.max(limit, 12));
  const filtered = rows
    .filter(r => rowMatchesProduct(r, productId))
    .filter(r => rowMatchesType(r, knowledgeType))
    .map(r => ({
      ...r,
      _score: scoreRow(r, q, { productId, knowledgeType }),
      _productIds: attributeProductIds(r),
      _knowledgeTypes: rowKnowledgeTypes(r)
    }))
    .sort((a, b) => (b._score || 0) - (a._score || 0));

  const finalRows = (filtered.length ? filtered : rows.map(r => ({
    ...r,
    _score: scoreRow(r, q, { productId, knowledgeType }),
    _productIds: attributeProductIds(r),
    _knowledgeTypes: rowKnowledgeTypes(r)
  })).sort((a, b) => (b._score || 0) - (a._score || 0))).slice(0, limit);

  const trace = {
    version: '7.4.0',
    queryPreview: q.slice(0, 180),
    productId,
    knowledgeType,
    tokens: queryTokens(q).slice(0, 10),
    candidateCount: rows.length,
    filteredCount: filtered.length,
    resultCount: finalRows.length,
    top: finalRows.slice(0, 6).map(r => ({ id: r.id, score: r._score, productIds: r._productIds, types: r._knowledgeTypes, title: rowAttributes(r).title || rowAttributes(r).filename || rowAttributes(r).topic || '' }))
  };
  console.log('[KNOWLEDGE_ENGINE_LOOKUP]', JSON.stringify(trace));
  return { ok: true, query: q, productId, knowledgeType, items: finalRows, trace };
}

function formatKnowledgeRows(rows = []) {
  return rows.map((r, idx) => {
    const a = rowAttributes(r);
    const source = a.filename || a.title || a.topic || a.source || a.product_group || '';
    return `${idx + 1}. PRODUCT_ID: ${(r._productIds || []).join(',') || a.product_id || a.product_group || ''} | TYPE: ${(r._knowledgeTypes || []).join(',') || a.object_type || 'knowledge'} | SCORE: ${r._score || 0} | NGUỒN: ${source}\n  NỘI DUNG: ${rowText(r).slice(0, 1800)}`;
  }).join('\n---\n');
}

async function buildKnowledgeContextForMessage(historyText = '', opts = {}) {
  const query = opts.query || lastUsefulText(historyText);
  const result = await searchKnowledge(query, { limit: Number(opts.limit || 10), productId: opts.productId, knowledgeType: opts.knowledgeType });
  if (!result.items.length) return { context: '', trace: result.trace, result };
  const header = [
    'KNOWLEDGE ENGINE CONTEXT V7.4 - TRI THỨC ĐƯỢC TRUY XUẤT THEO PRODUCT/INTENT',
    `Detected Product ID: ${result.productId || 'UNKNOWN'}`,
    `Detected Knowledge Type: ${result.knowledgeType || 'general'}`,
    'Quy tắc dùng context:',
    '- Ưu tiên các đoạn có PRODUCT_ID và TYPE khớp yêu cầu khách.',
    '- Không bịa giá/model/kích thước/bảo hành nếu không có trong context.',
    '- Nếu context không đủ chắc chắn thì nói cần kiểm tra lại và chuyển sale đúng lúc.',
    ''
  ].join('\n');
  return {
    context: `${header}${formatKnowledgeRows(result.items)}`.slice(0, Number(opts.maxChars || 18000)),
    trace: result.trace,
    result
  };
}

module.exports = {
  ready,
  normalizeText,
  queryTokens,
  inferKnowledgeType,
  detectProductId,
  searchKnowledge,
  buildKnowledgeContextForMessage,
  attributeProductIds,
  rowKnowledgeTypes
};
