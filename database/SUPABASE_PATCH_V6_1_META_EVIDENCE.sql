-- AIGUKA V6.1 - Meta Evidence Collector + persistent Sale Center settings
-- Chạy file này trong Supabase SQL Editor trước khi dùng /lead-tracker và meta-browser-sync.

create table if not exists app_settings (
  setting_key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_app_settings_updated_at on app_settings(updated_at desc);

create table if not exists bot_decision_logs (
  id bigserial primary key,
  sender_id text,
  stage text not null,
  detail jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_bot_decision_logs_sender_id on bot_decision_logs(sender_id);
create index if not exists idx_bot_decision_logs_created_at on bot_decision_logs(created_at desc);

create table if not exists meta_conversation_messages (
  id bigserial primary key,
  page_id text,
  customer_name text,
  customer_key text,
  conversation_url text,
  ad_id text,
  ad_name text,
  message_time text,
  sender_type text,
  message_text text,
  phone_numbers text[] default '{}'::text[],
  zalo_hits text[] default '{}'::text[],
  message_hash text unique,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_meta_messages_ad_id on meta_conversation_messages(ad_id);
create index if not exists idx_meta_messages_customer_key on meta_conversation_messages(customer_key);
create index if not exists idx_meta_messages_created_at on meta_conversation_messages(created_at desc);

create table if not exists meta_ad_phone_leads (
  id bigserial primary key,
  ad_id text not null,
  ad_name text,
  customer_key text not null,
  customer_name text,
  phone text not null,
  first_seen_at text,
  conversation_url text,
  message_hash text,
  has_zalo boolean default false,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique(ad_id, customer_key, phone)
);

create index if not exists idx_meta_ad_phone_leads_ad_id on meta_ad_phone_leads(ad_id);
create index if not exists idx_meta_ad_phone_leads_phone on meta_ad_phone_leads(phone);
create index if not exists idx_meta_ad_phone_leads_created_at on meta_ad_phone_leads(created_at desc);

-- Bảng tương thích với bản Lead Tracker cũ nếu đã dùng tên ad_phone_leads.
create table if not exists ad_phone_leads (
  id bigserial primary key,
  ad_id text not null,
  ad_name text,
  customer_name text,
  customer_profile_url text,
  conversation_id text,
  conversation_url text,
  phone text not null,
  source_flag text default 'phone',
  message_time timestamptz,
  first_message text,
  last_message text,
  evidence jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique(ad_id, phone)
);

create index if not exists idx_ad_phone_leads_ad_id on ad_phone_leads(ad_id);
create index if not exists idx_ad_phone_leads_phone on ad_phone_leads(phone);
create index if not exists idx_ad_phone_leads_created_at on ad_phone_leads(created_at desc);

-- Bổ sung cột cho bảng cấu hình cũ nếu còn dùng.
create table if not exists bot_working_settings (
  setting_key text primary key default 'default'
);

alter table bot_working_settings add column if not exists timezone text default 'Asia/Ho_Chi_Minh';
alter table bot_working_settings add column if not exists bot_mode text default 'support';
alter table bot_working_settings add column if not exists work_start text default '08:00';
alter table bot_working_settings add column if not exists work_end text default '22:00';
alter table bot_working_settings add column if not exists working_windows jsonb not null default '[]'::jsonb;
alter table bot_working_settings add column if not exists after_hours_windows jsonb not null default '[]'::jsonb;
alter table bot_working_settings add column if not exists reply_windows jsonb not null default '[]'::jsonb;
alter table bot_working_settings add column if not exists is_open boolean default true;
alter table bot_working_settings add column if not exists holiday_mode boolean default false;
alter table bot_working_settings add column if not exists staff_online_count int default 1;
alter table bot_working_settings add column if not exists admin_pause_minutes int default 10;
alter table bot_working_settings add column if not exists support_wait_minutes int default 10;
alter table bot_working_settings add column if not exists customer_wait_minutes int default 5;
alter table bot_working_settings add column if not exists outside_wait_minutes int default 5;
alter table bot_working_settings add column if not exists carousel_cooldown_minutes int default 5;
alter table bot_working_settings add column if not exists note text default '';
alter table bot_working_settings add column if not exists updated_at timestamptz default now();

insert into bot_working_settings(setting_key)
values ('default')
on conflict (setting_key) do nothing;
