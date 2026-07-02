# Meta Browser Sync

Module này dùng Playwright mở Meta Business Suite Inbox như người dùng thật, đọc hội thoại, trích xuất SĐT/Zalo và lưu lead theo từng `ad_id` vào Supabase.

## Cài đặt

```bash
cd meta-browser-sync
npm install
npx playwright install chromium
cp .env.example .env
```

Chạy `../database/SUPABASE_PATCH_V6_1_META_EVIDENCE.sql` trong Supabase SQL Editor.

## Đăng nhập lần đầu

```bash
npm run login:meta
```

Đăng nhập trong cửa sổ mở ra, vào được Inbox rồi quay lại terminal nhấn Enter. Session sẽ lưu ở `session/meta`.

## Đồng bộ

```bash
npm run sync:meta
```

Muốn chạy thử không ghi Supabase:

```bash
META_SYNC_DRY_RUN=true npm run sync:meta
```

## Bảng quan trọng

- `meta_conversation_messages`: lưu từng tin nhắn.
- `meta_ad_phone_leads`: mỗi khách + SĐT + quảng cáo chỉ tính một lần.

Query đánh giá chất lượng quảng cáo:

```sql
select
  ad_id,
  max(ad_name) as ad_name,
  count(distinct customer_key) as customers_with_phone,
  count(distinct phone) as unique_phones
from meta_ad_phone_leads
group by ad_id
order by customers_with_phone desc;
```

## Lưu ý

Meta đổi DOM thường xuyên, selector có thể cần chỉnh sau khi test thật. Chạy chậm, không mở nhiều tab, không scrape quá nhanh.
