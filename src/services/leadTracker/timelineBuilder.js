'use strict';

const { extractPhonesFromMessage, actorKind } = require('./phoneExtractor');

function eventTypeForMessage(message, extraction) {
  const kind = message.actorKind || actorKind(message.role, message.source);
  if (extraction && extraction.candidates && extraction.candidates.length > 0) return 'phone_shared';
  if (kind === 'admin') return 'admin_message';
  if (kind === 'bot') return 'bot_message';
  if (kind === 'customer') return 'customer_message';
  if (kind === 'system') return 'system_message';
  if (kind === 'page') return 'page_message';
  return 'message';
}

function buildTimelineEvents(conv, options = {}) {
  const events = [];
  if (!conv || !Array.isArray(conv.messages)) return events;
  for (const msg of conv.messages) {
    const extraction = extractPhonesFromMessage({
      id: msg.id,
      conversation_id: msg.conversation_id,
      sender_id: msg.sender_id,
      role: msg.role,
      source: msg.source,
      text: msg.text,
      created_at: msg.created_at
    }, options);
    events.push({
      conversation_id: conv.conversation_id,
      event_type: eventTypeForMessage(msg, extraction),
      event_time: msg.created_at || null,
      actor_role: msg.role || null,
      actor_source: msg.source || null,
      actor_kind: msg.actorKind || actorKind(msg.role, msg.source),
      message_id: msg.id || null,
      event_text: msg.text || '',
      extraction
    });
  }
  return events;
}

module.exports = {
  buildTimelineEvents
};
