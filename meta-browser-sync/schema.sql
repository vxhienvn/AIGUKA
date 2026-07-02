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
  phone_numbers text[],
  zalo_hits text[],
  message_hash text unique,
  raw jsonb,
  created_at timestamptz default now()
);

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
  created_at timestamptz default now(),
  unique(ad_id, customer_key, phone)
);

create index if not exists idx_meta_messages_ad_id on meta_conversation_messages(ad_id);
create index if not exists idx_meta_ad_phone_leads_ad_id on meta_ad_phone_leads(ad_id);
