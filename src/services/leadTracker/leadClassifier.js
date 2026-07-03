'use strict';

/**
 * AIGUKA Lead Intelligence - Lightweight classifier LT-02.5
 * Không gọi AI/API ngoài. Chỉ đọc text trong messages để gán nhãn ban đầu.
 */

function normalizeText(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(t, patterns) {
  return patterns.some(p => (p instanceof RegExp ? p.test(t) : t.includes(p)));
}

const PRODUCT_RULES = [
  { key: 'fan', label: 'Quạt', words: ['quat', 'quat tran', '10 canh', '8 canh', 'canh quat', 'den quat', 'quat den'] },
  { key: 'toilet', label: 'Bồn cầu', words: ['bon cau', 'bồn cầu', 'toilet', 'wc', 'bon cau thong minh', 'thong minh'] },
  { key: 'shower', label: 'Sen vòi / sen cây', words: ['sen cay', 'sen voi', 'voi sen', 'sen tam', 'cay sen', 'sen am'] },
  { key: 'lavabo', label: 'Lavabo / tủ lavabo', words: ['lavabo', 'tu lavabo', 'chau rua mat', 'chau lavabo', 'bon rua mat'] },
  { key: 'sink', label: 'Chậu rửa bát', words: ['chau rua bat', 'bon rua bat', 'chau rua', 'voi rua bat'] },
  { key: 'combo_bathroom', label: 'Combo phòng tắm', words: ['combo', '12 mon', 'nha tam', 'phong tam', 'thiet bi ve sinh'] },
  { key: 'kitchen', label: 'Bếp / hút mùi', words: ['bep tu', 'hut mui', 'may hut mui', 'bep', 'bep dien'] },
  { key: 'lighting', label: 'Đèn trang trí', words: ['den chum', 'den trang tri', 'den pha le', 'den'] },
  { key: 'tile', label: 'Gạch', words: ['gach', 'gach op', 'gach lat', 'gach men'] }
];

const LOCATION_WORDS = [
  'ha noi', 'hanoi', 'hung yen', 'bac ninh', 'hai phong', 'bac giang', 'gia lam', 'long bien',
  'dong anh', 'tu son', 'thuan thanh', 'van giang', 'my hao', 'yen my', 'pho noi', 'ha dong',
  'hoai duc', 'soc son', 'thanh tri', 'cau giay', 'tay ho'
];

function extractProduct(text) {
  const t = normalizeText(text);
  for (const rule of PRODUCT_RULES) {
    if (hasAny(t, rule.words)) return { product_group: rule.key, product_label: rule.label };
  }
  return { product_group: 'unknown', product_label: 'Chưa rõ sản phẩm' };
}

function extractIntent(text) {
  const t = normalizeText(text);
  if (hasAny(t, ['dat hang', 'chot', 'lay cho', 'mua', 'ship', 'lap cho', 'lap dat', 'em lay', 'anh lay', 'chi lay'])) return 'buy';
  if (hasAny(t, ['bao gia', 'gia', 'xin gia', 'bao nhieu', 'bn', 'tu van', 'goi em', 'call', 'lien he'])) return 'quote_or_callback';
  if (hasAny(t, ['xem mau', 'catalogue', 'catalog', 'mau nao', 'gui mau', 'mau'])) return 'sample';
  if (hasAny(t, ['dia chi', 'showroom', 'cua hang', 'o dau', 'den xem'])) return 'visit';
  if (hasAny(t, ['bao hanh', 'kich thuoc', 'cong nang', 'thong so', 'chat lieu', 'dong co'])) return 'technical';
  return 'contact_shared';
}

function extractQuantity(text) {
  const t = normalizeText(text);
  const m = t.match(/(?:lay|lap|mua|dat|can)\s+(\d{1,2})\s*(?:cai|bo|chiec|mon)?/i)
    || t.match(/(\d{1,2})\s*(?:cai|bo|chiec)\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

function extractLocation(text) {
  const t = normalizeText(text);
  const found = LOCATION_WORDS.find(w => t.includes(w));
  if (!found) return null;
  return found.split(' ').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
}

function hasAddressSignal(text) {
  const t = normalizeText(text);
  return hasAny(t, ['dia chi', 'em o', 'anh o', 'chi o', 'nha em', 'nha anh', 'nha chi', 'phuong', 'xa ', 'quan ', 'huyen ', 'duong ', 'pho ']) || Boolean(extractLocation(text));
}

function classifyLeadText(text = '', baseScore = 95) {
  const product = extractProduct(text);
  const intent = extractIntent(text);
  const quantity = extractQuantity(text);
  const location = extractLocation(text);
  const addressSignal = hasAddressSignal(text);
  const needCallback = hasAny(normalizeText(text), ['goi', 'call', 'alo', 'lien he', 'tu van']);
  const needQuotation = hasAny(normalizeText(text), ['bao gia', 'xin gia', 'gia', 'bao nhieu', 'bn']);
  const needSample = hasAny(normalizeText(text), ['xem mau', 'gui mau', 'catalog', 'catalogue', 'mau']);

  let score = Number(baseScore || 80);
  if (intent === 'buy') score += 8;
  if (intent === 'quote_or_callback') score += 4;
  if (needCallback) score += 4;
  if (needQuotation) score += 3;
  if (needSample) score += 2;
  if (product.product_group !== 'unknown') score += 4;
  if (quantity) score += 3;
  if (location || addressSignal) score += 4;
  score = Math.max(0, Math.min(100, score));

  const signals = [];
  if (product.product_group !== 'unknown') signals.push(`Sản phẩm: ${product.product_label}`);
  if (intent) signals.push(`Ý định: ${intent}`);
  if (quantity) signals.push(`Số lượng: ${quantity}`);
  if (location) signals.push(`Khu vực: ${location}`);
  if (needCallback) signals.push('Muốn được gọi/tư vấn');
  if (needQuotation) signals.push('Cần báo giá');
  if (needSample) signals.push('Cần mẫu/catalogue');

  return {
    product_group: product.product_group,
    product_label: product.product_label,
    intent,
    quantity,
    location,
    has_address_signal: addressSignal,
    need_callback: needCallback,
    need_quotation: needQuotation,
    need_sample: needSample,
    lead_score: score,
    summary: signals.length ? signals.join(' | ') : 'Khách đã để lại thông tin liên hệ.',
    signals
  };
}

module.exports = {
  classifyLeadText,
  normalizeText,
  extractProduct,
  extractIntent,
  extractQuantity,
  extractLocation
};
