# AIGUKA V6.1.0 - Meta Evidence Collector (real patch)

## Đã sửa

1. **Log giờ Việt Nam**
   - Tất cả `console.log/warn/error` có prefix `[VN dd/mm/yyyy hh:mm:ss]`.

2. **Sale Center lưu cấu hình bền vững**
   - Ưu tiên lưu/đọc từ Supabase `app_settings` key `sale_center_config`.
   - Vẫn ghi bảng cũ `bot_working_settings` để tương thích.
   - Sau update/deploy không bị kéo về cấu hình mặc định nếu đã chạy SQL patch.

3. **Stale scan không bỏ sót khách hỏi mới**
   - Không để `contact_lock` cũ chặn khách khi họ hỏi tiếp như “Sen cây bạn”, “xin giá”, “xem mẫu”.
   - Chỉ bỏ qua khi tin mới là khách vừa cho SĐT/Zalo hoặc không có nhu cầu mới.
   - Thêm `bot_decision_logs` để xem lý do bot trả lời/bỏ qua.

4. **Lead Tracker UI thật**
   - `/lead-tracker`: thống kê theo quảng cáo.
   - `/lead-tracker/ad/:adId`: xem danh sách SĐT và link hội thoại.
   - `/meta-evidence`: hướng dẫn chạy collector.

5. **Meta Browser Sync module**
   - Thư mục `meta-browser-sync/` chạy bằng Playwright.
   - Lưu vào `meta_conversation_messages` và `meta_ad_phone_leads`.

## Cần chạy trong Supabase

Chạy file:

```sql
database/SUPABASE_PATCH_V6_1_META_EVIDENCE.sql
```

## Chạy Meta Evidence Collector

```bash
cd meta-browser-sync
npm install
npx playwright install chromium
cp .env.example .env
npm run login:meta
npm run sync:meta
```

Sau đó mở:

```text
/lead-tracker
```
