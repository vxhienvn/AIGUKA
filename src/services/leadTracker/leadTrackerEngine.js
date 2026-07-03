'use strict';

const { analyzeContactText } = require('./phoneExtractor');
const { supabaseReady, supabaseRest, supabaseRpc } = require('./supabaseLtClient');

const CUSTOMER_ROLES = new Set(['customer', 'user', 'messenger_graph_customer']);

function isCustomerMessage(message = {}) {
    const role = String(message.role || '').toLowerCase();
    if (CUSTOMER_ROLES.has(role)) return true;
    // Một số dữ liệu cũ có source customer nhưng role rỗng.
    const source = String(message.source || '').toLowerCase();
    return !role && source.includes('customer');
}

function messageText(message = {}) {
    return String(message.text || message.message_text || message.content || '').trim();
}

function messageTime(message = {}) {
    return message.created_at || message.message_time || message.timestamp || null;
}

function messageId(message = {}) {
    return String(message.id || message.message_id || message.external_message_id || '');
}

function pickAdFields(message = {}) {
    return {
        ad_id: message.ad_id || null,
        ad_name: message.ad_name || null,
        adset_id: message.adset_id || null,
        adset_name: message.adset_name || null,
        campaign_id: message.campaign_id || null,
        campaign_name: message.campaign_name || null
    };
}

function compactRawMessage(message = {}) {
    return {
        id: message.id || null,
        conversation_id: message.conversation_id || null,
        sender_id: message.sender_id || null,
        customer_id: message.customer_id || null,
        role: message.role || null,
        source: message.source || null,
        product_group: message.product_group || null,
        intent: message.intent || null,
        created_at: message.created_at || null,
        ad_id: message.ad_id || null,
        post_id: message.post_id || null
    };
}

async function fetchMessages({ limit = 5000, since = null, until = null } = {}) {
    if (!supabaseReady()) throw new Error('SUPABASE_ENABLED=true và SUPABASE_URL/SERVICE_ROLE_KEY là bắt buộc');

    const safeLimit = Math.min(Math.max(Number(limit) || 5000, 1), 20000);
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'created_at.asc');
    params.set('limit', String(safeLimit));
    if (since) params.set('created_at', `gte.${since}`);
    if (until) {
        // PostgREST không hỗ trợ 2 filter cùng key qua URLSearchParams append nếu set ghi đè.
        params.append('created_at', `lte.${until}`);
    }

    return await supabaseRest(`messages?${params.toString()}`, { method: 'GET' });
}

function buildLeadCandidates(messages = []) {
    const stats = {
        messagesScanned: messages.length,
        customerMessages: 0,
        messagesWithPhone: 0,
        phonesFound: 0,
        uniquePhones: 0,
        uniqueLeadKeys: 0,
        uniqueConversations: 0,
        duplicates: 0,
        ignoredMessages: 0
    };

    const leads = new Map();
    const uniquePhones = new Set();
    const conversations = new Set();

    for (const msg of messages) {
        if (!isCustomerMessage(msg)) {
            stats.ignoredMessages += 1;
            continue;
        }
        stats.customerMessages += 1;

        const text = messageText(msg);
        if (!text) continue;

        const contact = analyzeContactText(text);
        if (!contact.hasPhone) continue;

        stats.messagesWithPhone += 1;
        stats.phonesFound += contact.phones.length;

        const conversationId = String(msg.conversation_id || 'unknown_conversation');
        const senderId = msg.sender_id ? String(msg.sender_id) : null;
        conversations.add(conversationId);

        for (const phone of contact.phones) {
            uniquePhones.add(phone.normalized);
            const leadKey = `${conversationId}|${phone.normalized}`;
            const existing = leads.get(leadKey);
            if (existing) {
                stats.duplicates += 1;
                existing.evidenceMessages.push({ msg, text, phone, contact });
                existing.last_message_at = messageTime(msg) || existing.last_message_at;
                continue;
            }

            const adFields = pickAdFields(msg);
            leads.set(leadKey, {
                lead_key: leadKey,
                conversation_id: conversationId,
                sender_id: senderId,
                customer_id: msg.customer_id || null,
                customer_name: msg.customer_name || msg.name || null,
                phone: phone.raw,
                phone_normalized: phone.normalized,
                zalo: contact.hasZaloSignal ? phone.normalized : null,
                contact_type: contact.hasZaloSignal ? 'both' : 'phone',
                lead_level: 1,
                verified: true,
                confidence: contact.hasContactIntentSignal ? 100 : 95,
                phone_message_id: messageId(msg) || null,
                phone_message_text: text,
                phone_detected_at: messageTime(msg),
                first_message_at: messageTime(msg),
                last_message_at: messageTime(msg),
                ...adFields,
                lead_source: 'messages_rescan',
                source_table: 'messages',
                status: 'active',
                raw: {
                    first_evidence: compactRawMessage(msg),
                    source_note: 'Lead sinh trực tiếp từ bảng messages, không đọc Meta/Pancake/Dashboard.'
                },
                evidenceMessages: [{ msg, text, phone, contact }]
            });
        }
    }

    stats.uniquePhones = uniquePhones.size;
    stats.uniqueLeadKeys = leads.size;
    stats.uniqueConversations = conversations.size;

    return { stats, leads: Array.from(leads.values()) };
}

