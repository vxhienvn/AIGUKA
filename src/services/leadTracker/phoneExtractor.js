'use strict';

// AIGUKA Lead Tracker Core
// Nguồn dữ liệu: public.messages. File này chỉ nhận diện/chuẩn hóa tín hiệu liên hệ,
// không đọc Meta/Pancake/Dashboard.

const DEFAULT_EXCLUDED_PHONES = new Set([
    // Hotline showroom thường xuất hiện trong tin bot/page, không được tính là lead khách.
    '0973693677'
]);

function normalizeDigits(value = '') {
    return String(value || '').replace(/[^0-9+]/g, '');
}

function normalizeVietnamPhone(raw = '') {
    let s = normalizeDigits(raw);
    if (!s) return null;

    if (s.startsWith('+84')) s = `0${s.slice(3)}`;
    else if (s.startsWith('84') && s.length === 11) s = `0${s.slice(2)}`;

    s = s.replace(/[^0-9]/g, '');

    // Mobile VN phổ biến: 03,05,07,08,09 + 8 số.
    if (/^0(3|5|7|8|9)\d{8}$/.test(s)) return s;

    return null;
}

function hasZaloSignal(text = '') {
    const value = String(text || '').toLowerCase();
    return /\b(zalo|za\s*lo|zl|z\.l|zalo\s*em|zalo\s*anh|zalo\s*chị)\b/i.test(value);
}

function hasContactIntentSignal(text = '') {
    const value = String(text || '').toLowerCase();
    return /(sđt|sdt|số điện thoại|so dien thoai|số em|số anh|số chị|gọi|goi|call|liên hệ|lien he|zalo|za\s*lo|zl)/i.test(value);
}

function getExcludedPhones() {
    const env = String(process.env.LEAD_TRACKER_EXCLUDE_PHONES || '').trim();
    const set = new Set(DEFAULT_EXCLUDED_PHONES);
    if (env) {
        env.split(',').map(x => normalizeVietnamPhone(x.trim())).filter(Boolean).forEach(x => set.add(x));
    }
    return set;
}

function extractPhones(text = '', options = {}) {
    const value = String(text || '');
    const excluded = options.excludedPhones || getExcludedPhones();

    // Bắt các dạng: 0985123456, 0985 123 456, 0985.123.456, +84985123456, 84 985 123 456.
    const pattern = /(?:\+?84|0)(?:[\s.\-()]*\d){8,10}/g;
    const matches = value.match(pattern) || [];

    const found = [];
    const seen = new Set();
    for (const raw of matches) {
        const normalized = normalizeVietnamPhone(raw);
        if (!normalized) continue;
        if (excluded.has(normalized)) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        found.push({ raw: String(raw).trim(), normalized });
    }
    return found;
}

function analyzeContactText(text = '', options = {}) {
    const phones = extractPhones(text, options);
    const zaloSignal = hasZaloSignal(text);
    const contactIntent = hasContactIntentSignal(text);

    return {
        phones,
        hasPhone: phones.length > 0,
        hasZaloSignal: zaloSignal,
        hasContactIntentSignal: contactIntent,
        contactType: phones.length && zaloSignal ? 'both' : phones.length ? 'phone' : zaloSignal ? 'zalo' : 'unknown'
    };
}

module.exports = {
    normalizeVietnamPhone,
    extractPhones,
    hasZaloSignal,
    hasContactIntentSignal,
    analyzeContactText
};
