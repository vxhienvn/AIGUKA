function normalizeVietnamesePhone(raw = '') {
  let digits = String(raw || '').replace(/[^0-9+]/g, '');
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
  digits = digits.replace(/[^0-9]/g, '');
  if (digits.length > 10 && digits.startsWith('84')) digits = '0' + digits.slice(2);
  return digits;
}

function extractPhones(text = '') {
  const src = String(text || '');
  const matches = src.match(/(?:\+84|0)[0-9\s.\-()]{8,16}/g) || [];
  const out = [];
  for (const m of matches) {
    const n = normalizeVietnamesePhone(m);
    if (/^0[0-9]{9}$/.test(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

function hasZaloText(text = '') {
  return /\bzalo\b|za\s*lo|zalo\s*qr|qr\s*zalo|qu[eé]t\s*zalo|k[eế]t\s*b[aạ]n\s*zalo/i.test(String(text || ''));
}

module.exports = { normalizeVietnamesePhone, extractPhones, hasZaloText };
