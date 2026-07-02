# AIGUKA V6.1.0 Meta Evidence Fixed

## Sửa lỗi vận hành
- Log server có prefix giờ Việt Nam.
- Sale Center lưu cấu hình bền vững vào `app_settings` và vẫn mirror sang `bot_working_settings` cũ.
- Stale scan không để `contact_lock` chặn nhầm khách đã có số nhưng đang hỏi mới như “Sen cây bạn”, “xin giá”, “xem mẫu”.

## Lead Tracker
- Thêm `/lead-tracker`.
- Thêm API:
  - `/api/lead-tracker/summary`
  - `/api/lead-tracker/rebuild`
  - `/api/lead-tracker/ad/:adId/leads`
  - `/api/lead-tracker/conversation/:conversationId`
- Có thể quét lại bảng `messages` để tạo lead evidence vào `ad_phone_leads`.

## Meta Evidence Collector
- Thêm `/meta-evidence`.
- Thêm module `meta-browser-sync/` dùng Playwright để đọc Inbox Meta Business Suite và lưu bằng chứng lead.
- Thêm SQL `database/SUPABASE_PATCH_V6_1_META_EVIDENCE.sql`.

## Cần làm sau deploy
1. Chạy SQL patch trong Supabase.
2. Deploy code.
3. Mở `/lead-tracker`, bấm “Quét lại từ messages”.
4. Nếu cần nguồn quảng cáo chính xác từ Business Suite, chạy `meta-browser-sync`.
