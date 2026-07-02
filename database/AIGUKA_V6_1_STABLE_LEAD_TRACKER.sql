-- AIGUKA V6.1 Stable Lead Tracker Schema
-- Chạy một lần trong Supabase SQL Editor.
-- Mục tiêu: tạo schema ổn định, không còn lỗi thiếu cột/constraint khi dùng /lead-tracker.

begin;

create extension if not exists pgcrypto;

-- Backup nhẹ schema cũ nếu bảng đã tồn tại. Không xóa dữ liệu cũ.
create table if not exists public.ad_phone_leads_backup_before_v6_1 as
select * from public.ad_phone_leads where false;

do $$
begin
  if to_regclass('public.ad_phone_leads') is not null then
    insert into public.ad_phone_leads_backup_before_v6_1
    select * from public.ad_phone_leads
    on conflict do nothing;
  end if;
exception when others then
  raise notice 'Skip backup: %', sqlerrm;
end $$;

-- Gỡ các check constraint cũ gây lỗi phone/source_flag.
do $$
declare r record;
begin
  if to_regclass('public.ad_phone_leads') is not null then
    for r in
      select conname
      from pg_constraint
      where conrelid = 'public.ad_phone_leads'::regclass
        and contype = 'c'
    loop
      execute format('alter table public.ad_phone_leads drop constraint if exists %I', r.conname);
    end loop;
  end if;
end $$;

create table if not exists public.ad_phone_leads (
  id uuid primary key default gen_random_uuid(),
  lead_key text unique not null,
  ad_id text not null default 'unknown_ad',
  ad_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  sender_id text,
  customer_name text,
  customer_profile_url text,
  conversation_id text,
  conversation_url text,
  phone text,
  source_flag text not null default 'phone',
  has_phone boolean not null default false,
  has_zalo boolean not null default false,
  evidence_message_id text,
  evidence_text text,
  evidence_raw jsonb not null default '{}'::jsonb,
  message_time timestamptz,
  lead_time timestamptz,
  lead_source text not null default 'message_scan',
  pancake_flags jsonb not null default '{}'::jsonb,
  meta_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ad_phone_leads add column if not exists id uuid default gen_random_uuid();
alter table public.ad_phone_leads add column if not exists lead_key text;
alter table public.ad_phone_leads add column if not exists ad_id text default 'unknown_ad';
alter table public.ad_phone_leads add column if not exists ad_name text;
alter table public.ad_phone_leads add column if not exists campaign_id text;
alter table public.ad_phone_leads add column if not exists campaign_name text;
alter table public.ad_phone_leads add column if not exists adset_id text;
alter table public.ad_phone_leads add column if not exists adset_name text;
alter table public.ad_phone_leads add column if not exists sender_id text;
alter table public.ad_phone_leads add column if not exists customer_name text;
alter table public.ad_phone_leads add column if not exists customer_profile_url text;
alter table public.ad_phone_leads add column if not exists conversation_id text;
alter table public.ad_phone_leads add column if not exists conversation_url text;
alter table public.ad_phone_leads add column if not exists phone text;
alter table public.ad_phone_leads add column if not exists source_flag text default 'phone';
alter table public.ad_phone_leads add column if not exists has_phone boolean default false;
alter table public.ad_phone_leads add column if not exists has_zalo boolean default false;
alter table public.ad_phone_leads add column if not exists evidence_message_id text;
alter table public.ad_phone_leads add column if not exists evidence_text text;
alter table public.ad_phone_leads add column if not exists evidence_raw jsonb default '{}'::jsonb;
alter table public.ad_phone_leads add column if not exists message_time timestamptz;
alter table public.ad_phone_leads add column if not exists lead_time timestamptz;
alter table public.ad_phone_leads add column if not exists lead_source text default 'message_scan';
alter table public.ad_phone_leads add column if not exists pancake_flags jsonb default '{}'::jsonb;
alter table public.ad_phone_leads add column if not exists meta_flags jsonb default '{}'::jsonb;
alter table public.ad_phone_leads add column if not exists created_at timestamptz default now();
alter table public.ad_phone_leads add column if not exists updated_at timestamptz default now();

update public.ad_phone_leads
set
  ad_id = coalesce(nullif(ad_id,''), 'unknown_ad'),
  source_flag = coalesce(nullif(source_flag,''), case when phone is not null then 'phone' else 'zalo' end),
  has_phone = coalesce(has_phone, phone is not null),
  has_zalo = coalesce(has_zalo, source_flag in ('zalo','both')),
  message_time = coalesce(message_time, lead_time, created_at, now()),
  lead_time = coalesce(lead_time, message_time, created_at, now()),
  evidence_raw = coalesce(evidence_raw, '{}'::jsonb),
  pancake_flags = coalesce(pancake_flags, '{}'::jsonb),
  meta_flags = coalesce(meta_flags, '{}'::jsonb),
  lead_key = coalesce(nullif(lead_key,''), coalesce(nullif(ad_id,''),'unknown_ad') || '|' || coalesce(phone, sender_id, evidence_message_id, id::text))
where true;

alter table public.ad_phone_leads alter column lead_key set not null;
alter table public.ad_phone_leads alter column ad_id set default 'unknown_ad';
alter table public.ad_phone_leads alter column source_flag set default 'phone';
alter table public.ad_phone_leads alter column has_phone set default false;
alter table public.ad_phone_leads alter column has_zalo set default false;
alter table public.ad_phone_leads alter column evidence_raw set default '{}'::jsonb;
alter table public.ad_phone_leads alter column pancake_flags set default '{}'::jsonb;
alter table public.ad_phone_leads alter column meta_flags set default '{}'::jsonb;

create unique index if not exists ad_phone_leads_lead_key_uidx on public.ad_phone_leads(lead_key);
create index if not exists idx_ad_phone_leads_ad_id on public.ad_phone_leads(ad_id);
create index if not exists idx_ad_phone_leads_phone on public.ad_phone_leads(phone);
create index if not exists idx_ad_phone_leads_sender on public.ad_phone_leads(sender_id);
create index if not exists idx_ad_phone_leads_message_time on public.ad_phone_leads(message_time desc);
create index if not exists idx_ad_phone_leads_conversation on public.ad_phone_leads(conversation_id);

create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_key text,
  conversation_id text,
  sender_id text,
  role text,
  message_text text,
  message_time timestamptz,
  is_phone_message boolean default false,
  is_zalo_message boolean default false,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_lead_messages_lead_key on public.lead_messages(lead_key);
create index if not exists idx_lead_messages_conversation on public.lead_messages(conversation_id);

create table if not exists public.conversation_snapshots (
  id uuid primary key default gen_random_uuid(),
  conversation_id text unique not null,
  sender_id text,
  ad_id text,
  ad_name text,
  full_history_json jsonb default '[]'::jsonb,
  last_message_at timestamptz,
  last_synced_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.meta_evidence_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text default 'lead_tracker',
  status text default 'created',
  started_at timestamptz default now(),
  finished_at timestamptz,
  stats jsonb default '{}'::jsonb,
  error text
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create or replace function public.aiguka_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ad_phone_leads_updated_at on public.ad_phone_leads;
create trigger trg_ad_phone_leads_updated_at
before update on public.ad_phone_leads
for each row execute function public.aiguka_touch_updated_at();

drop trigger if exists trg_conversation_snapshots_updated_at on public.conversation_snapshots;
create trigger trg_conversation_snapshots_updated_at
before update on public.conversation_snapshots
for each row execute function public.aiguka_touch_updated_at();

commit;

-- Reload PostgREST schema cache.
notify pgrst, 'reload schema';
