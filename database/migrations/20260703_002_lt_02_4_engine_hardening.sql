-- =====================================================
-- AIGUKA V6.1 - Lead Tracker Core LT-02.4
-- Engine hardening: blacklist, scan stats, timeline, lead_score.
-- Chỉ thêm bảng/cột lt_*; không đụng Dashboard cũ, Meta, Pancake, ad_phone_leads.
-- =====================================================

create extension if not exists pgcrypto;

-- 1) Lead score: điểm chất lượng lead nội bộ 0-100.
alter table public.lt_leads
add column if not exists lead_score numeric(5,2) default 95;

-- 2) Blacklist số nội bộ/hotline/sale/test.
create table if not exists public.lt_phone_blacklist (
    id uuid primary key default gen_random_uuid(),
    phone text not null,
    phone_normalized text not null unique,
    type text not null default 'manual', -- hotline | sale | test | manual | deleted
    label text,
    note text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_lt_phone_blacklist_active
on public.lt_phone_blacklist(is_active);

insert into public.lt_phone_blacklist (phone, phone_normalized, type, label, note, is_active)
values ('0973693677', '0973693677', 'hotline', 'Hotline Ánh Dương', 'Số nội bộ không tính là lead khách hàng', true)
on conflict (phone_normalized) do update set
    type = excluded.type,
    label = excluded.label,
    note = excluded.note,
    is_active = true,
    updated_at = now();

-- 3) Scan statistics: lưu kết quả rescan để so sánh mỗi lần chỉnh engine/regex.
create table if not exists public.lt_scan_statistics (
    id uuid primary key default gen_random_uuid(),
    sync_run_id uuid references public.lt_sync_runs(id) on delete set null,
    status text not null default 'success',

    messages_scanned integer not null default 0,
    customer_messages integer not null default 0,
    regex_hits integer not null default 0,
    phones_found integer not null default 0,
    unique_phones integer not null default 0,
    unique_lead_keys integer not null default 0,
    unique_conversations integer not null default 0,
    duplicates integer not null default 0,

    rejected jsonb not null default '{}'::jsonb,
    rejected_by_actor jsonb not null default '{}'::jsonb,
    rejected_by_source jsonb not null default '{}'::jsonb,
    accepted_by_source jsonb not null default '{}'::jsonb,

    duration_ms integer,
    error_message text,
    created_at timestamptz not null default now()
);

create index if not exists idx_lt_scan_statistics_created_at
on public.lt_scan_statistics(created_at desc);

create index if not exists idx_lt_scan_statistics_sync_run
on public.lt_scan_statistics(sync_run_id);

-- 4) Timeline events: lịch sử sự kiện quan trọng của lead.
create table if not exists public.lt_timeline_events (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid references public.lt_leads(id) on delete cascade,
    conversation_id text not null,
    event_type text not null, -- lead_detected | sale_status | note | system
    event_time timestamptz,
    actor_role text,
    actor_source text,
    message_id text,
    event_text text,
    raw jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_lt_timeline_lead
on public.lt_timeline_events(lead_id);

create index if not exists idx_lt_timeline_conversation
on public.lt_timeline_events(conversation_id);

create index if not exists idx_lt_timeline_time
on public.lt_timeline_events(event_time desc);

-- 5) Updated_at trigger cho blacklist.
create or replace function public.lt_set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lt_phone_blacklist_updated_at on public.lt_phone_blacklist;
create trigger trg_lt_phone_blacklist_updated_at
before update on public.lt_phone_blacklist
for each row execute function public.lt_set_updated_at();

-- 6) Cập nhật hàm clear để chỉ rebuild dữ liệu Lead Tracker sinh ra, không xóa blacklist/stats.
create or replace function public.lt_clear_all()
returns void as $$
begin
    truncate table public.lt_evidence restart identity cascade;
    truncate table public.lt_lead_messages restart identity cascade;
    truncate table public.lt_timeline_events restart identity cascade;
    truncate table public.lt_leads restart identity cascade;
    truncate table public.lt_dashboard_cache restart identity cascade;
end;
$$ language plpgsql;

-- 7) Reload PostgREST schema cache.
notify pgrst, 'reload schema';
