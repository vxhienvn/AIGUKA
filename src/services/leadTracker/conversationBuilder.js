'use strict';

const { actorKind } = require('./phoneExtractor');
const { resolveCustomerName } = require('./customerResolver');

function getMessageText(row) {
  return row.text || row.message_text || row.body || '';
}

function getMessageTime(row) {
  return row.created_at || row.message_time || row.timestamp || null;
}

function timeValue(row) {
  const t = getMessageTime(row);
  const n = t ? Date.parse(t) : 0;
  return Number.isFinite(n) ? n : 0;
}

function buildConversations(rows = [], maps = {}) {
  const byId = new Map();
  for (const row of rows || []) {
    const cid = String(row.conversation_id || row.thread_id || row.id || 'unknown_conversation');
    if (!byId.has(cid)) {
      byId.set(cid, {
        conversation_id: cid,
        sender_id: row.sender_id || null,
        customer_id: row.customer_id || null,
        customer_name: resolveCustomerName(row, maps),
        messages: [],
        customerMessages: [],
        botMessages: [],
        adminMessages: [],
        pageMessages: [],
        systemMessages: [],
        fullText: '',
        customerText: '',
        firstMessageAt: null,
        lastMessageAt: null,
        firstCustomerMessageAt: null,
        lastCustomerMessageAt: null,
        counts: { total: 0, customer: 0, bot: 0, admin: 0, page: 0, system: 0, unknown: 0 }
      });
    }

    const conv = byId.get(cid);
    if (!conv.sender_id && row.sender_id) conv.sender_id = row.sender_id;
    if (!conv.customer_id && row.customer_id) conv.customer_id = row.customer_id;
    const name = resolveCustomerName(row, maps);
    if ((!conv.customer_name || conv.customer_name === 'unknown_customer' || conv.customer_name === conv.sender_id) && name) conv.customer_name = name;

    const kind = actorKind(row.role, row.source);
    const item = {
      id: row.id || null,
      conversation_id: cid,
      sender_id: row.sender_id || null,
      role: row.role || null,
      source: row.source || null,
      actorKind: kind,
      created_at: getMessageTime(row),
      text: getMessageText(row),
      raw: row
    };
    conv.messages.push(item);
    conv.counts.total += 1;
    conv.counts[kind] = (conv.counts[kind] || 0) + 1;

    if (kind === 'customer') conv.customerMessages.push(item);
    else if (kind === 'bot') conv.botMessages.push(item);
    else if (kind === 'admin') conv.adminMessages.push(item);
    else if (kind === 'page') conv.pageMessages.push(item);
    else if (kind === 'system') conv.systemMessages.push(item);
  }

  for (const conv of byId.values()) {
    conv.messages.sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
    });
    conv.customerMessages.sort((a, b) => (Date.parse(a.created_at || 0) || 0) - (Date.parse(b.created_at || 0) || 0));
    const first = conv.messages[0];
    const last = conv.messages[conv.messages.length - 1];
    const firstCustomer = conv.customerMessages[0];
    const lastCustomer = conv.customerMessages[conv.customerMessages.length - 1];
    conv.firstMessageAt = first ? first.created_at : null;
    conv.lastMessageAt = last ? last.created_at : null;
    conv.firstCustomerMessageAt = firstCustomer ? firstCustomer.created_at : null;
    conv.lastCustomerMessageAt = lastCustomer ? lastCustomer.created_at : null;
    conv.fullText = conv.messages.map(m => `${m.actorKind}: ${m.text}`).join('\n');
    conv.customerText = conv.customerMessages.map(m => m.text).join('\n');
  }

  return byId;
}

function conversationSummary(conv) {
  if (!conv) return '';
  return [
    `Tổng tin: ${conv.counts.total}`,
    `Khách: ${conv.counts.customer || 0}`,
    `Bot: ${conv.counts.bot || 0}`,
    `Admin: ${conv.counts.admin || 0}`,
    `Từ: ${conv.firstMessageAt || 'unknown'}`,
    `Đến: ${conv.lastMessageAt || 'unknown'}`
  ].join(' | ');
}

module.exports = {
  getMessageText,
  getMessageTime,
  buildConversations,
  conversationSummary
};
