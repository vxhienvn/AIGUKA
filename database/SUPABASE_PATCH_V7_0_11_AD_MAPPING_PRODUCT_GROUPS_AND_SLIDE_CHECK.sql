-- AIGUKA V7.0.11
-- Mục tiêu:
-- 1) Chuẩn hóa nguồn danh mục sản phẩm: product_groups là nguồn chính cho UI Mapping + Bot.
-- 2) Chống mất cấu hình khi lưu ad_mappings: bổ sung các cột mà UI/bot đang dùng.
-- 3) Giữ tương thích cột cũ: product_type/product_name/main_folder/selected_folders/enabled.

alter table public.product_groups add column if not exists slug text;
alter table public.product_groups add column if not exists description text;
alter table public.product_groups add column if not exists keywords text[] default '{}';
alter table public.product_groups add column if not exists aliases text[] default '{}';
alter table public.product_groups add column if not exists sort_order integer default 999;
alter table public.product_groups add column if not exists drive_folder text;
alter table public.product_groups add column if not exists updated_at timestamptz default now();

insert into public.product_groups (id, name, slug, description, keywords, aliases, sort_order, price_note, hotline, active, updated_at)
values
('fan','Quạt trần','quat-tran','Quạt trần, quạt đèn, quạt mạ vàng, quạt 10 cánh',array['quạt','quạt trần','quạt đèn','quạt vàng','quạt mạ vàng','10 cánh','quat tran','quat den'],array['Quạt trần','Quạt đèn','Quạt mạ vàng 10 cánh'],10,'Giá tùy phiên bản, động cơ và mẫu mã. Không tự bịa giá ngoài dữ liệu.','0973693677',true,now()),
('bathroom','Thiết bị vệ sinh','thiet-bi-ve-sinh','Nhóm tổng cho sen vòi, lavabo, bệt/bồn cầu, combo WC, tủ chậu, gương lavabo',array['thiết bị vệ sinh','sen vòi','sen tắm','lavabo','bệt','bồn cầu','combo phòng tắm','wc','tủ chậu','gương lavabo','thiet bi ve sinh','sen voi','bon cau'],array['Sen vòi / Lavabo','Bệt / Bồn cầu','Combo phòng tắm / WC','Tủ chậu / Gương lavabo'],20,'Cần kiểm tra đúng mẫu trước khi báo giá.','0973693677',true,now()),
('bathtub','Bồn tắm','bon-tam','Bồn tắm, bathtub, bồn tắm massage',array['bồn tắm','bon tam','bathtub','massage'],array['Bồn tắm'],30,'Cần kiểm tra đúng mẫu, kích thước và chất liệu trước khi báo giá.','0973693677',true,now()),
('kitchen','Bếp / Hút mùi / Chậu vòi bếp','bep-hut-mui-chau-voi-bep','Bếp từ, hút mùi, chậu rửa bát, vòi bếp',array['bếp','bếp từ','hút mùi','chậu rửa','vòi bếp','bep tu','hut mui','chau rua'],array['Bếp từ - hút mùi','Bếp / Hút mùi / Chậu vòi bếp'],40,'Giá tùy combo và thương hiệu.','0973693677',true,now()),
('tile','Gạch','gach','Gạch men, gạch ốp lát',array['gạch','gạch men','gạch ốp','gạch lát','gach men'],array['Gạch'],50,'Cần kiểm tra mẫu, kích thước và số lượng trước khi báo giá.','0973693677',true,now()),
('lighting','Đèn trang trí','den-trang-tri','Đèn trang trí, đèn chùm, đèn decor',array['đèn','đèn trang trí','đèn chùm','den chum','den trang tri'],array['Đèn trang trí','Đèn chùm'],60,'Cần kiểm tra mẫu và kích thước trước khi báo giá.','0973693677',true,now())
on conflict (id) do update set
  name=excluded.name,
  slug=excluded.slug,
  description=excluded.description,
  keywords=excluded.keywords,
  aliases=excluded.aliases,
  sort_order=excluded.sort_order,
  price_note=excluded.price_note,
  hotline=excluded.hotline,
  active=excluded.active,
  updated_at=now();

alter table public.ad_mappings add column if not exists product_group text;
alter table public.ad_mappings add column if not exists product_item_key text;
alter table public.ad_mappings add column if not exists recognition_name text;
alter table public.ad_mappings add column if not exists slide_key text;
alter table public.ad_mappings add column if not exists image_urls jsonb default '[]'::jsonb;
alter table public.ad_mappings add column if not exists price_range text;
alter table public.ad_mappings add column if not exists notes text;
alter table public.ad_mappings add column if not exists is_active boolean default true;
alter table public.ad_mappings add column if not exists effective_status text;
alter table public.ad_mappings add column if not exists updated_at timestamptz default now();
alter table public.ad_mappings add column if not exists selected_folders jsonb default '[]'::jsonb;
alter table public.ad_mappings add column if not exists main_folder text;

update public.ad_mappings
set
  product_group = coalesce(product_group, product_type),
  product_item_key = coalesce(product_item_key, product_name),
  recognition_name = coalesce(recognition_name, main_folder),
  is_active = coalesce(is_active, enabled, true),
  updated_at = now();

create unique index if not exists ad_mappings_ad_id_uidx on public.ad_mappings(ad_id);

create or replace view public.ai_product_categories as
select id, name, slug, description, keywords, aliases, sort_order, drive_folder,
       safe_price_min, safe_price_max, price_note, hotline, active as is_active, created_at, updated_at
from public.product_groups
where active = true
order by sort_order asc, name asc;
