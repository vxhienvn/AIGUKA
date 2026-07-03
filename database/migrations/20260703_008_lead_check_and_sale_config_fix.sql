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
