-- AIGUKA V6.0.17 - Sale Center persistent config
-- Chạy một lần trong Supabase SQL Editor để Lịch Sale / Chế độ Bot lưu bền vững.

create extension if not exists pgcrypto;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings add column if not exists key text;
alter table public.app_settings add column if not exists value jsonb not null default '{}'::jsonb;
alter table public.app_settings add column if not exists setting_key text;
alter table public.app_settings add column if not exists setting_value jsonb;

create unique index if not exists uq_app_settings_key on public.app_settings(key) where key is not null;
create unique index if not exists uq_app_settings_setting_key on public.app_settings(setting_key) where setting_key is not null;

create table if not exists public.bot_working_settings (
  setting_key text primary key default 'default',
  timezone text default 'Asia/Ho_Chi_Minh',
  work_start text default '08:00',
  work_end text default '22:00',
  is_open boolean default true,
  holiday_mode boolean default false,
  staff_online_count int default 1,
  admin_pause_minutes int default 10,
  customer_wait_minutes int default 5,
  outside_wait_minutes int default 5,
  carousel_cooldown_minutes int default 5,
  note text,
  updated_at timestamptz default now()
);

alter table public.bot_working_settings add column if not exists bot_mode text default 'support';
alter table public.bot_working_settings add column if not exists support_wait_minutes int default 10;
alter table public.bot_working_settings add column if not exists working_windows jsonb not null default '[]'::jsonb;
alter table public.bot_working_settings add column if not exists after_hours_windows jsonb not null default '[]'::jsonb;
alter table public.bot_working_settings add column if not exists reply_windows jsonb not null default '[]'::jsonb;
alter table public.bot_working_settings add column if not exists note text;

insert into public.bot_working_settings(setting_key) values ('default') on conflict(setting_key) do nothing;

notify pgrst, 'reload schema';
