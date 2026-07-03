# AIGUKA V6.1 Lead Check V1

Base: AIGUKA-6.0.2-messenger-care-policy-update.

## Mục tiêu
Giữ bảng Dashboard cũ làm nguồn gần thực tế nhất, bổ sung module Lead Check riêng để xem:
- Quảng cáo nào có bao nhiêu SĐT/Zalo.
- Cụ thể là những số nào, của khách nào.
- Lọc theo thời gian, quảng cáo, tài khoản QC, tên/SĐT.
- Click SĐT/khách để xem chi tiết và hội thoại nếu Supabase messages có dữ liệu.

## Thay đổi
- Added `public/lead-check.html`.
- Added `src/routes/leadCheckRoutes.js`.
- Mounted `/lead-check` and `/api/lead-check/*` in `src/app.js`.
- Added migration `database/migrations/20260703_008_lead_check_and_sale_config_fix.sql`.
- Sale Center: lưu cấu hình song song vào `app_settings` và ưu tiên đọc `app_settings` khi load.

## Không thay đổi
- Không xóa Dashboard cũ.
- Không xóa bảng cũ.
- Không thay đổi luồng bot trả lời khách.
- Không phụ thuộc `lt_*` để hiển thị Lead Check V1.

## Test URLs
- `/lead-check`
- `/api/lead-check/list?limit=500&preset=today`
- `/api/lead-check/filters?limit=500&preset=30d`
