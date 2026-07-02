-- AIGUKA V6.1 - Meta Evidence + Lead Tracker + persistent Sale Center config
-- Chạy toàn bộ trong Supabase SQL Editor trước khi deploy bản code mới.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists ad_phone_leads (
  id bigserial primary key,
  lead_key text unique not null,
  ad_id text not null default 'unknown_ad',
  ad_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  conversation_id text,
  sender_id text,
  page_id text,
  customer_name text,
  customer_profile_url text,
  conversation_url text,
  phone text,
  has_phone boolean not null default false,
  has_zalo boolean not null default false,
  source_flag text,
  evidence_message text,
  evidence_message_id text,
  message_time timestamptz,
  first_message text,
  last_message text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ad_phone_leads_ad_id on ad_phone_leads(ad_id);
create index if not exists idx_ad_phone_leads_phone on ad_phone_leads(phone);
create index if not exists idx_ad_phone_leads_message_time on ad_phone_leads(message_time desc);
create index if not exists idx_ad_phone_leads_sender_id on ad_phone_leads(sender_id);
create index if not exists idx_ad_phone_leads_conversation_id on ad_phone_leads(conversation_id);

create table if not exists lead_messages (
  id bigserial primary key,
  conversation_id text,
  sender_id text,
  role text,
  message_text text,
  message_time timestamptz,
  is_phone_message boolean not null default false,
  is_zalo_message boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_messages_conversation_id on lead_messages(conversation_id);
create index if not exists idx_lead_messages_time on lead_messages(message_time desc);

create table if not exists conversation_snapshots (
  id bigserial primary key,
  conversation_id text unique,
  sender_id text,
  page_id text,
  ad_id text,
  ad_name text,
  customer_name text,
  conversation_url text,
  full_history_json jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

create index if not exists idx_conversation_snapshots_ad_id on conversation_snapshots(ad_id);
create index if not exists idx_conversation_snapshots_sender_id on conversation_snapshots(sender_id);

create table if not exists meta_evidence_sync_runs (
  id bigserial primary key,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  conversations_seen integer not null default 0,
  messages_seen integer not null default 0,
  leads_found integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb
);

-- Optional compatibility columns for existing conversations table.
alter table if exists conversations add column if not exists ad_name text;
alter table if exists conversations add column if not exists campaign_id text;
alter table if exists conversations add column if not exists campaign_name text;
alter table if exists conversations add column if not exists adset_id text;
alter table if exists conversations add column if not exists adset_name text;
alter table if exists conversations add column if not exists conversation_url text;
alter table if exists conversations add column if not exists raw jsonb default '{}'::jsonb;

-- Optional compatibility columns for existing messages table.
alter table if exists messages add column if not exists ad_id text;
alter table if exists messages add column if not exists ad_name text;
alter table if exists messages add column if not exists external_message_id text;
alter table if exists messages add column if not exists raw jsonb default '{}'::jsonb;

create or replace function aiguka_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ad_phone_leads_updated_at on ad_phone_leads;
create trigger trg_ad_phone_leads_updated_at before update on ad_phone_leads
for each row execute function aiguka_touch_updated_at();
