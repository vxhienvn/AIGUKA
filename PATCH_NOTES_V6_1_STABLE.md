# AIGUKA V6.1 Stable Lead Tracker

Bản này được cập nhật từ source trước khi thêm Lead Tracker, tránh kế thừa các bảng/constraint cũ bị chồng phiên bản.

## Có gì mới

- Thêm `/lead-tracker` để xem quảng cáo nào sinh ra SĐT.
- Thêm API quét từ bảng `messages` sang bảng ổn định `lt_ad_phone_leads`.
- Không ghi vào bảng cũ `ad_phone_leads`, tránh lỗi constraint `ad_phone_leads_phone_or_flag`.
- Thêm `/meta-evidence` làm trang hướng dẫn/kiểm tra module bằng chứng.
- Thêm prefix giờ Việt Nam vào log qua `src/utils/vnLog.js`.

## Cách triển khai

1. Deploy code.
2. Vào Supabase SQL Editor chạy `database/AIGUKA_V6_1_STABLE_LEAD_TRACKER.sql`.
3. Restart Render.
4. Mở `/lead-tracker`.
5. Bấm `Quét lại từ messages`.

## Lưu ý

Nếu tin nhắn trong bảng `messages` không có `ad_id`, lead sẽ được xếp vào nhóm `unknown_ad`. Khi đó cần đồng bộ thêm nguồn quảng cáo từ Meta/Pancake hoặc Browser Sync để gắn đúng quảng cáo.
