const config = require("../config");

const PANCAKE_PAGE_ID = config.PANCAKE_PAGE_ID;
const PANCAKE_PAGE_ACCESS_TOKEN = config.PANCAKE_PAGE_ACCESS_TOKEN;

function pancakeCleanHtml(html = "") {
    return String(html)
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

function pancakeGetTagNames(conv) {
    if (!Array.isArray(conv.tags)) return [];
    return conv.tags
        .filter(Boolean)
        .map(tag => tag.text)
        .filter(Boolean);
}

function pancakeGetPhones(conv) {
    if (!Array.isArray(conv.recent_phone_numbers)) return [];

    return conv.recent_phone_numbers
        .map(item => item.phone_number || item.captured)
        .filter(Boolean);
}

function pancakeClassifyProduct(text = "") {
    const t = String(text).toLowerCase();

    if (
        t.includes("quạt") ||
        t.includes("quat") ||
        t.includes("guka") ||
        t.includes("cánh") ||
        t.includes("canh") ||
        t.includes("động cơ") ||
        t.includes("dong co")
    ) {
        return "Quạt";
    }

    if (
        t.includes("bồn cầu") ||
        t.includes("bon cau") ||
        t.includes("thiết bị vệ sinh") ||
        t.includes("thiet bi ve sinh") ||
        t.includes("sen") ||
        t.includes("lavabo") ||
        t.includes("vòi") ||
        t.includes("voi") ||
        t.includes("chậu rửa") ||
        t.includes("chau rua")
    ) {
        return "Thiết bị vệ sinh";
    }

    if (
        t.includes("bếp") ||
        t.includes("bep") ||
        t.includes("hút mùi") ||
        t.includes("hut mui") ||
        t.includes("chậu rửa bát") ||
        t.includes("chau rua bat")
    ) {
        return "Bếp";
    }

    if (t.includes("bồn tắm") || t.includes("bon tam")) {
        return "Bồn tắm";
    }

    if (
        t.includes("combo") ||
        t.includes("phòng tắm") ||
        t.includes("phong tam") ||
        t.includes("nhà tắm") ||
        t.includes("nha tam")
    ) {
        return "Combo phòng tắm";
    }

    return "Khác";
}

function pancakeIsHotLead(conv) {
    const text = String(conv.snippet || "").toLowerCase();

    return (
        text.includes("giá") ||
        text.includes("gia") ||
        text.includes("bao nhiêu") ||
        text.includes("bao nhieu") ||
        text.includes("địa chỉ") ||
        text.includes("dia chi") ||
        text.includes("mua") ||
        text.includes("lắp") ||
        text.includes("lap") ||
        text.includes("còn hàng") ||
        text.includes("con hang") ||
        text.includes("xem mẫu") ||
        text.includes("xem mau") ||
        text.includes("gửi mẫu") ||
        text.includes("gui mau") ||
        text.includes("xin mẫu") ||
        text.includes("xin mau")
    );
}

function pancakeBuildCustomerRow(conv) {
    const tags = pancakeGetTagNames(conv);
    const phones = pancakeGetPhones(conv);
    const snippet = pancakeCleanHtml(conv.snippet || "");
    const product = pancakeClassifyProduct(snippet);

    return {
        name: conv.from?.name || "Không rõ tên",
        conversation_id: conv.id,
        type: conv.type,
        updated_at: conv.updated_at,
        message_count: conv.message_count || 0,
        has_phone: Boolean(conv.has_phone),
        phones,
        product,
        hot_lead: pancakeIsHotLead(conv),
        tags,
        snippet,
        ad_ids: conv.ad_ids || []
    };
}

async function pancakeFetchConversations(limit) {
    if (!PANCAKE_PAGE_ID || !PANCAKE_PAGE_ACCESS_TOKEN) {
        throw new Error("Thiếu PANCAKE_PAGE_ID hoặc PANCAKE_PAGE_ACCESS_TOKEN trong Render Environment");
    }

    const targetLimit = Math.min(Math.max(Number(limit) || 300, 1), 500);
    const allConversations = [];
    const seenIds = new Set();

    let lastConversationId = null;
    let safetyCounter = 0;

    while (allConversations.length < targetLimit && safetyCounter < 10) {
        safetyCounter++;

        let url =
            `https://pages.fm/api/public_api/v2/pages/${PANCAKE_PAGE_ID}/conversations` +
            `?page_access_token=${encodeURIComponent(PANCAKE_PAGE_ACCESS_TOKEN)}`;

        if (lastConversationId) {
            url += `&last_conversation_id=${encodeURIComponent(lastConversationId)}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) {
            throw new Error(`Pancake API lỗi: ${JSON.stringify(data)}`);
        }

        const batch = Array.isArray(data.conversations) ? data.conversations : [];

        if (batch.length === 0) {
            break;
        }

        for (const conv of batch) {
            if (!conv || !conv.id) continue;
            if (seenIds.has(conv.id)) continue;

            seenIds.add(conv.id);
            allConversations.push(conv);

            if (allConversations.length >= targetLimit) {
                break;
            }
        }

        const lastItem = batch[batch.length - 1];
        if (!lastItem || !lastItem.id || lastItem.id === lastConversationId) {
            break;
        }

        lastConversationId = lastItem.id;

        if (batch.length < 60) {
            break;
        }
    }

    return allConversations.slice(0, targetLimit);
}

function pancakeVietnamDateString(date = new Date()) {
    const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return vn.toISOString().slice(0, 10);
}

function pancakeConversationDateString(updatedAt) {
    if (!updatedAt) return "";
    const d = new Date(updatedAt);
    if (Number.isNaN(d.getTime())) {
        return String(updatedAt).slice(0, 10);
    }
    return pancakeVietnamDateString(d);
}

function pancakeReviewFilterRows(rows, type) {
    const t = String(type || "all").toLowerCase();

    if (t === "hot") {
        return rows.filter(x => x.hot_lead && !x.has_phone);
    }

    if (t === "no-phone" || t === "no_phone") {
        return rows.filter(x => !x.has_phone);
    }

    if (t === "phone" || t === "has-phone" || t === "has_phone") {
        return rows.filter(x => x.has_phone);
    }

    if (t === "zalo") {
        return rows.filter(x => x.tags.includes("Zalo"));
    }

    if (t === "called" || t === "da-goi" || t === "đã-gọi") {
        return rows.filter(x => x.tags.includes("Đã Gọi"));
    }

    if (t === "no-called" || t === "chua-goi" || t === "chưa-gọi") {
        return rows.filter(x => !x.tags.includes("Đã Gọi"));
    }

    return rows;
}

function pancakeReviewTypeLabel(type) {
    const t = String(type || "all").toLowerCase();

    if (t === "hot") return "Khách nóng chưa có số";
    if (t === "no-phone" || t === "no_phone") return "Khách chưa có số";
    if (t === "phone" || t === "has-phone" || t === "has_phone") return "Khách đã có số";
    if (t === "zalo") return "Khách có tag Zalo";
    if (t === "called" || t === "da-goi" || t === "đã-gọi") return "Khách đã gọi";
    if (t === "no-called" || t === "chua-goi" || t === "chưa-gọi") return "Khách chưa gọi";

    return "Tất cả hội thoại hôm nay";
}

module.exports = {
    PANCAKE_PAGE_ID,
    PANCAKE_PAGE_ACCESS_TOKEN,
    pancakeCleanHtml,
    pancakeGetTagNames,
    pancakeGetPhones,
    pancakeClassifyProduct,
    pancakeIsHotLead,
    pancakeBuildCustomerRow,
    pancakeFetchConversations,
    pancakeVietnamDateString,
    pancakeConversationDateString,
    pancakeReviewFilterRows,
    pancakeReviewTypeLabel
};
