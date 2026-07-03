-- =====================================================
-- AIGUKA V6.1 - Lead Tracker Core LT-02.5
-- Lead Intelligence: intent/product/location/analysis.
-- Chỉ thêm bảng/cột lt_*; không đụng Dashboard cũ, Meta, Pancake, ad_phone_leads.
-- =====================================================

create extension if not exists pgcrypto;

alter table public.lt_leads
add column if not exists intent text,
add column if not exists product_group text,
add column if not exists product_label text,
add column if not exists quantity integer,
add column if not exists location_text text,
add column if not exists has_address_signal boolean default false,
add column if not exists need_callback boolean default false,
add column if not exists need_quotation boolean default false,
add column if not exists need_sample boolean default false,
add column if not exists intelligence_summary text;

create index if not exists idx_lt_leads_intent on public.lt_leads(intent);
create index if not exists idx_lt_leads_product_group on public.lt_leads(product_group);
create index if not exists idx_lt_leads_need_callback on public.lt_leads(need_callback);
create index if not exists idx_lt_leads_lead_score on public.lt_leads(lead_score desc);

create table if not exists public.lt_ai_analysis (
    id uuid primary key default gen_random_uuid(),
    lead_id uuid references public.lt_leads(id) on delete cascade,
    conversation_id text not null,
    sender_id text,
    analysis_source text not null default 'rule_engine',
    model_name text default 'aiguka-rule-lt-02-5',

    intent text,
    product_group text,
    product_label text,
    quantity integer,
    location_text text,
    has_address_signal boolean default false,
    need_callback boolean default false,
    need_quotation boolean default false,
    need_sample boolean default false,
    lead_score numeric(5,2),
    summary text,
    signals jsonb not null default '[]'::jsonb,
    raw jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists uq_lt_ai_analysis_lead_id
on public.lt_ai_analysis(lead_id);

create index if not exists idx_lt_ai_analysis_conversation
on public.lt_ai_analysis(conversation_id);

create index if not exists idx_lt_ai_analysis_intent
on public.lt_ai_analysis(intent);

create index if not exists idx_lt_ai_analysis_product
on public.lt_ai_analysis(product_group);

create index if not exists idx_lt_ai_analysis_score
on public.lt_ai_analysis(lead_score desc);

create or replace view public.v_lt_intelligence_summary as
select
    count(*) filter (where status = 'active') as total_leads,
    count(*) filter (where status = 'active' and need_callback = true) as need_callback,
    count(*) filter (where status = 'active' and need_quotation = true) as need_quotation,
    count(*) filter (where status = 'active' and need_sample = true) as need_sample,
    count(*) filter (where status = 'active' and has_address_signal = true) as has_address_signal,
    count(*) filter (where status = 'active' and lead_score >= 95) as high_score_leads,
    avg(lead_score) filter (where status = 'active') as avg_lead_score
from public.lt_leads;

create or replace view public.v_lt_product_summary as
select
    coalesce(product_group, 'unknown') as product_group,
    coalesce(product_label, 'Chưa rõ sản phẩm') as product_label,
    count(*) filter (where status = 'active') as total_leads,
    count(*) filter (where status = 'active' and need_callback = true) as need_callback,
    count(*) filter (where status = 'active' and need_quotation = true) as need_quotation,
    count(*) filter (where status = 'active' and lead_score >= 95) as high_score_leads,
    avg(lead_score) filter (where status = 'active') as avg_score,
    max(phone_detected_at) as latest_lead_at
from public.lt_leads
where status = 'active'
group by coalesce(product_group, 'unknown'), coalesce(product_label, 'Chưa rõ sản phẩm');

create or replace function public.lt_clear_all()
returns void as $$
begin
    truncate table public.lt_ai_analysis restart identity cascade;
    truncate table public.lt_evidence restart identity cascade;
    truncate table public.lt_lead_messages restart identity cascade;
    truncate table public.lt_timeline_events restart identity cascade;
    truncate table public.lt_leads restart identity cascade;
    truncate table public.lt_dashboard_cache restart identity cascade;
end;
$$ language plpgsql;

notify pgrst, 'reload schema';
