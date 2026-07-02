# AIGUKA V6.1 Stable Core

## Sửa lỗi Sale Center không lưu cấu hình
- `app_settings.key = sale_center_config` là nguồn dữ liệu chính.
- GET `/api/sale-center/config` đọc ưu tiên từ `app_settings`.
- POST `/api/working-settings` ghi trực tiếp vào `app_settings`, sau đó mới đồng bộ best-effort sang `bot_working_settings` cũ.
- Tránh lỗi lưu một bảng nhưng reload lại đọc bảng khác.

## Module Lead Tracker riêng
- Thêm `/lead-tracker`.
- Thêm API:
  - `GET /api/lead-tracker/summary`
  - `GET /api/lead-tracker/leads`
  - `POST /api/lead-tracker/scan-messages`
- Dùng bảng mới `lt_*`, không dùng `ad_phone_leads` cũ để tránh conflict schema.
- Quét từ bảng `messages`, tìm SĐT/Zalo và lưu bằng chứng tin nhắn.

## SQL cần chạy
`database/AIGUKA_V6_1_STABLE_CORE.sql`
