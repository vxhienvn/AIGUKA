const express = require('express');
const {
  pancakeFetchConversations,
  pancakeBuildCustomerRow,
  pancakeVietnamDateString,
  pancakeNormalizeVietnamesePhone,
  pancakeIsValidVietnameseMobile,
  pancakeExtractPhonesFromText,
  pancakeDetectZaloFromText
} = require('../services/pancakeService');

const SUPABASE_ENABLED = String(process.env.SUPABASE_ENABLED || 'false').toLowerCase() === 'true';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

const ACCOUNT_LABELS = {
  '972318199015585': 'fff act_972318199015585',
  '311242249583664': 'Nguyệt Bếp-TB Vệ Sinh act_311242249583664',
  '773958025271034': 'act_773958025271034'
};

const AD_MAPPING_SEED_ROWS = [
  { ad_account_id: '972318199015585', campaign_id: '120244323248080424', campaign_name: 'Quạt GUKA', ad_id: '120244325500230424', ad_name: 'Quạt Tổng Hợp 01', effective_status: 'ACTIVE' },
  { ad_account_id: '972318199015585', campaign_id: '120244323248080424', campaign_name: 'Quạt GUKA', ad_id: '120244584024930424', ad_name: 'Quạt Tổng Hợp 02', effective_status: 'ACTIVE' },
  { ad_account_id: '972318199015585', campaign_id: '120244295740060424', campaign_name: 'Cửa hàng', ad_id: '120244295745820424', ad_name: 'Tổng hợp + xả kho', effective_status: 'ACTIVE' },
  { ad_account_id: '972318199015585', campaign_id: '120244295740060424', campaign_name: 'Cửa hàng', ad_id: '120244297045030424', ad_name: 'Tổng hợp- Khuyến mại', effective_status: 'ACTIVE' },
  { ad_account_id: '972318199015585', campaign_id: '120244295740060424', campaign_name: 'Cửa hàng', ad_id: '120244496819900424', ad_name: 'Tủ Chậu - Bản sao', effective_status: 'ACTIVE' },
  { ad_account_id: '972318199015585', campaign_id: '120244298405040424', campaign_name: 'Test video mới tbvs cc', ad_id: '120244497906990424', ad_name: 'Lavabo, bệt AI', effective_status: 'ACTIVE' },
  { ad_account_id: '972318199015585', campaign_id: '120244298405040424', campaign_name: 'Test video mới tbvs cc', ad_id: '120244621136470424', ad_name: 'Bồn tắm', effective_status: 'ACTIVE' },
  { ad_account_id: '972318199015585', campaign_id: '120244298405040424', campaign_name: 'Test video mới tbvs cc', ad_id: '120244621136460424', ad_name: 'Chậu Vòi', effective_status: 'ACTIVE' },
  { ad_account_id: '773958025271034', campaign_id: '120249960006100494', campaign_name: 'Quạt- Test', ad_id: '120249960006170494', ad_name: 'Quạt 01', effective_status: 'ACTIVE' },
  { ad_account_id: '311242249583664', campaign_id: '120251754173310195', campaign_name: 'quat Guka', ad_id: '120251754173290195', ad_name: 'Quạt tổng hợp 1', effective_status: 'ACTIVE' },
  { ad_account_id: '311242249583664', campaign_id: '120251754173310195', campaign_name: 'quat Guka', ad_id: '120251755097900195', ad_name: 'Quạt tổng hợp 2', effective_status: 'ACTIVE' },
  { ad_account_id: '311242249583664', campaign_id: '120251755254580195', campaign_name: 'cửa hàng', ad_id: '120251755854140195', ad_name: 'cửa hàng 1', effective_status: 'ACTIVE' },
  { ad_account_id: '311242249583664', campaign_id: '120251755254580195', campaign_name: 'cửa hàng', ad_id: '120251755254560195', ad_name: 'cửa hàng win', effective_status: 'ACTIVE' },
  { ad_account_id: '2908103499363342', campaign_id: '120226451816090207', campaign_name: 'VIDEO1 DU HỌC', ad_id: '120226451816070207', ad_name: '2223', effective_status: 'ACTIVE' },
  { ad_account_id: '2908103499363342', campaign_id: '120226451816090207', campaign_name: 'VIDEO1 DU HỌC', ad_id: '120226451890250207', ad_name: '2223', effective_status: 'ACTIVE' },
  { ad_account_id: '2908103499363342', campaign_id: '120236893907130207', campaign_name: '123', ad_id: '120236893907150207', ad_name: '123', effective_status: 'ACTIVE' }
];

