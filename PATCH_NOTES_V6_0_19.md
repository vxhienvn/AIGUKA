# AIGUKA V6.0.19 - Sale Center Mode Persistence UI Fix

## Fix
- Sửa lỗi trang Lịch Sale / Chế độ Bot hiển thị sai mode sau khi F5 do backend trả `on/off/support` chữ thường nhưng UI chỉ so sánh `ON/OFF/SUPPORT` chữ hoa.
- Sửa lỗi các dòng Ngoài giờ ghi vào nhầm key `after_windows` thay vì `after_hours_windows`, khiến thay đổi không được gửi đúng lên backend.
- Sau khi lưu, UI đọc lại response từ server và render lại cấu hình thật.
- Hiển thị nguồn cấu hình đang đọc (`app_settings`, `bot_working_settings`, `note_json`...) để dễ kiểm tra.

## Check
- `node --check src/app.js`: pass
- JS trong `public/sale-center.html`: pass
