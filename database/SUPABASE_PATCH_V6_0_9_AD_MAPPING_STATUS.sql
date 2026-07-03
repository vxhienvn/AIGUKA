-- V6.0.9 Ad Mapping: optional account metadata columns
alter table if exists ad_mappings add column if not exists ad_account_name text;
alter table if exists ad_mappings add column if not exists account_status text;
create index if not exists idx_ad_mappings_account_status on ad_mappings(account_status);
