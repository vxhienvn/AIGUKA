-- AIGUKA V6.0.3 - Meta Lead Tracker + Persistent Settings
-- Chạy file này trong Supabase SQL Editor trước khi dùng meta-browser-sync.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_app_settings_updated_at on app_settings;
create trigger trg_app_settings_updated_at
before update on app_settings
for each row execute function set_updated_at();

insert into app_settings(key, value)
values
('lead_tracker_config', jsonb_build_object(
  'enabled', true,
  'sync_interval_minutes', 30,
  'source_priority', jsonb_build_array('meta_browser', 'pancake'),
  'lead_types', jsonb_build_array('phone_text', 'zalo_flag', 'pancake_zalo_flag')
))
on conflict(key) do nothing;

create table if not exists ad_phone_leads (
  id bigserial primary key,
  ad_id text not null,
  ad_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  page_id text,
  conversation_id text not null,
  conversation_url text,
  customer_id text,
  customer_name text,
  customer_profile_url text,
  phone text,
  normalized_phone text,
  has_phone boolean not null default false,
  has_zalo boolean not null default false,
  source_flag text not null default 'unknown', -- phone_text / zalo_text / pancake_zalo_flag / both
  evidence_message text,
  evidence_message_time timestamptz,
  first_message text,
  last_message text,
  last_message_at timestamptz,
  full_history_json jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_phone_leads_phone_or_flag check (normalized_phone is not null or has_zalo = true)
);

create unique index if not exists ux_ad_phone_leads_ad_phone
on ad_phone_leads(ad_id, normalized_phone)
where normalized_phone is not null;

create unique index if not exists ux_ad_phone_leads_ad_conversation_zalo
on ad_phone_leads(ad_id, conversation_id)
where normalized_phone is null and has_zalo = true;

create index if not exists ix_ad_phone_leads_ad_id on ad_phone_leads(ad_id);
create index if not exists ix_ad_phone_leads_conversation_id on ad_phone_leads(conversation_id);
create index if not exists ix_ad_phone_leads_updated_at on ad_phone_leads(updated_at desc);

drop trigger if exists trg_ad_phone_leads_updated_at on ad_phone_leads;
create trigger trg_ad_phone_leads_updated_at
before update on ad_phone_leads
for each row execute function set_updated_at();

create table if not exists lead_messages (
  id bigserial primary key,
  conversation_id text not null,
  ad_id text,
  sender text,
  sender_type text, -- customer/admin/page/bot/unknown
  message_text text,
  message_time timestamptz,
  is_phone_message boolean not null default false,
  is_zalo_message boolean not null default false,
  phones jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_lead_messages_conversation on lead_messages(conversation_id, message_time);
create index if not exists ix_lead_messages_ad on lead_messages(ad_id);

create table if not exists conversation_snapshots (
  conversation_id text primary key,
  ad_id text,
  ad_name text,
  page_id text,
  customer_id text,
  customer_name text,
  conversation_url text,
  full_history_json jsonb not null default '[]'::jsonb,
  pancake_flags jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_conversation_snapshots_updated_at on conversation_snapshots;
create trigger trg_conversation_snapshots_updated_at
before update on conversation_snapshots
for each row execute function set_updated_at();

-- View tổng hợp: mỗi quảng cáo ra bao nhiêu số thật, bao nhiêu cờ Zalo, bao nhiêu lead liên hệ.
create or replace view v_ad_lead_summary as
select
  ad_id,
  max(ad_name) as ad_name,
  count(distinct conversation_id) as lead_conversations,
  count(distinct normalized_phone) filter (where normalized_phone is not null) as phone_count,
  count(*) filter (where has_zalo = true) as zalo_flag_count,
  count(*) as contact_lead_count,
  max(updated_at) as last_lead_at
from ad_phone_leads
group by ad_id;
