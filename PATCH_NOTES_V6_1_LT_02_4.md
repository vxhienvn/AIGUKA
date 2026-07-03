# AIGUKA V6.1 - LT-02.4 Lead Tracker Core

Nguồn dữ liệu Lead Tracker vẫn là `messages`. Dashboard cũ, Meta, Pancake và `ad_phone_leads` cũ không bị thay đổi.

## Thêm mới
- Bảng `lt_phone_blacklist`: quản lý số hotline/sale/test không tính là lead.
- Bảng `lt_scan_statistics`: lưu thống kê mỗi lần rescan để so sánh độ ổn định engine.
- Bảng `lt_timeline_events`: lưu event `lead_detected` cho từng lead.
- Cột `lt_leads.lead_score`.

## API mới
- `GET /api/leadtracker/debug/phone/:phone`
- `GET /api/leadtracker/debug/conversation/:conversationId`
- `GET /api/leadtracker/stats`
- `GET /api/leadtracker/blacklist`
- `POST /api/leadtracker/blacklist`

## Sửa engine
- Chỉ nhận số từ actor `customer`.
- Bỏ qua admin/bot/page/system/meta_auto.
- Đọc blacklist từ bảng `lt_phone_blacklist` + env.
- Map `customer_name` best-effort từ messages/customers/conversations.
- Trả rejectedByActor, rejectedBySource, acceptedBySource.

## Cần chạy SQL
`database/migrations/20260703_002_lt_02_4_engine_hardening.sql`
