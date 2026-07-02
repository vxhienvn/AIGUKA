const { extractPhones, hasZaloText } = require('./phone');

function cleanText(v = '') {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function inferAdFromText(text = '') {
  const t = cleanText(text);
  const id = (t.match(/\b1[0-9]{14,}\b/) || [])[0] || '';
  let name = '';
  const m = t.match(/(?:quảng cáo|ad|qc)[:\s-]+([^|\n]{2,80})/i);
  if (m) name = cleanText(m[1]);
  return { ad_id: id, ad_name: name };
}

function buildLeadsFromConversation(conv = {}) {
  const messages = Array.isArray(conv.messages) ? conv.messages : [];
  const fullText = messages.map(m => m.text || '').join('\n');
  const phones = new Map();
  let zaloEvidence = null;

  for (const msg of messages) {
    const text = cleanText(msg.text || '');
    for (const p of extractPhones(text)) {
      if (!phones.has(p)) phones.set(p, { phone: p, message: text, time: msg.time || null });
    }
    if (!zaloEvidence && hasZaloText(text)) zaloEvidence = { message: text, time: msg.time || null };
  }

  const hasPancakeZalo = Boolean(conv.pancake_flags?.has_zalo || conv.pancake_flags?.zalo || conv.tags?.includes?.('Zalo'));
  const hasZalo = Boolean(zaloEvidence || hasPancakeZalo || hasZaloText(fullText));
  const ad = conv.ad_id ? { ad_id: conv.ad_id, ad_name: conv.ad_name || '' } : inferAdFromText([conv.ad_name, conv.source_text, fullText].join('\n'));
  const adId = String(ad.ad_id || conv.ad_id || 'unknown_ad').trim() || 'unknown_ad';
  const adName = conv.ad_name || ad.ad_name || 'Chưa đọc được tên quảng cáo';

  const base = {
    ad_id: adId,
    ad_name: adName,
    campaign_id: conv.campaign_id || null,
    campaign_name: conv.campaign_name || null,
    adset_id: conv.adset_id || null,
    adset_name: conv.adset_name || null,
    page_id: conv.page_id || process.env.META_SYNC_PAGE_ID || null,
    conversation_id: conv.conversation_id,
    conversation_url: conv.conversation_url || null,
    customer_id: conv.customer_id || null,
    customer_name: conv.customer_name || null,
    customer_profile_url: conv.customer_profile_url || null,
    has_zalo: hasZalo,
    first_message: cleanText(messages[0]?.text || ''),
    last_message: cleanText(messages[messages.length - 1]?.text || ''),
    last_message_at: messages[messages.length - 1]?.time || null,
    full_history_json: messages,
    raw: conv.raw || {}
  };

  const leads = [];
  for (const item of phones.values()) {
    leads.push({
      ...base,
      phone: item.phone,
      normalized_phone: item.phone,
      has_phone: true,
      source_flag: hasZalo ? 'both' : 'phone_text',
      evidence_message: item.message,
      evidence_message_time: item.time
    });
  }

  if (!leads.length && hasZalo) {
    leads.push({
      ...base,
      phone: null,
      normalized_phone: null,
      has_phone: false,
      source_flag: hasPancakeZalo ? 'pancake_zalo_flag' : 'zalo_text',
      evidence_message: zaloEvidence?.message || 'Có cờ Zalo/Pancake nhưng chưa thấy số trong text',
      evidence_message_time: zaloEvidence?.time || base.last_message_at
    });
  }

  return { leads, phones: Array.from(phones.keys()), hasZalo, ad_id: adId, ad_name: adName };
}

module.exports = { cleanText, inferAdFromText, buildLeadsFromConversation };