function publicLeadPreview(lead) {
    return {
        lead_key: lead.lead_key,
        conversation_id: lead.conversation_id,
        sender_id: lead.sender_id,
        customer_name: lead.customer_name,
        phone: lead.phone_normalized,
        zalo: lead.zalo,
        contact_type: lead.contact_type,
        confidence: lead.confidence,
        phone_detected_at: lead.phone_detected_at,
        phone_message_text: lead.phone_message_text,
        ad_id: lead.ad_id,
        ad_name: lead.ad_name,
        campaign_id: lead.campaign_id,
        campaign_name: lead.campaign_name,
        evidence_count: lead.evidenceMessages.length
    };
}

async function analyzeMessages(options = {}) {
    const messages = await fetchMessages(options);
    const { stats, leads } = buildLeadCandidates(messages);
    return {
        ok: true,
        source: 'messages',
        mode: 'analyze_only_no_write',
        stats,
        leads: leads.map(publicLeadPreview)
    };
}

async function createSyncRun() {
    const rows = await supabaseRest('lt_sync_runs', {
        method: 'POST',
        body: JSON.stringify({
            sync_type: 'messages_rescan',
            source_table: 'messages',
            status: 'running',
            started_at: new Date().toISOString()
        })
    });
    return Array.isArray(rows) ? rows[0] : rows;
}