let adMapCache = { loadedAt: 0, byAdId: new Map(), byAccountId: new Map() };
const AD_MAP_TTL_MS = 5 * 60 * 1000;

function supabaseReady() {
  return Boolean(SUPABASE_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function supabaseRequest(pathname, options = {}) {
  if (!supabaseReady()) return [];
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

function escapeText(value = '') {
  return String(value || '').trim();
}

function unique(arr = []) {
  return Array.from(new Set(arr.filter(Boolean).map(x => String(x).trim()).filter(Boolean)));
}


function normalizePhone(value = '') {
  return pancakeNormalizeVietnamesePhone(value);
}

function uniquePhones(values = []) {
  const out = [];
  for (const value of values || []) {
    const n = normalizePhone(value);
    if (pancakeIsValidVietnameseMobile(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

function contactKey(row = {}) {
  const phones = uniquePhones(row.phones || []);
  if (phones.length) return `phone:${phones[0]}`;
  if (row.has_zalo) return `zalo:${row.conversation_id || row.customer_id || row.customer_name || ''}`;
  return `row:${row.conversation_id || row.customer_name || Math.random()}`;
}

function identityScore(row = {}) {
  let score = 0;
  if (row.ad_name && !/^Không rõ QC/i.test(row.ad_name)) score += 20;
  if (row.ad_account_name && !/^Không rõ tài khoản/i.test(row.ad_account_name)) score += 20;
  if (row.ad_id) score += 8;
  if ((row.phones || []).length) score += 10;
  if (row.has_zalo) score += 5;
  if ((row.tags || []).length) score += Math.min((row.tags || []).length, 8);
  return score;
}

function dedupeLeadRows(rows = []) {
  const best = new Map();
  for (const row of rows || []) {
    const phones = uniquePhones(row.phones || []);
    const normalizedRow = { ...row, phones, phoneText: phones.join(', ') };
    const keys = phones.length ? phones.map(p => `phone:${p}`) : [contactKey(normalizedRow)];
    for (const key of keys) {
      const candidate = phones.length > 1 ? { ...normalizedRow, phones: [key.replace(/^phone:/, '')], phoneText: key.replace(/^phone:/, '') } : normalizedRow;
      const current = best.get(key);
      if (!current) {
        best.set(key, candidate);
        continue;
      }
      const cScore = identityScore(candidate);
      const oldScore = identityScore(current);
      const cTime = String(candidate.updated_at || '');
      const oldTime = String(current.updated_at || '');
      if (cScore > oldScore || (cScore === oldScore && cTime > oldTime)) best.set(key, candidate);
    }
  }
  return Array.from(best.values()).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

function normalizeAdId(id = '') {
  const s = String(id || '').trim();
  const m = s.match(/\d{10,}/);
  return m ? m[0] : s;
}

function normalizeAccountId(id = '') {
  return String(id || '').replace(/^act_/, '').trim();
}

function todayKeyVN(offset = 0) {
  const now = new Date();
  const vn = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  vn.setDate(vn.getDate() + offset);
  const y = vn.getFullYear();
  const m = String(vn.getMonth() + 1).padStart(2, '0');
  const d = String(vn.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDateKeyVN(input) {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input).slice(0, 10);
  return pancakeVietnamDateString(d);
}

function resolveRange(query = {}) {
  const preset = String(query.preset || '').toLowerCase();
  if (query.from || query.to) return { from: String(query.from || '1970-01-01'), to: String(query.to || todayKeyVN(0)) };
  if (preset === 'today') return { from: todayKeyVN(0), to: todayKeyVN(0) };
  if (preset === 'yesterday') return { from: todayKeyVN(-1), to: todayKeyVN(-1) };
  if (preset === '7d' || preset === '7') return { from: todayKeyVN(-6), to: todayKeyVN(0) };
  if (preset === '30d' || preset === '30') return { from: todayKeyVN(-29), to: todayKeyVN(0) };
  return { from: todayKeyVN(-29), to: todayKeyVN(0) };
}

function makeSeedMaps() {
  const byAdId = new Map();
  const byAccountId = new Map();
  for (const [id, name] of Object.entries(ACCOUNT_LABELS)) byAccountId.set(normalizeAccountId(id), { ad_account_id: normalizeAccountId(id), ad_account_name: name });
  for (const row of AD_MAPPING_SEED_ROWS) {
    const adId = normalizeAdId(row.ad_id);
    const accountId = normalizeAccountId(row.ad_account_id);
    const enriched = {
      ...row,
      ad_id: adId,
      ad_account_id: accountId,
      ad_account_name: row.ad_account_name || ACCOUNT_LABELS[accountId] || (accountId ? `act_${accountId}` : '')
    };
    if (adId) byAdId.set(adId, enriched);
    if (accountId && !byAccountId.has(accountId)) byAccountId.set(accountId, { ad_account_id: accountId, ad_account_name: enriched.ad_account_name });
  }
  return { byAdId, byAccountId };
}

async function loadAdMappings() {
  const now = Date.now();
  if (adMapCache.loadedAt && now - adMapCache.loadedAt < AD_MAP_TTL_MS) return adMapCache;
  const seed = makeSeedMaps();
  const byAdId = seed.byAdId;
  const byAccountId = seed.byAccountId;
  if (supabaseReady()) {
    try {
      const rows = await supabaseRequest('ad_mappings?select=*&limit=5000', { method: 'GET' });
      for (const row of Array.isArray(rows) ? rows : []) {
        const adId = normalizeAdId(row.ad_id);
        const accountId = normalizeAccountId(row.ad_account_id || row.account_id);
        const adAccountName = row.ad_account_name || row.account_name || ACCOUNT_LABELS[accountId] || (accountId ? `act_${accountId}` : '');
        const enriched = { ...row, ad_id: adId, ad_account_id: accountId, ad_account_name: adAccountName };
        if (adId) byAdId.set(adId, enriched);
        if (accountId) byAccountId.set(accountId, { ad_account_id: accountId, ad_account_name: adAccountName });
      }
    } catch (error) {
      console.warn('[LEAD_CHECK] Không đọc được ad_mappings, dùng seed:', error.message);
    }
  }
  adMapCache = { loadedAt: now, byAdId, byAccountId };
  return adMapCache;
}

function pickMappedAd(row, maps) {
  const ids = unique([row.ad_id, ...(row.ad_ids || [])].map(normalizeAdId));
  for (const id of ids) {
    const mapped = maps.byAdId.get(id);
    if (mapped) return mapped;
  }
  return null;
}

function hydrateAdIdentity(row, maps) {
  const adIds = unique([row.ad_id, ...(row.ad_ids || [])].map(normalizeAdId));
  const mapped = pickMappedAd({ ...row, ad_ids: adIds }, maps);
  const accountId = normalizeAccountId(row.ad_account_id || row.account_id || mapped?.ad_account_id || '');
  const accountMapped = maps.byAccountId.get(accountId);
  const adName = escapeText(row.ad_name || row.ad_title || row.adTitle || mapped?.ad_name || (adIds[0] ? `QC ${adIds[0]}` : 'Không rõ QC'));
  const accountName = escapeText(row.ad_account_name || row.account_name || row.accountName || accountMapped?.ad_account_name || mapped?.ad_account_name || (accountId ? `act_${accountId}` : 'Không rõ tài khoản'));
  return {
    ad_ids: adIds,
    ad_id: normalizeAdId(row.ad_id || mapped?.ad_id || adIds[0] || ''),
    ad_name: adName,
    ad_account_id: accountId || normalizeAccountId(mapped?.ad_account_id || ''),
    ad_account_name: accountName,
    status: String(row.status || row.effective_status || mapped?.effective_status || 'active').toLowerCase()
  };
}

function normalizeLeadRow(row, maps) {
  const identity = hydrateAdIdentity(row, maps);
  const phones = uniquePhones(row.phones || []);
  const tags = unique(row.tags || []);
  return {
    ...row,
    customer_name: row.name || row.customer_name || 'Không rõ tên',
    phones,
    phoneText: phones.join(', '),
    has_zalo: Boolean(row.has_zalo || tags.includes('Zalo')),
    tags,
    ...identity,
    product: row.product || 'Khác',
    updated_date_vn: toDateKeyVN(row.updated_at),
    has_contact: Boolean(row.has_phone || phones.length || row.has_zalo || tags.includes('Zalo'))
  };
}

async function loadRows(limit = 500) {
  const maps = await loadAdMappings();
  const conversations = await pancakeFetchConversations(Math.min(Math.max(Number(limit) || 500, 1), 500));
  return conversations.map(c => normalizeLeadRow(pancakeBuildCustomerRow(c), maps));
}

function filterRows(rows, query = {}) {
  const { from, to } = resolveRange(query);
  const q = String(query.q || '').toLowerCase().trim();
  const ad = String(query.ad || query.ad_id || '').toLowerCase().trim();
  const account = String(query.account || query.account_id || '').toLowerCase().trim();
  const contactMode = String(query.contact || 'all').toLowerCase();
  return rows.filter(r => {
    if (!r.has_contact) return false;
    if (contactMode === 'phone' && !(r.phones || []).length) return false;
    if (contactMode === 'zalo' && !r.has_zalo) return false;
    const d = r.updated_date_vn;
    if (d && (d < from || d > to)) return false;
    if (q) {
      const hay = [r.customer_name, r.phoneText, r.ad_name, r.ad_id, r.ad_account_name, r.tags.join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (ad) {
      const hay = [r.ad_name, r.ad_id, ...(r.ad_ids || [])].join(' ').toLowerCase();
      if (!hay.includes(ad)) return false;
    }
    if (account) {
      const hay = [r.ad_account_name, r.ad_account_id].join(' ').toLowerCase();
      if (!hay.includes(account)) return false;
    }
    return true;
  });
}

function groupByAd(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.ad_account_name || 'Không rõ tài khoản'}|${r.ad_name || 'Không rõ QC'}|${r.ad_id || ''}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        ad_name: r.ad_name || 'Không rõ QC',
        ad_id: r.ad_id || '',
        ad_ids: [],
        ad_account_name: r.ad_account_name || 'Không rõ tài khoản',
        ad_account_id: r.ad_account_id || '',
        status: r.status || 'active',
        conversations: 0,
        phones: [],
        zalo: 0,
        leads: 0,
        latest_at: '',
        rows: []
      });
    }
    const g = map.get(key);
    g.conversations += 1;
    g.phones = unique([...g.phones, ...(r.phones || [])]);
    g.ad_ids = unique([...g.ad_ids, ...(r.ad_ids || []), r.ad_id]);
    if (r.has_zalo) g.zalo += 1;
    g.leads += 1;
    if (!g.latest_at || String(r.updated_at || '') > String(g.latest_at || '')) g.latest_at = r.updated_at || '';
    g.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => b.leads - a.leads || b.phones.length - a.phones.length);
}

function rowMatchesPhone(row, phone) {
  const n = pancakeNormalizeVietnamesePhone(phone);
  return (row.phones || []).some(p => pancakeNormalizeVietnamesePhone(p) === n);
}

async function fetchConversationMessages(conversationId, query = {}) {
  const out = { source: 'none', messages: [] };
  if (!supabaseReady()) return out;
  const phone = pancakeNormalizeVietnamesePhone(query.phone || '');
  try {
    if (conversationId) {
      const rows = await supabaseRequest(`messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=*&order=created_at.asc&limit=300`, { method: 'GET' });
      if (Array.isArray(rows) && rows.length) return { source: 'supabase_messages_by_conversation', messages: rows };
    }
  } catch (_) {}

  // Fallback: Pancake conversation_id thường khác Meta conversation_id. Tìm theo chính SĐT trong bảng messages.
  if (phone) {
    try {
      const terms = unique([phone, phone.slice(1), phone.slice(-8), phone.slice(-7), phone.slice(-6)]).filter(x => x && x.length >= 6);
      for (const term of terms) {
        const hitRows = await supabaseRequest(`messages?text=ilike.*${encodeURIComponent(term)}*&select=conversation_id,created_at,text,role,source,sender_id&order=created_at.desc&limit=20`, { method: 'GET' });
        const convoIds = unique((Array.isArray(hitRows) ? hitRows : []).map(x => x.conversation_id));
        if (convoIds.length) {
          const id = convoIds[0];
          const rows = await supabaseRequest(`messages?conversation_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.asc&limit=300`, { method: 'GET' });
          return { source: 'supabase_messages_by_phone', matched_conversation_id: id, messages: Array.isArray(rows) ? rows : [] };
        }
      }
    } catch (_) {}
  }
  return out;
}

function createLeadCheckRoutes() {
  const router = express.Router();

  router.get('/list', async (req, res) => {
    try {
      const limit = Number(req.query.limit || 500);
      const raw = filterRows(await loadRows(limit), req.query);
      const all = dedupeLeadRows(raw);
      const displayCap = Math.max(1, Math.min(Number(req.query.display_limit || req.query.take || 50), 500));
      const rows = all.slice(0, displayCap);
      const groups = groupByAd(rows);
      res.json({ ok: true, range: resolveRange(req.query), count: rows.length, total_before_display_cap: all.length, summary: {
        ad_groups: groups.length,
        unique_phones: unique(rows.flatMap(r => r.phones || [])).length,
        contact_rows: rows.length,
        zalo: rows.filter(r => r.has_zalo).length,
        leads: rows.length
      }, groups, rows });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/filters', async (req, res) => {
    try {
      const rows = dedupeLeadRows(filterRows(await loadRows(Number(req.query.limit || 500)), req.query));
      const ads = groupByAd(rows).map(g => ({ ad_name: g.ad_name, ad_id: g.ad_id, ad_ids: g.ad_ids, ad_account_name: g.ad_account_name, count: g.leads, phones: g.phones.length }));
      const accounts = Array.from(new Map(rows.map(r => [r.ad_account_name || 'Không rõ tài khoản', { name: r.ad_account_name || 'Không rõ tài khoản', id: r.ad_account_id || '', count: 0 }])).values());
      for (const a of accounts) a.count = rows.filter(r => (r.ad_account_name || 'Không rõ tài khoản') === a.name).length;
      res.json({ ok: true, ads, accounts, range: resolveRange(req.query) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/conversation/:id', async (req, res) => {
    try {
      const convo = await fetchConversationMessages(req.params.id, req.query);
      res.json({ ok: true, conversation_id: req.params.id, ...convo });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get('/debug/ad-map', async (req, res) => {
    try {
      const maps = await loadAdMappings();
      res.json({ ok: true, ad_count: maps.byAdId.size, account_count: maps.byAccountId.size, ads: Array.from(maps.byAdId.values()).slice(0, 50), accounts: Array.from(maps.byAccountId.values()) });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  return router;
}

module.exports = createLeadCheckRoutes;
