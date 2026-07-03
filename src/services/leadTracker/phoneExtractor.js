'use strict';

/**
 * AIGUKA Lead Tracker Core - Phone Extractor V1.3 / LT-02.4
 * Nhiệm vụ:
 * - Chỉ nhận SĐT Việt Nam hợp lệ: 03/05/07/08/09 + 8 số.
 * - Chuẩn hóa +84/84 về 0xxxxxxxxx.
 * - Không tự đọc Meta/Pancake/Dashboard.
 * - Chỉ quyết định từ nội dung message + actor context + blacklist.
 */

const DEFAULT_BLACKLIST = [
  '0973693677' // Hotline Ánh Dương
];

const VALID_PREFIXES = new Set([
  '032','033','034','035','036','037','038','039',
  '052','056','058','059',
  '070','076','077','078','079',
  '081','082','083','084','085','086','087','088','089',
  '090','091','092','093','094','096','097','098','099'
]);

function normalizePhone(raw) {
  if (!raw) return '';
  let s = String(raw)
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 48))
    .replace(/[^0-9+]/g, '');

  if (s.startsWith('+84')) s = '0' + s.slice(3);
  else if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);

  s = s.replace(/[^0-9]/g, '');
  return s;
}

function isValidVietnamMobile(phone) {
  const p = normalizePhone(phone);
  if (!/^0\d{9}$/.test(p)) return false;
  if (!VALID_PREFIXES.has(p.slice(0, 3))) return false;
  if (/^(\d)\1{9}$/.test(p)) return false;
  return true;
}

function parseBlacklist(extra = []) {
  const envList = String(process.env.LT_PHONE_BLACKLIST || process.env.PHONE_BLACKLIST || '')
    .split(',')
    .map(x => normalizePhone(x.trim()))
    .filter(Boolean);
  return new Set([...DEFAULT_BLACKLIST, ...envList, ...extra.map(normalizePhone)].filter(Boolean));
}

function actorKind(role, source) {
  const r = String(role || '').toLowerCase();
  const s = String(source || '').toLowerCase();

  if (['customer', 'user', 'client'].includes(r)) return 'customer';
  if (s.includes('customer') && !s.includes('page_unknown')) return 'customer';

  if (['admin', 'sale', 'staff'].includes(r) || s.includes('page_admin')) return 'admin';
  if (['bot', 'bot_blocked'].includes(r) || s.includes('bot')) return 'bot';
  if (r === 'page' || s.includes('page_unknown')) return 'page';
  if (r === 'system' || s.includes('page_system') || s.includes('meta_auto')) return 'system';

  return 'unknown';
}

function isCustomerRole(role, source) {
  return actorKind(role, source) === 'customer';
}

function isRejectedActor(role, source) {
  return actorKind(role, source) !== 'customer';
}

function contextScore(text) {
  const t = String(text || '').toLowerCase();
  let score = 95;
  if (/(sđt|sdt|số điện thoại|so dien thoai|zalo|zlo|call|gọi|goi|liên hệ|lien he|đt|dt|alo|số em|số anh|số chị)/i.test(t)) score += 5;
  if (/(hotline|tư vấn miễn phí|showroom|bên em gọi|anh gọi hotline|em gọi hotline|tổng đài|hot line)/i.test(t)) score -= 30;
  return Math.max(0, Math.min(100, score));
}

function leadScore(text, candidate = {}) {
  const t = String(text || '').toLowerCase();
  let score = candidate.confidence || contextScore(text);
  if (/(gọi|goi|call|alo|liên hệ|lien he)/i.test(t)) score += 5;
  if (/(địa chỉ|dia chi|ở|o |gia lâm|hưng yên|hà nội|bắc ninh|long biên)/i.test(t)) score += 3;
  if (/(lắp|mua|chốt|đặt|ship|báo giá|bao gia|xem mẫu|tư vấn)/i.test(t)) score += 3;
  return Math.max(0, Math.min(100, score));
}

function detectZaloContext(text) {
  return /(zalo|za lo|zlo|qr zalo)/i.test(String(text || ''));
}

function extractPhoneCandidates(text, options = {}) {
  const rawText = String(text || '');
  const blacklist = parseBlacklist(options.blacklist || []);
  const candidates = [];
  const rejected = [];

  // Match số có thể có cách, chấm, gạch ngang: 0985 123 456 / +84 985 123 456
  const pattern = /(?:\+?84|0)\s*(?:[.\-\s]?\d){8,11}/g;
  const matches = rawText.match(pattern) || [];

  const seen = new Set();
  for (const match of matches) {
    const normalized = normalizePhone(match);
    const base = {
      raw: match,
      normalized,
      hasZalo: detectZaloContext(rawText),
      confidence: contextScore(rawText),
      score: 0
    };

    if (!normalized) {
      rejected.push({ ...base, reason: 'empty_after_normalize' });
      continue;
    }
    if (!isValidVietnamMobile(normalized)) {
      rejected.push({ ...base, reason: 'invalid_vietnam_mobile' });
      continue;
    }
    if (blacklist.has(normalized)) {
      rejected.push({ ...base, reason: 'blacklisted' });
      continue;
    }
    if (seen.has(normalized)) {
      rejected.push({ ...base, reason: 'duplicate_in_message' });
      continue;
    }
    seen.add(normalized);
    candidates.push({ ...base, score: leadScore(rawText, base) });
  }

  return { candidates, rejected };
}

function extractPhonesFromMessage(message = {}, options = {}) {
  const role = message.role;
  const source = message.source;
  const text = message.text || message.message_text || '';
  const kind = actorKind(role, source);

  if (kind !== 'customer') {
    const preview = String(text || '').slice(0, 180);
    return { candidates: [], rejected: [{ reason: 'actor_rejected', actorKind: kind, role, source, preview }] };
  }

  return extractPhoneCandidates(text, options);
}

module.exports = {
  DEFAULT_BLACKLIST,
  normalizePhone,
  isValidVietnamMobile,
  parseBlacklist,
  actorKind,
  isCustomerRole,
  isRejectedActor,
  detectZaloContext,
  contextScore,
  leadScore,
  extractPhoneCandidates,
  extractPhonesFromMessage
};