async function finishSyncRun(id, patch) {
    if (!id) return null;
    const rows = await supabaseRest(`lt_sync_runs?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...patch, finished_at: new Date().toISOString() })
    });
    return Array.isArray(rows) ? rows[0] : rows;
}

async function clearLeadTrackerTables() {
    try {
        await supabaseRpc('lt_clear_all', {});
        return { ok: true, method: 'rpc_lt_clear_all' };
    } catch (error) {
        // Fallback nếu function chưa có hoặc schema cache chưa reload.
        await supabaseRest('lt_evidence?id=not.is.null', { method: 'DELETE' });
        await supabaseRest('lt_lead_messages?id=not.is.null', { method: 'DELETE' });
        await supabaseRest('lt_leads?id=not.is.null', { method: 'DELETE' });
        return { ok: true, method: 'delete_fallback', warning: error.message };
    }
}

async function rescanMessages(options = {}) {
    const syncRun = await createSyncRun();
    const syncRunId = syncRun?.id;

    try {
        const messages = await fetchMessages(options);
        const { stats, leads } = buildLeadCandidates(messages);

        if (options.clear !== false) await clearLeadTrackerTables();

        let leadsCreated = 0;
        let evidenceCreated = 0;

        for (const lead of leads) {
            const { evidenceMessages, ...leadRowBase } = lead;
            const leadRow = { ...leadRowBase, sync_run_id: syncRunId };

            const inserted = await supabaseRest('lt_leads?on_conflict=lead_key', {
                method: 'POST',
                headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
                body: JSON.stringify(leadRow)
            });
            const savedLead = Array.isArray(inserted) ? inserted[0] : inserted;
            if (!savedLead?.id) continue;
            leadsCreated += 1;

            const messageRows = [];
            const evidenceRows = [];
            for (const ev of evidenceMessages) {
                const msg = ev.msg;
                const msgId = messageId(msg) || `${lead.lead_key}|${messageTime(msg) || ''}`;
                messageRows.push({
                    lead_id: savedLead.id,
                    message_id: msgId,
                    conversation_id: lead.conversation_id,
                    sender_id: msg.sender_id ? String(msg.sender_id) : lead.sender_id,
                    role: msg.role || null,
                    message_text: ev.text,
                    message_time: messageTime(msg),
                    contains_phone: true,
                    contains_zalo: Boolean(ev.contact.hasZaloSignal),
                    matched_phone: ev.phone.normalized,
                    matched_zalo: ev.contact.hasZaloSignal ? ev.phone.normalized : null,
                    raw: compactRawMessage(msg)
                });

                evidenceRows.push({
                    lead_id: savedLead.id,
                    evidence_type: ev.contact.hasZaloSignal ? 'both' : 'phone',
                    evidence_source: 'messages',
                    message_id: msgId,
                    conversation_id: lead.conversation_id,
                    sender_id: msg.sender_id ? String(msg.sender_id) : lead.sender_id,
                    matched_text: ev.phone.raw,
                    evidence_text: ev.text,
                    evidence_time: messageTime(msg),
                    confidence: ev.contact.hasContactIntentSignal ? 100 : 95,
                    raw: compactRawMessage(msg)
                });
            }

            if (messageRows.length) {
                await supabaseRest('lt_lead_messages?on_conflict=lead_id,message_id', {
                    method: 'POST',
                    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
                    body: JSON.stringify(messageRows)
                });
            }
            if (evidenceRows.length) {
                await supabaseRest('lt_evidence', {
                    method: 'POST',
                    body: JSON.stringify(evidenceRows)
                });
                evidenceCreated += evidenceRows.length;
            }
        }

        await finishSyncRun(syncRunId, {
            status: 'success',
            messages_scanned: stats.messagesScanned,
            conversations_scanned: stats.uniqueConversations,
            leads_created: leadsCreated,
            leads_updated: 0,
            evidence_created: evidenceCreated,
            meta: stats
        });

        return {
            ok: true,
            source: 'messages',
            sync_run_id: syncRunId,
            stats: { ...stats, leadsCreated, evidenceCreated },
            leads: leads.map(publicLeadPreview)
        };
    } catch (error) {
        await finishSyncRun(syncRunId, { status: 'error', error_message: error.message }).catch(() => null);
        throw error;
    }
}

async function getSummary() {
    const rows = await supabaseRest('v_lt_lead_summary?select=*', { method: 'GET' });
    return Array.isArray(rows) ? rows[0] || {} : rows;
}

async function listLeads({ limit = 100, offset = 0, since = null, until = null } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('status', 'eq.active');
    params.set('order', 'phone_detected_at.desc');
    params.set('limit', String(safeLimit));
    params.set('offset', String(safeOffset));
    if (since) params.append('phone_detected_at', `gte.${since}`);
    if (until) params.append('phone_detected_at', `lte.${until}`);
    return await supabaseRest(`lt_leads?${params.toString()}`, { method: 'GET' });
}

async function getLeadDetail(leadId) {
    const leads = await supabaseRest(`lt_leads?id=eq.${encodeURIComponent(leadId)}&select=*`, { method: 'GET' });
    const lead = Array.isArray(leads) ? leads[0] : null;
    if (!lead) return null;
    const evidence = await supabaseRest(`lt_evidence?lead_id=eq.${encodeURIComponent(leadId)}&select=*&order=evidence_time.asc`, { method: 'GET' });
    const leadMessages = await supabaseRest(`lt_lead_messages?lead_id=eq.${encodeURIComponent(leadId)}&select=*&order=message_time.asc`, { method: 'GET' });
    const timeline = lead.conversation_id
        ? await supabaseRest(`messages?conversation_id=eq.${encodeURIComponent(lead.conversation_id)}&select=*&order=created_at.asc&limit=300`, { method: 'GET' })
        : [];
    return { lead, evidence, leadMessages, timeline };
}

async function debugPhone(phone) {
    const normalized = require('./phoneExtractor').normalizeVietnamPhone(phone);
    if (!normalized) return { ok: false, error: 'Số điện thoại không hợp lệ hoặc không chuẩn VN', input: phone };
    const leads = await supabaseRest(`lt_leads?phone_normalized=eq.${encodeURIComponent(normalized)}&select=*&order=phone_detected_at.desc`, { method: 'GET' });
    return { ok: true, phone: normalized, count: Array.isArray(leads) ? leads.length : 0, leads };
}

module.exports = {
    analyzeMessages,
    rescanMessages,
    getSummary,
    listLeads,
    getLeadDetail,
    debugPhone,
    buildLeadCandidates
};
