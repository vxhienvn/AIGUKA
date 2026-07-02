-- AIGUKA V6.1 Stable Core
-- 1) Sale Center dùng app_settings làm nguồn cấu hình bền vững
-- 2) Lead Tracker dùng bảng lt_* riêng, không đụng ad_phone_leads cũ

create extension if not exists pgcrypto;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.lt_ad_leads (
  id uuid primary key default gen_random_uuid(),
  lead_key text not null unique,
  conversation_id text,
  sender_id text,
  page_id text,
  ad_id text not null default 'unknown_ad',
  ad_name text,
  post_id text,
  product_group text,
  intent text,
  phone text,
  has_zalo boolean not null default false,
  source_flag text not null default 'phone',
  source text,
  message_id text,
  message_time timestamptz,
  evidence_text text,
  conversation_url text,
  customer_name text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lt_ad_leads_ad_id on public.lt_ad_leads(ad_id);
create index if not exists idx_lt_ad_leads_phone on public.lt_ad_leads(phone);
create index if not exists idx_lt_ad_leads_sender on public.lt_ad_leads(sender_id);
create index if not exists idx_lt_ad_leads_message_time on public.lt_ad_leads(message_time desc);

create table if not exists public.lt_lead_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  conversation_id text,
  sender_id text,
  role text,
  text text,
  phones jsonb not null default '[]'::jsonb,
  has_zalo boolean not null default false,
  message_time timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lt_lead_messages_conversation on public.lt_lead_messages(conversation_id);
create index if not exists idx_lt_lead_messages_sender on public.lt_lead_messages(sender_id);
create index if not exists idx_lt_lead_messages_time on public.lt_lead_messages(message_time desc);

create table if not exists public.lt_sync_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null default 'message_scan',
  status text not null default 'running',
  params jsonb not null default '{}'::jsonb,
  result jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace view public.v_lt_ad_lead_summary as
select
  ad_id,
  coalesce(max(ad_name), case when ad_id = 'unknown_ad' then 'Chưa rõ quảng cáo' else ad_id end) as ad_name,
  count(*) as contact_count,
  count(distinct phone) filter (where phone is not null and phone <> '') as phone_count,
  count(*) filter (where has_zalo is true or source_flag in ('zalo','phone_zalo')) as zalo_count,
  count(distinct conversation_id) filter (where conversation_id is not null) as conversation_count,
  max(message_time) as latest_message_time
from public.lt_ad_leads
group by ad_id;

create or replace function public.aiguka_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lt_ad_leads_updated_at on public.lt_ad_leads;
create trigger trg_lt_ad_leads_updated_at
before update on public.lt_ad_leads
for each row execute function public.aiguka_touch_updated_at();

-- Sale Center default, chỉ tạo nếu chưa có để không ghi đè cấu hình đang dùng
insert into public.app_settings(key, value)
values (
  'sale_center_config',
  '{
    "setting_key":"default",
    "timezone":"Asia/Ho_Chi_Minh",
    "is_open":true,
    "bot_mode":"support",
    "work_start":"08:00",
    "work_end":"22:00",
    "staff_online_count":1,
    "admin_pause_minutes":10,
    "support_wait_minutes":10,
    "customer_wait_minutes":5,
    "outside_wait_minutes":5,
    "carousel_cooldown_minutes":5,
    "working_windows":[
      {"enabled":true,"name":"Sáng","start":"08:00","end":"12:00","mode":"off"},
      {"enabled":true,"name":"Chiều","start":"13:30","end":"17:30","mode":"off"}
    ],
    "after_hours_windows":[
      {"enabled":true,"name":"Tối","start":"17:30","end":"22:00","mode":"support"},
      {"enabled":true,"name":"Đêm","start":"22:00","end":"08:00","mode":"support"}
    ]
  }'::jsonb
)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
