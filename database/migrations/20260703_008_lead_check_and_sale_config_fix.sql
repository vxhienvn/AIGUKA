-- AIGUKA V6.1 - Lead Check + Sale Center persistent config
-- Safe migration: only creates app_settings if missing. Lead Check reads Pancake/API data and does not need new tables.

create extension if not exists pgcrypto;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_settings_updated_at on public.app_settings(updated_at desc);

notify pgrst, 'reload schema';

-- V1.2 compatibility: một số database cũ có app_settings khác schema.
alter table public.app_settings add column if not exists key text;
alter table public.app_settings add column if not exists value jsonb not null default '{}'::jsonb;
alter table public.app_settings add column if not exists setting_key text;
alter table public.app_settings add column if not exists setting_value jsonb;
create unique index if not exists uq_app_settings_key on public.app_settings(key) where key is not null;
create unique index if not exists uq_app_settings_setting_key on public.app_settings(setting_key) where setting_key is not null;

notify pgrst, 'reload schema';
