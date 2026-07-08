-- AIGUKA V7.4.9 - Mapping Target Item
-- Cho phép QC map trực tiếp tới GROUP hoặc ITEM/thư mục sản phẩm cụ thể.

alter table if exists public.ad_mappings
  add column if not exists mapping_target_type text default 'group',
  add column if not exists mapping_mode text default 'locked',
  add column if not exists product_drive_path text;

comment on column public.ad_mappings.mapping_target_type is 'group|item: QC tổng hợp map group, QC sản phẩm cụ thể map item/thư mục con.';
comment on column public.ad_mappings.mapping_mode is 'locked|flexible: mapping là nguồn chỉ định khi khách chưa nói rõ; khách nói rõ sản phẩm khác vẫn override.';
comment on column public.ad_mappings.product_drive_path is 'Đường dẫn/cây thư mục sản phẩm được chọn từ Google Drive Products tree.';

update public.ad_mappings
set mapping_target_type = case
  when coalesce(product_item_key, product_name, recognition_name, main_folder, product_drive_path, '') <> '' then 'item'
  else coalesce(mapping_target_type, 'group')
end
where mapping_target_type is null or mapping_target_type = '';

update public.ad_mappings
set mapping_mode = coalesce(nullif(mapping_mode,''), 'locked')
where mapping_mode is null or mapping_mode = '';
