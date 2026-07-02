function cleanText(s = '') { return String(s || '').replace(/\s+/g, ' ').trim(); }
function parseAdInfoFromText(text = '') {
  const t = cleanText(text);
  const adId = (t.match(/(?:ad[_\s-]*id|ID quảng cáo|quảng cáo)[:#\s]*([0-9]{8,})/i) || [])[1] || '';
  const adName = (t.match(/(?:ad name|tên quảng cáo)[:\s]+(.{3,80})/i) || [])[1] || '';
  return { ad_id: adId || 'unknown_ad', ad_name: adName || '' };
}
function inferRoleFromBubble(elText = '') {
  const t = cleanText(elText);
  if (/^(bạn|you|page|aiguka|botcake|pancake)\b/i.test(t)) return 'page';
  return 'customer';
}
module.exports = { cleanText, parseAdInfoFromText, inferRoleFromBubble };
