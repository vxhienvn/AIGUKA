'use strict';

function supabaseReady() {
    const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
    return Boolean(url && key && String(process.env.SUPABASE_ENABLED || 'false').toLowerCase() === 'true');
}

function supabaseConfig() {
    return {
        url: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
        key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
    };
}

async function supabaseRest(pathname, options = {}) {
    const { url, key } = supabaseConfig();
    if (!url || !key) {
        throw new Error('Supabase chưa cấu hình: thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
    }

    const response = await fetch(`${url}/rest/v1/${pathname}`, {
        ...options,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
            ...(options.headers || {})
        }
    });

    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }

    if (!response.ok) {
        throw new Error(`Supabase ${pathname} failed ${response.status}: ${raw}`);
    }
    return data;
}

async function supabaseRpc(functionName, payload = {}) {
    const { url, key } = supabaseConfig();
    if (!url || !key) throw new Error('Supabase chưa cấu hình');

    const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload || {})
    });

    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
    if (!response.ok) throw new Error(`Supabase rpc/${functionName} failed ${response.status}: ${raw}`);
    return data;
}

module.exports = {
    supabaseReady,
    supabaseRest,
    supabaseRpc
};
