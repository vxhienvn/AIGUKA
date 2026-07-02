function normalizeVietnamesePhone(raw = '') {
  let digits = String(raw).replace(/[^0-9+]/g, '');
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
  digits = digits.replace(/[^0-9]/g, '');
  if (digits.length > 10 && digits.startsWith('84')) digits = '0' + digits.slice(2);
  return digits;
}
function extractPhonesFromText(text = '') {
  const matches = String(text).match(/(?:\+84|0)[0-9\s.\-]{8,13}/g) || [];
  const out = [];
  for (const m of matches) {
    const n = normalizeVietnamesePhone(m);
    if (/^0[0-9]{9}$/.test(n) && !out.includes(n)) out.push(n);
  }
  return out;
}
function hasZalo(text = '') { return /(zalo|za\s*lo|kết\s*bạn|ket\s*ban|qr)/i.test(String(text)); }
module.exports = { normalizeVietnamesePhone, extractPhonesFromText, hasZalo };
