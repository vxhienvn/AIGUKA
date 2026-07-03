# AIGUKA V6.1 - Lead Check + Sale Center Persistent Fix

## Mục tiêu
- Không thay dashboard cũ.
- Tận dụng nguồn bảng Dashboard/Pancake cũ để xem khách có SĐT/Zalo theo quảng cáo.
- Thêm lọc theo quảng cáo, tài khoản QC, thời gian, tìm SĐT/tên khách.
- Click SĐT/khách để xem chi tiết hội thoại nếu Pancake API trả được messages.
- Sửa lỗi Sale Center mất cấu hình khi deploy/update bản mới.

## File thêm
- `src/routes/leadCheckRoutes.js`
- `public/lead-check.html`
- `database/migrations/20260703_007_sale_center_and_lead_check.sql`

## File sửa
- `src/app.js`

## Đường dẫn mới
- `/lead-check`
- `/api/lead-check/summary`
- `/api/lead-check/leads`
- `/api/lead-check/conversation/:id`

## Sale Center
- `app_settings` là nguồn lưu cấu hình ưu tiên.
- `bot_working_settings` vẫn được lưu song song để giữ tương thích.
- Khi mở lại Sale Center sẽ đọc `app_settings` trước, tránh bị reset về cấu hình mặc định.
