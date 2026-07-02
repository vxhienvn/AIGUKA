export function normalizeVietnamPhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[^0-9+]/g, '');
  if (s.startsWith('+84')) s = '0' + s.slice(3);
  if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
  if (/^0[35789][0-9]{8}$/.test(s)) return s;
  return null;
}

export function extractPhones(text = '') {
  const candidates = String(text).match(/(?:\+?84|0)[\s.\-()]*(?:[35789])[\s.\-()]*(?:\d[\s.\-()]*){7,9}/g) || [];
  return [...new Set(candidates.map(normalizeVietnamPhone).filter(Boolean))];
}

export function extractZaloHits(text = '') {
  const t = String(text).toLowerCase();
  if (!t.includes('zalo')) return [];
  return extractPhones(text).length ? extractPhones(text) : ['zalo-mentioned'];
}
