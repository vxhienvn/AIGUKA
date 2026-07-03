'use strict';

function clean(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  return s;
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    const v = clean(obj && obj[key]);
    if (v) return v;
  }
  return null;
}

function deepPick(obj, paths) {
  for (const path of paths) {
    const parts = path.split('.');
    let cur = obj;
    for (const part of parts) {
      if (!cur || typeof cur !== 'object') { cur = null; break; }
      cur = cur[part];
    }
    const v = clean(cur);
    if (v) return v;
  }
  return null;
}

const NAME_KEYS = [
  'customer_name', 'sender_name', 'display_name', 'name', 'full_name',
  'customer_full_name', 'profile_name', 'from_name', 'from', 'user_name',
  'username', 'page_customer_name', 'contact_name', 'fb_name'
];

const NESTED_NAME_PATHS = [
  'raw.customer_name', 'raw.sender_name', 'raw.display_name', 'raw.name',
  'raw.from.name', 'raw.user.name', 'raw.customer.name', 'raw.profile.name',
  'payload.customer_name', 'payload.sender_name', 'payload.from.name',
  'message.from.name', 'metadata.customer_name', 'metadata.sender_name'
];

function resolveNameFromRecord(row) {
  return pickFirst(row, NAME_KEYS) || deepPick(row, NESTED_NAME_PATHS);
}

function buildCustomerMapsFromRows(rows = []) {
  const bySender = new Map();
  const byCustomer = new Map();
  const byConversation = new Map();

  for (const row of rows || []) {
    const name = resolveNameFromRecord(row);
    if (!name) continue;
    const senderId = clean(row.sender_id || row.psid || row.fbid || row.user_id);
    const customerId = clean(row.customer_id || row.customerId || row.customer_uuid || row.customer);
    const conversationId = clean(row.conversation_id || row.thread_id || row.threadId);
    if (senderId && !bySender.has(senderId)) bySender.set(senderId, name);
    if (customerId && !byCustomer.has(customerId)) byCustomer.set(customerId, name);
    if (conversationId && !byConversation.has(conversationId)) byConversation.set(conversationId, name);
  }
  return { bySender, byCustomer, byConversation };
}

function mergeCustomerRecords(maps, records = [], source = 'customers') {
  for (const row of records || []) {
    const name = resolveNameFromRecord(row);
    if (!name) continue;
    const ids = [
      row.id, row.customer_id, row.customerId, row.sender_id, row.psid, row.fbid,
      row.user_id, row.facebook_id, row.profile_id, row.recipient_id
    ].map(clean).filter(Boolean);
    for (const id of ids) {
      if (!maps.bySender.has(id)) maps.bySender.set(id, name);
      if (!maps.byCustomer.has(id)) maps.byCustomer.set(id, name);
    }
    const conversationIds = [row.conversation_id, row.thread_id, row.threadId].map(clean).filter(Boolean);
    for (const cid of conversationIds) {
      if (!maps.byConversation.has(cid)) maps.byConversation.set(cid, name);
    }
  }
  return maps;
}

function resolveCustomerName(row, maps = {}) {
  const direct = resolveNameFromRecord(row);
  if (direct) return direct;

  const senderId = clean(row.sender_id || row.psid || row.fbid || row.user_id);
  const customerId = clean(row.customer_id || row.customerId || row.customer_uuid || row.customer);
  const conversationId = clean(row.conversation_id || row.thread_id || row.threadId);

  return (senderId && maps.bySender && maps.bySender.get(senderId))
    || (customerId && maps.byCustomer && maps.byCustomer.get(customerId))
    || (conversationId && maps.byConversation && maps.byConversation.get(conversationId))
    || senderId
    || customerId
    || conversationId
    || 'unknown_customer';
}

module.exports = {
  clean,
  pickFirst,
  resolveNameFromRecord,
  buildCustomerMapsFromRows,
  mergeCustomerRecords,
  resolveCustomerName
};
