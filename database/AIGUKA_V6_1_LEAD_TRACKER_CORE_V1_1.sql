-- =====================================================
-- AIGUKA V6.1 STABLE
-- Lead Tracker Core - Schema V1.1
-- Nguyên tắc:
--   1) Không xóa / không sửa bảng cũ.
--   2) Lead Tracker chỉ đọc dữ liệu gốc từ public.messages.
--   3) Kết quả sinh ra nằm trong namespace lt_*.
--   4) Có thể xóa lt_* và rebuild lại từ messages bất cứ lúc nào.
-- =====================================================

-- =====================================================
-- 0. Optional: extension
-- =====================================================
create extension if not exists pgcrypto;

-- =====================================================
-- 1. Sync runs
-- =====================================================
create table if not exists public.lt_sync_runs (
    id uuid primary key default gen_random_uuid(),
    sync_type text not null default 'messages_rescan',
    source_table text not null default 'messages',

    started_at timestamptz not null default now(),
    finished_at timestamptz,

    status text not null default 'running',
    messages_scanned integer not null default 0,
    conversations_scanned integer not null default 0,

    leads_created integer not null default 0,
    leads_updated integer not null default 0,
    evidence_created integer not null default 0,

    error_message text,
    meta jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now()
);

create index if not exists idx_lt_sync_runs_started_at
on public.lt_sync_runs(started_at desc);

create index if not exists idx_lt_sync_runs_status
on public.lt_sync_runs(status);


