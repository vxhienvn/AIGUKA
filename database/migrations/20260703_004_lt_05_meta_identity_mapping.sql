-- =====================================================
-- AIGUKA V6.1 - LT-05 Meta Identity Mapping
-- Mục tiêu: bổ sung tên QC, ID QC, tài khoản QC, tên khách theo conversation_id.
-- Không xóa/sửa dashboard cũ. Không dùng ad_phone_leads cũ.
-- Lead thật vẫn được xác định từ messages; bảng này chỉ là identity/mapping.
-- =====================================================

create extension if not exists pgcrypto;

-- Bổ sung cột vào lt_leads nếu chưa có.
alter table public.lt_leads add column if not exists ad_account_id text;
alter table public.lt_leads add column if not exists ad_account_name text;
alter table public.lt_leads add column if not exists source_channel text;
alter table public.lt_leads add column if not exists post_id text;
alter table public.lt_leads add column if not exists comment_id text;
alter table public.lt_leads add column if not exists ad_status text;
alter table public.lt_leads add column if not exists pancake_tags jsonb;
alter table public.lt_leads add column if not exists pancake_employee text;
alter table public.lt_leads add column if not exists pancake_status text;

create index if not exists idx_lt_leads_ad_account_id on public.lt_leads(ad_account_id);
create index if not exists idx_lt_leads_source_channel on public.lt_leads(source_channel);

-- Danh mục quảng cáo lấy từ Meta Business Suite / Pancake message sync.
create table if not exists public.lt_ad_identities (
  id uuid primary key default gen_random_uuid(),
  ad_id text unique,
  ad_name text,
  ad_account_id text,
  ad_account_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  page_id text,
  page_name text,
  status text,
  pancake_tags jsonb,
  pancake_employee text,
  pancake_status text,
  identity_source text default 'meta_business_inbox',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lt_ad_identities_ad_name on public.lt_ad_identities(ad_name);
create index if not exists idx_lt_ad_identities_account on public.lt_ad_identities(ad_account_id);

-- Mapping conversation -> quảng cáo/khách.
create table if not exists public.lt_conversation_identities (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null unique,
  sender_id text,
  customer_id text,
  customer_name text,
  source_channel text default 'meta_business_inbox',
  ad_id text,
  ad_name text,
  ad_account_id text,
  ad_account_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  page_id text,
  page_name text,
  post_id text,
  comment_id text,
  status text,
  pancake_tags jsonb,
  pancake_employee text,
  pancake_status text,
  identity_source text default 'meta_business_inbox',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lt_conv_identity_sender on public.lt_conversation_identities(sender_id);
create index if not exists idx_lt_conv_identity_ad on public.lt_conversation_identities(ad_id);
create index if not exists idx_lt_conv_identity_customer on public.lt_conversation_identities(customer_name);

-- View kiểm tra coverage mapping.
create or replace view public.v_lt_identity_coverage as
select
  count(*) as total_leads,
  count(*) filter (where coalesce(l.ad_id, ci.ad_id) is not null or coalesce(l.ad_name, ci.ad_name) is not null) as mapped_ad_leads,
  count(*) filter (where coalesce(l.customer_name, ci.customer_name) is not null and coalesce(l.customer_name, ci.customer_name) <> 'unknown_customer') as named_customer_leads,
  count(distinct l.conversation_id) as lead_conversations,
  count(distinct ci.conversation_id) as mapped_conversations
from public.lt_leads l
left join public.lt_conversation_identities ci on ci.conversation_id = l.conversation_id
where l.status = 'active';

-- Helper apply toàn bộ mapping đang có vào lt_leads.
create or replace function public.lt_apply_identity_mappings()
returns integer as $$
declare
  updated_count integer;
begin
  update public.lt_leads l
  set
    customer_name = coalesce(nullif(l.customer_name, 'unknown_customer'), ci.customer_name, l.customer_name),
    customer_id = coalesce(l.customer_id, ci.customer_id),
    sender_id = coalesce(l.sender_id, ci.sender_id),
    ad_id = coalesce(l.ad_id, ci.ad_id),
    ad_name = coalesce(l.ad_name, ci.ad_name),
    ad_account_id = coalesce(l.ad_account_id, ci.ad_account_id),
    ad_account_name = coalesce(l.ad_account_name, ci.ad_account_name),
    campaign_id = coalesce(l.campaign_id, ci.campaign_id),
    campaign_name = coalesce(l.campaign_name, ci.campaign_name),
    source_channel = coalesce(l.source_channel, ci.source_channel),
    post_id = coalesce(l.post_id, ci.post_id),
    comment_id = coalesce(l.comment_id, ci.comment_id),
    pancake_tags = coalesce(l.pancake_tags, ci.pancake_tags),
    pancake_employee = coalesce(l.pancake_employee, ci.pancake_employee),
    pancake_status = coalesce(l.pancake_status, ci.pancake_status),
    updated_at = now()
  from public.lt_conversation_identities ci
  where ci.conversation_id = l.conversation_id;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$ language plpgsql;

notify pgrst, 'reload schema';
