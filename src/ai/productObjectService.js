// AIGUKA V7.2.3 - Product Object Resolver
// Mục tiêu: biến learning_segments dạng bảng/Excel thành Product Objects có thể query theo model, giá, kích thước.
// Không tạo kiến trúc mới; đây là lớp hoàn thiện còn thiếu của V7.2: Knowledge -> Product Object -> Context Builder.

const SUPABASE_ENABLED = String(process.env.SUPABASE_ENABLED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

const { resolveRecognitionGroup, loadRecognitionGroups } = require('./recognitionGroupService');

let productCache = { at: 0, items: [] };
let brainSummaryCache = { at: 0, value: null };
const CACHE_TTL_MS = Number(process.env.PRODUCT_OBJECT_CACHE_TTL_MS || 90_000);

function ready() { return Boolean(SUPABASE_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY); }
function compactError(error) { return String(error?.message || error || '').replace(/\s+/g, ' ').slice(0, 220); }
function stripVietnamese(str = '') { return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'); }
function normalize(str = '') { return stripVietnamese(str).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function toNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[^0-9]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function formatMoney(n) {
  if (!Number.isFinite(Number(n))) return '';
  return Number(n).toLocaleString('vi-VN') + 'đ';
}
function parseSizeToMm(size = '') {
  const s = String(size || '').replace(/[×xX]/g, '*');
  const nums = (s.match(/\d{2,4}/g) || []).map(Number).filter(Boolean);
  return nums.length ? nums : [];
}
function sizeLabel(size = '') { return String(size || '').replace(/\*/g, '×').trim(); }
function detectCategoryFromText(text = '', attrs = {}) {
  const hay = normalize([text, attrs.product_group, attrs.category, attrs.detected_category, attrs.filename, attrs.title].filter(Boolean).join(' '));
  if (/(bon tam|bathtub|massage|jacuzzi)/.test(hay)) return 'Bồn tắm';
  if (/(sen voi|sen tam|lavabo|thiet bi ve sinh)/.test(hay)) return 'Sen vòi / Lavabo';
  if (/(bon cau|toilet)/.test(hay)) return 'Bệt / Bồn cầu';
  if (/(tu chau|tu lavabo|guong lavabo)/.test(hay)) return 'Tủ chậu / Gương lavabo';
  if (/(quat|quat tran|quat den|quat vang|quat ma vang|guka)/.test(hay)) return 'Quạt trần';
  if (/(bep tu|hut mui|may hut mui|fudeer|chau rua|voi bep|voi rua bat)/.test(hay)) return 'Bếp / Hút mùi / Chậu vòi bếp';
  if (/(den chum|den trang tri|ttp|light)/.test(hay)) return 'Đèn trang trí';
  return attrs.product_group || attrs.category || attrs.detected_category || '';
}
function detectBrand(text = '', attrs = {}) {
  const hay = normalize([text, attrs.filename, attrs.title, attrs.product_group, attrs.category].filter(Boolean).join(' '));
  const brands = ['ares','toto','navier','guka','inax','moen','kohler'];
  for (const b of brands) if (hay.includes(b)) return b.toUpperCase();
  return attrs.brand || attrs.metadata?.brand || '';
}

async function loadBrainSummary(options = {}) {
  const now = Date.now();
  if (!options.force && brainSummaryCache.value && now - brainSummaryCache.at < CACHE_TTL_MS) return brainSummaryCache.value;
  if (!ready()) return null;
  try {
    const rows = await supabaseRequest('ai_learning_settings?select=setting_value&setting_key=eq.brain_summary&limit=1');
    const value = rows?.[0]?.setting_value || null;
    brainSummaryCache = { at: now, value };
    return value;
  } catch (error) {
    console.warn('[BRAIN_SUMMARY_LOAD_ERROR]', compactError(error));
    return brainSummaryCache.value || null;
  }
}
function fallbackProductGroups() {
  return [
    { name: 'Quạt trần', aliases: ['quạt','quat','quạt trần','quat tran','quạt đèn','quat den','quạt vàng','quat vang','quạt mạ vàng','quat ma vang','10 cánh','10 canh','guka','fan'] },
    { name: 'Bồn tắm', aliases: ['bồn','bon','bồn tắm','bon tam','jacuzzi','bồn massage','bon massage','bồn ngâm','bon ngam','bồn sục','bon suc','ares'] },
    { name: 'Sen vòi / Lavabo', aliases: ['sen','sen cây','sen cay','sen tắm','sen tam','sen âm','sen am','sen vòi','sen voi','lavabo','vòi lavabo','voi lavabo'] },
    { name: 'Thiết bị vệ sinh', aliases: ['thiết bị vệ sinh','thiet bi ve sinh','bồn cầu','bon cau','bệt','bet','xí','xi','xí bệt','xi bet'] },
    { name: 'Tủ chậu / Gương lavabo', aliases: ['tủ chậu','tu chau','tủ lavabo','tu lavabo','gương lavabo','guong lavabo','tủ gương','tu guong','navier','yosso'] },
    { name: 'Bếp / Hút mùi / Chậu vòi bếp', aliases: ['bếp','bep','bếp từ','bep tu','hút mùi','hut mui','máy hút mùi','may hut mui','fudeer','t8','chậu rửa bát','chau rua bat','vòi bếp','voi bep','vòi rửa bát','voi rua bat'] },
    { name: 'Gạch', aliases: ['gạch','gach','gạch men','gach men','gạch lát','gach lat','gạch ốp','gach op'] },
    { name: 'Đèn trang trí', aliases: ['đèn','den','đèn trang trí','den trang tri','đèn chùm','den chum','ttp','light'] }
  ];
}

async function detectCategoryFromRecognitionGroups(query = '', options = {}) {
  try {
    const result = await resolveRecognitionGroup(query, options);
    if (result?.group?.name && result.confidence >= 60) {
      return {
        category: result.group.name,
        mode: result.group.mode || 'CATEGORY',
        confidence: result.confidence,
        group: result.group,
        alias: result.alias || ''
      };
    }
  } catch (error) {
    console.warn('[PRODUCT_OBJECT_RECOGNITION_ERROR]', compactError(error));
  }
  return null;
}
function intentHasExactProductSignal(intent = {}) {
  const n = normalize(intent.raw || '');
  return Boolean(
    intent.model || intent.bladeCount || intent.targetLengthMm ||
    /(bon tam|jacuzzi|sen cay|sen tam|sen voi|lavabo|bon cau|bet|tu chau|tu lavabo|quat 5 canh|quat 6 canh|quat 8 canh|quat 10 canh|fudeer|t8|den chum|ttp)/.test(n)
  );
}

function detectCategoryFromBrainSummarySync(query = '', summary = null) {
  const qn = normalize(query);
  const groups = Array.isArray(summary?.product_groups) && summary.product_groups.length ? summary.product_groups : fallbackProductGroups();
  for (const g of groups) {
    const candidates = [g.name, ...(Array.isArray(g.aliases) ? g.aliases : [])].filter(Boolean);
    for (const a of candidates) {
      const an = normalize(a);
      if (an && (qn.includes(an) || an.includes(qn))) return g.name;
    }
  }
  return '';
}
function priceBucketLabel(price) {
  const n = Number(price || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  const million = n / 1000000;
  if (million < 1) return 'dưới 1 triệu';
  const low = Math.max(0, Math.floor(million));
  const high = Math.max(low + 1, Math.ceil(million));
  return `khoảng ${low}–${high} triệu`;
}
function priceRangeLabel(prices = []) {
  const nums = prices.map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (!nums.length) return '';
  const min = Math.min(...nums), max = Math.max(...nums);
  const minM = Math.max(0, Math.floor(min / 1000000));
  const maxM = Math.max(minM + 1, Math.ceil(max / 1000000));
  return `khoảng ${minM}–${maxM} triệu`;
}
function extractModel(parts = [], text = '') {
  const candidates = [];
  for (const p of parts) {
    const clean = String(p || '').trim();
    if (/^[A-Z]{1,6}\s*[-]?[A-Z0-9]{2,12}$/i.test(clean) && /\d/.test(clean)) candidates.push(clean);
    const m = clean.match(/\b([A-Z]{1,6}\s*[-]?[A-Z0-9]{2,12})\b/i);
    if (m && /\d/.test(m[1])) candidates.push(m[1]);
  }
  const raw = String(text || '');
  const all = raw.match(/\b[A-Z]{1,6}\s*[-]?[A-Z0-9]{2,12}\b/g) || [];
  for (const m of all) if (/\d/.test(m)) candidates.push(m);
  return (candidates[0] || '').replace(/\s+/g, '').toUpperCase();
}
function extractSize(parts = [], text = '') {
  const candidates = [];
  for (const p of [...parts, text]) {
    const m = String(p || '').match(/\b\d{3,4}\s*[xX×*]\s*\d{3,4}(?:\s*[xX×*]\s*\d{2,4})?\b/);
    if (m) candidates.push(m[0].replace(/\s+/g, '').replace(/[xX×]/g, '*'));
  }
  return candidates[0] || '';
}
function extractPrice(parts = [], text = '') {
  const nums = [];
  for (const p of parts) {
    const n = toNumber(p);
    if (n && n >= 100000 && n <= 500000000) nums.push(n);
  }
  if (!nums.length) {
    const matches = String(text || '').match(/\b\d{6,10}\b/g) || [];
    for (const m of matches) {
      const n = Number(m);
      if (n >= 100000 && n <= 500000000) nums.push(n);
    }
  }
  return nums.length ? nums[nums.length - 1] : null;
}
function parseProductFromSegment(row = {}) {
  const text = String(row.text_value || '').trim();
  const attrs = row.attributes || {};
  if (!text) return null;
  const parts = text.split('|').map(x => x.trim()).filter(Boolean);
  const model = extractModel(parts, text);
  const size = extractSize(parts, text);
  const price = extractPrice(parts, text);
  const category = detectCategoryFromText(text, attrs);
  const brand = detectBrand(text, attrs);
  const hasProductSignals = Boolean(model || size || price || /\b(giá|price|model|mã|size|kích thước|massage|chân hợp kim|sục khí|sen vòi)\b/i.test(text));
  if (!hasProductSignals) return null;
  const rowNo = (text.match(/\]\s*(\d+)\s*\|/) || text.match(/^\s*(\d+)\s*\|/))?.[1] || attrs.row || attrs.position || row.position || '';
  const features = parts
    .filter(p => p && p !== model && p !== size && toNumber(p) !== price && !/^\d+$/.test(p))
    .join(' | ')
    .replace(/^\[[^\]]+\]\s*\d*\s*/,'')
    .trim();
  const aliases = Array.from(new Set([model, model && model.replace(/-/g,''), model && model.replace(/([A-Z]+)(\d+)/,'$1-$2'), size, brand, category].filter(Boolean)));
  return {
    id: `product_${row.id || `${model}_${rowNo}`}`,
    type: 'product',
    category,
    brand,
    model,
    name: [brand, model].filter(Boolean).join(' ') || model || category || 'Sản phẩm',
    aliases,
    size,
    size_mm: parseSizeToMm(size),
    price,
    features,
    source_file: attrs.filename || attrs.title || attrs.source || '',
    source_sheet: attrs.sheet || attrs.metadata?.sheet || '',
    source_row: rowNo,
    source_segment_id: row.id || '',
    source_document_id: row.document_id || '',
    confidence: Math.min(99, 45 + (model ? 20 : 0) + (size ? 15 : 0) + (price ? 15 : 0) + (category ? 4 : 0))
  };
}
async function supabaseRequest(pathname, options = {}) {
  if (!ready()) return [];
  const timeoutMs = Number(process.env.PRODUCT_OBJECT_SUPABASE_TIMEOUT_MS || 6000);
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
  } finally { clearTimeout(timer); }
}
async function loadProductObjects(options = {}) {
  const now = Date.now();
  if (!options.force && productCache.items.length && now - productCache.at < CACHE_TTL_MS) return productCache.items;
  if (!ready()) return [];
  try {
    const select = 'id,document_id,position,text_value,attributes,active,updated_at,created_at';
    const rows = await supabaseRequest(`learning_segments?select=${select}&active=eq.true&attributes->>approved=eq.true&order=updated_at.desc&limit=${Number(options.limit || 20000)}`);
    const items = [];
    const seen = new Set();
    for (const row of rows) {
      const attrs = row.attributes || {};
      if (Array.isArray(attrs.products)) {
        for (const mp of attrs.products) {
          const p = {
            id: `product_manual_${row.id}_${mp.model || mp.name || items.length}`,
            type: 'product',
            category: attrs.category || attrs.detected_category || attrs.product_group || detectCategoryFromText(row.text_value, attrs),
            brand: attrs.brand || mp.brand || detectBrand(row.text_value, attrs),
            model: String(mp.model || mp.code || '').toUpperCase(),
            name: mp.name || mp.model || attrs.title || 'Sản phẩm',
            aliases: Array.from(new Set([...(Array.isArray(attrs.aliases) ? attrs.aliases : []), mp.model, mp.name, attrs.category, attrs.brand].filter(Boolean))),
            size: mp.size || mp.diameter || '',
            size_mm: parseSizeToMm(mp.size || mp.diameter || ''),
            price: toNumber(mp.price),
            price_policy: mp.price_policy || attrs.price_policy || 'reference',
            features: [mp.power, mp.motor, mp.led, mp.warranty, mp.features].filter(Boolean).join(' | '),
            source_file: attrs.filename || attrs.title || attrs.source || 'manual_admin_knowledge',
            source_sheet: attrs.sheet || '', source_row: row.position || '',
            source_segment_id: row.id || '', source_document_id: row.document_id || '', confidence: 96
          };
          const key = [normalize(p.category), normalize(p.brand), normalize(p.model), normalize(p.size), p.price].join('|');
          if (!seen.has(key)) { seen.add(key); items.push(p); }
        }
        continue;
      }
      const p = parseProductFromSegment(row);
      if (!p) continue;
      const key = [normalize(p.category), normalize(p.brand), normalize(p.model), normalize(p.size), p.price].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(p);
    }
    productCache = { at: now, items };
    return items;
  } catch (error) {
    console.warn('[PRODUCT_OBJECT_LOAD_ERROR]', compactError(error));
    return productCache.items || [];
  }
}
function parseQueryIntent(query = '', summary = null) {
  const n = normalize(query);
  const out = { raw: query, category: '', model: '', maxPrice: null, minPrice: null, targetLengthMm: null, wantsList: false };
  if (/(bon tam|bathtub|massage|jacuzzi)/.test(n)) out.category = 'Bồn tắm';
  if (/(sen voi|sen tam|lavabo|sen cay|sen am)/.test(n)) out.category = out.category || 'Sen vòi / Lavabo';
  if (/(quat|quat tran|quat den|quat vang|quat ma vang|guka|10 canh|8 canh|6 canh|5 canh|fan)/.test(n)) out.category = out.category || 'Quạt trần';
  if (/(hut mui|may hut mui|fudeer|bep tu|chau rua bat|voi bep|voi rua bat)/.test(n)) out.category = out.category || 'Bếp / Hút mùi / Chậu vòi bếp';
  if (/(den|den chum|den trang tri|ttp light)/.test(n)) out.category = out.category || 'Đèn trang trí';
  out.category = out.category || detectCategoryFromBrainSummarySync(query, summary);
  const model = String(query || '').match(/\b[A-Z]{1,6}\s*[-]?[A-Z0-9]{2,12}\b/i);
  if (model && /\d/.test(model[0])) out.model = model[0].replace(/\s+/g, '').toUpperCase();
  const priceBelow = n.match(/(?:duoi|nho hon|khoang duoi|<)\s*(\d+(?:[\.,]\d+)?)\s*(trieu|tr|m|k)?/);
  if (priceBelow) {
    const v = Number(priceBelow[1].replace(',', '.'));
    if (priceBelow[2] && ['trieu','tr','m'].includes(priceBelow[2])) out.maxPrice = Math.round(v * 1000000);
    else if (v < 1000) out.maxPrice = Math.round(v * 1000000);
    else out.maxPrice = Math.round(v);
  }
  const m17 = n.match(/(\d)\s*m\s*(\d)/) || n.match(/(\d)[\.,](\d)\s*m/);
  if (m17) out.targetLengthMm = Number(`${m17[1]}${m17[2]}00`);
  const blade = n.match(/(\d{1,2})\s*(canh|cánh)/);
  if (blade) out.bladeCount = Number(blade[1]);
  const mm = n.match(/\b(1[2-9]\d{2}|2\d{3})\b/);
  if (!out.targetLengthMm && mm) out.targetLengthMm = Number(mm[1]);
  out.wantsList = /(vai mau|may mau|danh sach|co mau nao|cho toi xem|tu van|lua chon|mau)/.test(n);
  return out;
}
function scoreProduct(p, intent) {
  let s = 0;
  const hay = normalize([p.category, p.brand, p.model, p.name, p.size, p.features, ...(p.aliases || [])].join(' '));
  const q = normalize(intent.raw);
  if (intent.category && normalize(p.category).includes(normalize(intent.category))) s += 80;
  if (intent.model && normalize(p.model) === normalize(intent.model)) s += 200;
  if (intent.model && hay.includes(normalize(intent.model))) s += 120;
  if (intent.bladeCount && (Number(p.blade_count || 0) === intent.bladeCount || hay.includes(`${intent.bladeCount} canh`))) s += 160;
  if (intent.maxPrice != null && p.price != null) s += p.price <= intent.maxPrice ? 120 : -80;
  if (intent.minPrice != null && p.price != null) s += p.price >= intent.minPrice ? 80 : -60;
  if (intent.targetLengthMm && Array.isArray(p.size_mm) && p.size_mm.length) {
    const diff = Math.min(...p.size_mm.map(x => Math.abs(x - intent.targetLengthMm)));
    if (diff <= 30) s += 140;
    else if (diff <= 100) s += 90;
    else if (diff <= 200) s += 35;
    else s -= Math.min(60, Math.floor(diff / 20));
  }
  for (const tk of normalize(q).split(/\s+/).filter(x => x.length >= 3)) if (hay.includes(tk)) s += 6;
  s += Math.min(15, Number(p.confidence || 0) / 10);
  return s;
}
function productPassesHardFilters(p = {}, intent = {}) {
  // V7.2.5: các câu hỏi dạng "dưới 10 triệu", "1m7", "AR4162" phải lọc bằng dữ liệu có cấu trúc,
  // không được chỉ cộng/trừ điểm rồi để sản phẩm sai điều kiện lọt vào danh sách.
  if (intent.category && !normalize(p.category).includes(normalize(intent.category))) return false;
  if (intent.model) {
    const want = normalize(intent.model);
    const aliases = [p.model, p.name, ...(p.aliases || [])].map(normalize);
    if (!aliases.some(x => x === want || x.includes(want) || want.includes(x))) return false;
  }
  if (intent.bladeCount) {
    const hay = normalize([p.model, p.name, p.features, ...(p.aliases || [])].join(' '));
    if (!(Number(p.blade_count || 0) === intent.bladeCount || hay.includes(`${intent.bladeCount} canh`))) return false;
  }
  if (intent.maxPrice != null) {
    if (p.price == null) return false;
    if (Number(p.price) > Number(intent.maxPrice)) return false;
  }
  if (intent.minPrice != null) {
    if (p.price == null) return false;
    if (Number(p.price) < Number(intent.minPrice)) return false;
  }
  if (intent.targetLengthMm && Array.isArray(p.size_mm) && p.size_mm.length) {
    const diff = Math.min(...p.size_mm.map(x => Math.abs(x - intent.targetLengthMm)));
    // Cho phép lệch 250mm để vẫn gợi ý được mẫu gần nhu cầu, nhưng không kéo toàn bộ catalogue vào.
    if (diff > Number(process.env.PRODUCT_OBJECT_SIZE_TOLERANCE_MM || 250)) return false;
  }
  return true;
}

async function resolveProductObjects(query = '', options = {}) {
  const brainSummary = await loadBrainSummary(options);
  const intent = parseQueryIntent(query, brainSummary);
  const recognition = await detectCategoryFromRecognitionGroups(query, options);
  intent.recognition = recognition;
  // V7.2.7: Recognition Group GENERAL chỉ xác định phạm vi, không được tự chọn sản phẩm cụ thể.
  // Ví dụ Bathroom/Tổng hợp/nhà mới: không kéo bồn cầu thông minh chỉ vì mapping có nhóm Bathroom.
  if (recognition?.group?.mode === 'GENERAL' && !intentHasExactProductSignal(intent)) {
    console.log('[PRODUCT_OBJECT_RESOLVER_GENERAL_GUARD]', JSON.stringify({ query: String(query || '').slice(0,160), group: recognition.group.name, confidence: recognition.confidence }));
    return { intent, totalObjects: 0, filteredObjects: 0, matches: [], recognition, generalMode: true };
  }
  if (!intent.category && recognition?.group?.mode !== 'GENERAL' && recognition?.category) intent.category = recognition.category;
  const all = await loadProductObjects(options);
  const filtered = all.filter(p => productPassesHardFilters(p, intent));
  const scored = filtered
    .map(p => ({ ...p, _score: scoreProduct(p, intent) }))
    .filter(p => p._score > 0)
    .sort((a, b) => {
      if (intent.maxPrice != null && a.price != null && b.price != null) return Number(a.price) - Number(b.price);
      if (intent.targetLengthMm && Array.isArray(a.size_mm) && Array.isArray(b.size_mm)) {
        const da = Math.min(...a.size_mm.map(x => Math.abs(x - intent.targetLengthMm)));
        const db = Math.min(...b.size_mm.map(x => Math.abs(x - intent.targetLengthMm)));
        if (da !== db) return da - db;
      }
      return (b._score || 0) - (a._score || 0);
    });
  const selected = scored.slice(0, Number(options.limit || 12));
  console.log('[PRODUCT_OBJECT_RESOLVER]', JSON.stringify({ query: String(query || '').slice(0,160), intent, recognition: recognition ? { group: recognition.group?.name, mode: recognition.group?.mode, confidence: recognition.confidence } : null, totalObjects: all.length, afterHardFilter: filtered.length, matched: selected.length, top: selected.slice(0,5).map(p => ({ model:p.model, category:p.category, price:p.price, size:p.size, score:p._score })) }));
  return { intent, totalObjects: all.length, filteredObjects: filtered.length, matches: selected };
}
function formatProductObjectContext(result, opts = {}) {
  const matches = result?.matches || [];
  if (!matches.length) return '';
  const lines = matches.map((p, idx) => {
    return `${idx + 1}. ${p.name || p.model || 'Sản phẩm'} | Nhóm: ${p.category || ''} | Model: ${p.model || ''} | Kích thước: ${sizeLabel(p.size) || 'chưa rõ'} | Giá: ${p.price ? priceBucketLabel(p.price) : 'chưa rõ'} | Đặc điểm: ${p.features || 'chưa rõ'} | Nguồn: ${p.source_file || ''}${p.source_row ? ` dòng ${p.source_row}` : ''}`;
  });
  return [
    'PRODUCT OBJECT CONTEXT - DỮ LIỆU SẢN PHẨM ĐÃ CHUẨN HÓA',
    'Quy tắc dùng Product Object:',
    '- Đây là dữ liệu bảng/model/giá/kích thước đã trích từ Knowledge, ưu tiên hơn text search.',
    '- Giá là dữ liệu tham khảo biến động: chỉ dùng để suy ra khoảng giá min-max, không báo giá cụ thể trừ khi có tag campaign.',
    '- Nếu khách hỏi theo giá/kích thước/model, phải dùng danh sách dưới đây nhưng diễn đạt giá theo khoảng.',
    '- Không bịa mẫu ngoài danh sách; nếu thiếu ảnh/slide thì nói sẽ gửi mẫu/ảnh phù hợp hoặc xin Zalo/SĐT.',
    '',
    lines.join('\n')
  ].join('\n').slice(0, Number(opts.maxChars || 12000));
}
async function buildProductObjectContextForMessage(query = '', opts = {}) {
  const result = await resolveProductObjects(query, opts);
  const context = formatProductObjectContext(result, opts);
  console.log('[AI_EXPLAIN_PRODUCT_OBJECT_CONTEXT]', JSON.stringify({ hasContext:Boolean(context), chars: context.length, matched: result.matches.length, totalObjects: result.totalObjects }));
  return context;
}
function intentLooksProductQuery(intent = {}) {
  const n = normalize(intent.raw || '');
  return Boolean(intent.model || intent.category || intent.maxPrice != null || intent.targetLengthMm || /(bon tam|bon cau|sen|lavabo|tu chau|quat|bep|hut mui|chau rua|gia|mau nao|model|kich thuoc|size)/.test(n));
}

function buildDeterministicProductAnswer(result = {}, opts = {}) {
  const matches = result.matches || [];
  const intent = result.intent || {};
  if (!matches.length || !intentLooksProductQuery(intent)) return '';
  const q = normalize(intent.raw || '');
  const title = intent.maxPrice != null
    ? `Dạ có, em tìm thấy một số mẫu ${intent.category || 'sản phẩm'} trong tầm dưới ${formatMoney(intent.maxPrice)}:`
    : intent.targetLengthMm
      ? `Dạ có, em tìm thấy một số mẫu ${intent.category || 'sản phẩm'} gần kích thước ${intent.targetLengthMm}mm:`
      : intent.model
        ? `Dạ em tìm thấy thông tin model ${intent.model}:`
        : `Dạ em tìm thấy một số mẫu phù hợp trong dữ liệu sản phẩm:`;
  const range = priceRangeLabel(matches.map(p => p.price));
  const rows = matches.slice(0, Number(opts.limit || 6)).map((p, i) => {
    const bits = [
      `${i + 1}. ${p.model || p.name || 'Sản phẩm'}`,
      p.size ? `KT ${sizeLabel(p.size)}` : '',
      p.price ? `khoảng ${priceBucketLabel(p.price).replace(/^khoảng\s*/,'')}` : '',
      p.features ? `${p.features}` : ''
    ].filter(Boolean);
    return bits.join(' | ');
  });
  const footer = q.includes('mau') || q.includes('xem') || q.includes('tu van')
    ? 'Anh muốn em gửi hình/slide các mẫu này hay lọc tiếp theo kích thước, kiểu dáng và ngân sách ạ?'
    : 'Anh muốn em lọc thêm theo kích thước, kiểu dáng hoặc gửi hình/slide mẫu phù hợp không ạ?';
  const pricePolicy = range ? `Lưu ý: giá chỉ là khoảng tham khảo ${range}, em sẽ kiểm tra lại giá chính thức theo thời điểm trước khi chốt cho anh.` : 'Lưu ý: giá có thể thay đổi theo chương trình và thời điểm, em sẽ kiểm tra lại trước khi chốt cho anh.';
  return [title, ...rows, pricePolicy, footer].join('\n');
}

async function answerProductQuery(query = '', options = {}) {
  const result = await resolveProductObjects(query, { ...options, limit: Number(options.limit || 12) });
  const answer = buildDeterministicProductAnswer(result, options);
  console.log('[PRODUCT_OBJECT_DIRECT_ANSWER]', JSON.stringify({ query: String(query||'').slice(0,160), hasAnswer: Boolean(answer), matched: result.matches.length, top: result.matches.slice(0,5).map(p=>({model:p.model, price:p.price, size:p.size, score:p._score})) }));
  return { ...result, answer };
}

module.exports = {
  parseProductFromSegment,
  loadProductObjects,
  resolveProductObjects,
  formatProductObjectContext,
  buildProductObjectContextForMessage,
  buildDeterministicProductAnswer,
  answerProductQuery,
  normalize,
  formatMoney,
  loadBrainSummary,
  priceBucketLabel,
  priceRangeLabel
};