-- =====================================================
-- 2. Leads
-- 1 conversation có thể có nhiều phone/zalo, nhưng lead_key đảm bảo không trùng.
-- lead_key = conversation_id | phone/zalo/contact_key
-- =====================================================
create table if not exists public.lt_leads (
    id uuid primary key default gen_random_uuid(),

    lead_key text not null unique,

    conversation_id text not null,
    sender_id text,
    customer_id text,
    customer_name text,

    -- Contact signals
    phone text,
    phone_normalized text,
    zalo text,
    contact_type text not null default 'phone', -- phone | zalo | both | unknown

    -- Lead levels:
    -- L1 = Có SĐT/Zalo xác thực từ messages
    -- L2 = Sale đã tiếp nhận/gọi
    -- L3 = Đã hẹn
    -- L4 = Đã chốt/doanh thu
    lead_level smallint not null default 1,
    verified boolean not null default true,
    confidence numeric(5,2) not null default 100,

    -- Evidence shortcut for dashboard
    phone_message_id text,
    phone_message_text text,
    phone_detected_at timestamptz,

    first_message_at timestamptz,
    last_message_at timestamptz,

    -- Ad fields: phase 1 có thể null; phase sau Meta Browser Sync/Pancake bổ sung.
    ad_id text,
    ad_name text,
    adset_id text,
    adset_name text,
    campaign_id text,
    campaign_name text,

    -- Tracking
    lead_source text not null default 'messages_rescan',
    source_table text not null default 'messages',
    sync_run_id uuid references public.lt_sync_runs(id) on delete set null,

    status text not null default 'active', -- active | hidden | duplicate | invalid
    note text,

    raw jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_lt_leads_conversation_id
on public.lt_leads(conversation_id);

create index if not exists idx_lt_leads_sender_id
on public.lt_leads(sender_id);

create index if not exists idx_lt_leads_phone_normalized
on public.lt_leads(phone_normalized);

create index if not exists idx_lt_leads_phone_detected_at
on public.lt_leads(phone_detected_at desc);

create index if not exists idx_lt_leads_ad_id
on public.lt_leads(ad_id);

create index if not exists idx_lt_leads_status
on public.lt_leads(status);

create index if not exists idx_lt_leads_level
on public.lt_leads(lead_level);


-- =====================================================
-- 3. Lead Messages
-- Lưu các tin nhắn liên quan trực tiếp tới lead/evidence.
-- Không cần copy toàn bộ messages; lịch sử đầy đủ vẫn nằm ở public.messages.
-- =====================================================
create table if not exists public.lt_lead_messages (
    id uuid primary key default gen_random_uuid(),

    lead_id uuid not null references public.lt_leads(id) on delete cascade,

    message_id text,
    conversation_id text not null,
    sender_id text,
    role text,

    message_text text,
    message_time timestamptz,

    contains_phone boolean not null default false,
    contains_zalo boolean not null default false,

    matched_phone text,
    matched_zalo text,

    raw jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now()
);

create index if not exists idx_lt_lead_messages_lead_id
on public.lt_lead_messages(lead_id);

create index if not exists idx_lt_lead_messages_conversation_id
on public.lt_lead_messages(conversation_id);

create index if not exists idx_lt_lead_messages_message_time
on public.lt_lead_messages(message_time desc);

create unique index if not exists uq_lt_lead_messages_lead_message
on public.lt_lead_messages(lead_id, message_id);


-- =====================================================
-- 4. Evidence
-- Mọi KPI phải có bằng chứng truy ngược được.
-- =====================================================
create table if not exists public.lt_evidence (
    id uuid primary key default gen_random_uuid(),

    lead_id uuid not null references public.lt_leads(id) on delete cascade,

    evidence_type text not null, -- phone | zalo | both | manual | sale_status
    evidence_source text not null default 'messages',

    message_id text,
    conversation_id text not null,
    sender_id text,

    matched_text text,
    evidence_text text,
    evidence_time timestamptz,

    confidence numeric(5,2) not null default 100,

    raw jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now()
);

create index if not exists idx_lt_evidence_lead_id
on public.lt_evidence(lead_id);

create index if not exists idx_lt_evidence_conversation_id
on public.lt_evidence(conversation_id);

create index if not exists idx_lt_evidence_type
on public.lt_evidence(evidence_type);

create index if not exists idx_lt_evidence_time
on public.lt_evidence(evidence_time desc);


-- =====================================================
-- 5. Dashboard cache
-- Không bắt buộc dùng ngay, nhưng để sẵn cho dashboard nhanh hơn.
-- =====================================================
create table if not exists public.lt_dashboard_cache (
    cache_key text primary key,
    cache_value jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);


-- =====================================================
-- 6. Views
-- =====================================================

create or replace view public.v_lt_lead_summary as
select
    count(*) filter (where status = 'active') as total_leads,
    count(*) filter (where status = 'active' and phone_normalized is not null) as total_phone_leads,
    count(*) filter (where status = 'active' and zalo is not null) as total_zalo_leads,
    count(*) filter (where status = 'active' and lead_level >= 1) as l1_leads,
    count(*) filter (where status = 'active' and lead_level >= 2) as l2_leads,
    count(*) filter (where status = 'active' and lead_level >= 3) as l3_leads,
    count(*) filter (where status = 'active' and lead_level >= 4) as l4_leads,
    count(distinct conversation_id) filter (where status = 'active') as conversations_with_leads,
    min(phone_detected_at) as first_lead_at,
    max(phone_detected_at) as last_lead_at
from public.lt_leads;


create or replace view public.v_lt_ad_summary as
select
    coalesce(ad_id, 'unknown') as ad_id,
    coalesce(ad_name, 'Chưa rõ quảng cáo') as ad_name,
    coalesce(campaign_id, 'unknown') as campaign_id,
    coalesce(campaign_name, 'Chưa rõ chiến dịch') as campaign_name,

    count(*) filter (where status = 'active') as total_leads,
    count(*) filter (where status = 'active' and phone_normalized is not null) as phone_leads,
    count(*) filter (where status = 'active' and zalo is not null) as zalo_leads,
    count(distinct conversation_id) filter (where status = 'active') as conversations_with_leads,

    min(phone_detected_at) as first_lead_at,
    max(phone_detected_at) as last_lead_at
from public.lt_leads
group by
    coalesce(ad_id, 'unknown'),
    coalesce(ad_name, 'Chưa rõ quảng cáo'),
    coalesce(campaign_id, 'unknown'),
    coalesce(campaign_name, 'Chưa rõ chiến dịch');


create or replace view public.v_lt_lead_evidence as
select
    l.id as lead_id,
    l.lead_key,
    l.conversation_id,
    l.sender_id,
    l.customer_name,
    l.phone,
    l.phone_normalized,
    l.zalo,
    l.lead_level,
    l.verified,
    l.confidence,
    l.ad_id,
    l.ad_name,
    l.campaign_id,
    l.campaign_name,
    l.phone_detected_at,
    l.phone_message_text,
    e.id as evidence_id,
    e.evidence_type,
    e.message_id,
    e.matched_text,
    e.evidence_text,
    e.evidence_time
from public.lt_leads l
left join public.lt_evidence e on e.lead_id = l.id;


-- =====================================================
-- 7. Updated_at trigger
-- =====================================================

create or replace function public.lt_set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lt_leads_updated_at on public.lt_leads;

create trigger trg_lt_leads_updated_at
before update on public.lt_leads
for each row
execute function public.lt_set_updated_at();


-- =====================================================
-- 8. Optional helper: clear/rebuild lt_* safely
-- Chỉ xóa dữ liệu Lead Tracker mới, không đụng messages hay bảng cũ.
-- =====================================================

create or replace function public.lt_clear_all()
returns void as $$
begin
    truncate table public.lt_evidence restart identity cascade;
    truncate table public.lt_lead_messages restart identity cascade;
    truncate table public.lt_leads restart identity cascade;
    truncate table public.lt_dashboard_cache restart identity cascade;
end;
$$ language plpgsql;


-- =====================================================
-- DONE
-- =====================================================
