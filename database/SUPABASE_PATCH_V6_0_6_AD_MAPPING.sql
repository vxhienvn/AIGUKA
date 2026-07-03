alter table ad_mappings add column if not exists drive_folders jsonb default '[]'::jsonb;
alter table ad_mappings add column if not exists zalo_url text;
