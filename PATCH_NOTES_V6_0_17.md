# AIGUKA V6.0.17 - Sale Center Save Persistence Fix

- Sửa lỗi trang `ad-mapping.html` / Lịch Sale báo đã tải nhưng cấu hình không lưu bền vững.
- Không còn phụ thuộc bắt buộc vào bảng `app_settings` đã migration.
- Nếu `bot_working_settings` thiếu các cột JSON mới, server tự lưu toàn bộ cấu hình vào cột `note` dưới dạng JSON fallback và tự đọc lại.
- Nếu DB quá cũ, server vẫn thử lưu tối thiểu các trường giờ làm việc cũ và trả cảnh báo rõ.
- Thêm migration `database/SUPABASE_PATCH_V6_0_17_SALE_CENTER_CONFIG.sql` để chuẩn hóa Supabase.

## Khuyến nghị
Chạy migration V6.0.17 trong Supabase SQL Editor để cấu hình Lịch Sale / Chế độ Bot lưu ổn định nhất.
