// AIGUKA V7.2.0 - AI Brain Context Service
// Mục tiêu: biến Knowledge đã duyệt/Knowledge Object thành trí nhớ dài hạn mà bot và AI Compare đều đọc trước khi trả lời.
// Không phụ thuộc OpenAI/Gemini; chỉ truy xuất Supabase learning_segments đã approved.

const SUPABASE_ENABLED = String(process.env.SUPABASE_ENABLED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function ready() {
  return Boolean(SUPABASE_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function compactError(error) {
  return String(error?.message || error || '').replace(/\s+/g, ' ').slice(0, 240);
}

function stripVietnamese(str = '') {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalize(str = '') {
  return stripVietnamese(str).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function queryTokens(q = '') {
  const base = normalize(q);
  const tokens = base.split(/\s+/).filter(x => x.length >= 3);
  const priority = [];
  const phrases = [
    'bon tam', 'tu chau', 'tu lavabo', 'bon cau', 'quat tran', 'sen tam', 'sen voi',
    'thiet bi ve sinh', 'bep tu', 'hut mui', 'chau rua', 'den trang tri'
  ];
  for (const p of phrases) if (base.includes(p)) priority.push(p);
  return Array.from(new Set([...priority, ...tokens])).slice(0, 10);
}

function likeValue(q = '') {
  return `*${String(q || '').replace(/[,%()]/g, ' ').trim()}*`;
}

async function supabaseRequest(pathname, options = {}) {
  if (!ready()) return [];
  const timeoutMs = Number(process.env.AI_BRAIN_FETCH_TIMEOUT_MS || 4500);
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
    console.warn('[AI_BRAIN_CONTEXT_FALLBACK]', compactError(error));
    return [];
  }
}

function lastUsefulText(historyText = '') {
  const lines = String(historyText || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  const tail = lines.slice(-12).join('\n');
  return tail || String(historyText || '').slice(-1500);
}

function scoreRow(row, query = '') {
  const hayRaw = JSON.stringify({ text: row.text_value || '', attributes: row.attributes || {} });
  const hay = normalize(hayRaw);
  const toks = queryTokens(query);
  let score = 0;
  for (const tk of toks) {
    const n = normalize(tk);
    if (!n) continue;
    if (hay.includes(n)) score += n.includes(' ') ? 28 : 12;
  }
  const a = row.attributes || {};
  if (a.object_type) score += 10;
  if (a.absorption_status === 'absorbed') score += 8;
  if (a.priority) score += Math.min(10, Number(a.priority || 0));
  return score;
}

async function searchBrainSegments(query = '', limit = 12) {
  if (!ready()) return [];
  const select = 'id,document_id,position,text_value,attributes,updated_at,created_at';
  const seen = new Set();
  const out = [];
  async function addRows(rows = []) {
    for (const r of rows || []) {
      if (!r?.id || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
      if (out.length >= limit * 2) break;
    }
  }
  const q = String(query || '').trim();
  if (q) {
    await addRows(await safeFetch(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&text_value=ilike.${encodeURIComponent(likeValue(q.slice(0, 90)))}&order=updated_at.desc&limit=${limit}`));
    for (const tk of queryTokens(q)) {
      if (out.length >= limit) break;
      await addRows(await safeFetch(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&text_value=ilike.${encodeURIComponent(likeValue(tk))}&order=updated_at.desc&limit=${Math.max(8, Math.ceil(limit/2))}`));
    }
  }
  if (out.length < Math.min(4, limit)) {
    const recent = await safeFetch(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&order=updated_at.desc&limit=250`);
    const toks = queryTokens(q);
    const filtered = q ? recent.filter(r => toks.some(t => normalize(JSON.stringify({ text: r.text_value || '', attributes: r.attributes || {} })).includes(normalize(t)))) : recent;
    await addRows(filtered);
  }
  return out
    .map(r => ({ ...r, _score: scoreRow(r, q) }))
    .sort((a, b) => (b._score || 0) - (a._score || 0))
    .slice(0, limit);
}

function formatBrainRows(rows = []) {
  return rows.map((r, idx) => {
    const a = r.attributes || {};
    const object = a.knowledge_object || a.object || null;
    const objectLine = object ? `\n  OBJECT: ${JSON.stringify(object).slice(0, 1600)}` : '';
    const source = a.filename || a.title || a.topic || a.source || a.product_group || '';
    return `${idx + 1}. TYPE: ${a.object_type || 'knowledge_segment'} | NHÓM: ${a.product_group || a.category || a.detected_category || ''} | ƯU TIÊN: ${a.priority || ''} | NGUỒN: ${source}\n  NỘI DUNG: ${String(r.text_value || '').slice(0, 1800)}${objectLine}`;
  }).join('\n---\n');
}

async function buildBrainContextForMessage(historyText = '', opts = {}) {
  const query = opts.query || lastUsefulText(historyText);
  const rows = await searchBrainSegments(query, Number(opts.limit || 12));
  const explain = {
    source: opts.source || 'buildBrainContextForMessage',
    queryPreview: String(query || '').slice(0, 160),
    tokens: queryTokens(query).slice(0, 8),
    resultCount: rows.length,
    top: rows.slice(0, 5).map(r => ({ id: r.id, score: r._score || 0, type: r.attributes?.object_type || r.attributes?.brain_object_type || 'knowledge_segment', group: r.attributes?.product_group || r.attributes?.category || '', title: r.attributes?.title || r.attributes?.filename || '' }))
  };
  console.log('[AI_BRAIN_LOOKUP]', JSON.stringify(explain));
  if (!rows.length) return '';
  return [
    'AI BRAIN CONTEXT - TRI THỨC DOANH NGHIỆP ĐÃ HẤP THỤ / ĐÃ DUYỆT',
    'Quy tắc dùng context:',
    '- Ưu tiên dữ liệu dưới đây hơn kiến thức chung của model.',
    '- Không bịa giá/model/kích thước nếu context không có.',
    '- Nếu context có rule/experience phù hợp thì áp dụng như quy trình nội bộ.',
    '- Nếu khách hỏi thông tin không có trong context thì nói chưa có dữ liệu chắc chắn và xin SĐT/Zalo để kiểm tra.',
    '',
    formatBrainRows(rows)
  ].join('\n').slice(0, Number(opts.maxChars || 22000));
}

module.exports = {
  buildBrainContextForMessage,
  searchBrainSegments,
  normalize,
  queryTokens
};
