-- AIGUKA V6.1 - Sale Center persistent config + Lead Check helper
-- Chạy một lần trên Supabase. Không xóa bảng cũ.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.aiguka_app_settings_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
before update on public.app_settings
for each row execute function public.aiguka_app_settings_touch_updated_at();

-- Bảng cũ vẫn giữ nguyên. App sẽ đọc app_settings('sale_center_config') trước,
-- fallback sang bot_working_settings nếu app_settings chưa có dữ liệu.
notify pgrst, 'reload schema';
