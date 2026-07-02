-- AIGUKA V6.1 Stable Lead Tracker
-- Bảng mới dùng prefix lt_ để tránh xung đột với bảng ad_phone_leads cũ đã bị vá nhiều phiên bản.

create table if not exists public.lt_ad_phone_leads (
  id bigserial primary key,
  lead_key text not null unique,
  ad_id text not null default 'unknown_ad',
  ad_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  sender_id text,
  customer_name text,
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
  lead_time timestamptz default now(),
  lead_source text not null default 'message_scan',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lt_ad_phone_leads add column if not exists lead_key text;
alter table public.lt_ad_phone_leads add column if not exists ad_id text default 'unknown_ad';
alter table public.lt_ad_phone_leads add column if not exists ad_name text;
alter table public.lt_ad_phone_leads add column if not exists campaign_id text;
alter table public.lt_ad_phone_leads add column if not exists campaign_name text;
alter table public.lt_ad_phone_leads add column if not exists adset_id text;
alter table public.lt_ad_phone_leads add column if not exists adset_name text;
alter table public.lt_ad_phone_leads add column if not exists sender_id text;
alter table public.lt_ad_phone_leads add column if not exists customer_name text;
alter table public.lt_ad_phone_leads add column if not exists conversation_id text;
alter table public.lt_ad_phone_leads add column if not exists conversation_url text;
alter table public.lt_ad_phone_leads add column if not exists phone text;
alter table public.lt_ad_phone_leads add column if not exists source_flag text default 'phone';
alter table public.lt_ad_phone_leads add column if not exists has_phone boolean default false;
alter table public.lt_ad_phone_leads add column if not exists has_zalo boolean default false;
alter table public.lt_ad_phone_leads add column if not exists evidence_message_id text;
alter table public.lt_ad_phone_leads add column if not exists evidence_text text;
alter table public.lt_ad_phone_leads add column if not exists evidence_raw jsonb default '{}'::jsonb;
alter table public.lt_ad_phone_leads add column if not exists message_time timestamptz;
alter table public.lt_ad_phone_leads add column if not exists lead_time timestamptz default now();
alter table public.lt_ad_phone_leads add column if not exists lead_source text default 'message_scan';
alter table public.lt_ad_phone_leads add column if not exists created_at timestamptz default now();
alter table public.lt_ad_phone_leads add column if not exists updated_at timestamptz default now();

create unique index if not exists lt_ad_phone_leads_lead_key_uidx on public.lt_ad_phone_leads(lead_key);
create index if not exists lt_ad_phone_leads_ad_id_idx on public.lt_ad_phone_leads(ad_id);
create index if not exists lt_ad_phone_leads_phone_idx on public.lt_ad_phone_leads(phone);
create index if not exists lt_ad_phone_leads_conversation_idx on public.lt_ad_phone_leads(conversation_id);
create index if not exists lt_ad_phone_leads_message_time_idx on public.lt_ad_phone_leads(message_time desc);

create table if not exists public.lt_lead_messages (
  id bigserial primary key,
  message_id text not null unique,
  conversation_id text,
  sender_id text,
  role text,
  text text,
  ad_id text,
  message_time timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists lt_lead_messages_message_id_uidx on public.lt_lead_messages(message_id);
create index if not exists lt_lead_messages_conversation_idx on public.lt_lead_messages(conversation_id);
create index if not exists lt_lead_messages_ad_id_idx on public.lt_lead_messages(ad_id);

create table if not exists public.lt_conversation_evidence (
  id bigserial primary key,
  conversation_id text not null unique,
  sender_id text,
  customer_name text,
  ad_id text,
  ad_name text,
  first_message_time timestamptz,
  last_message_time timestamptz,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lt_conversation_evidence_conversation_uidx on public.lt_conversation_evidence(conversation_id);
create index if not exists lt_conversation_evidence_ad_idx on public.lt_conversation_evidence(ad_id);

create table if not exists public.lt_sync_runs (
  id bigserial primary key,
  source text not null default 'message_scan',
  status text not null default 'running',
  params jsonb not null default '{}'::jsonb,
  messages_seen integer default 0,
  customer_messages integer default 0,
  leads_found integer default 0,
  leads_saved integer default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value, updated_at)
values ('lead_tracker_stable', jsonb_build_object('table','lt_ad_phone_leads','version','6.1-stable'), now())
on conflict(key) do update set value = excluded.value, updated_at = now();

-- Reload PostgREST schema cache where possible.
notify pgrst, 'reload schema';
