# AIGUKA V6.0.22 - Bot Reply Switch Persistence Fix

## Fix
- Sửa nút AI & BOT / Bot trả lời trên Dashboard không tự lưu, F5 quay về trạng thái cũ.
- Trạng thái được lưu vào Supabase `app_settings` nếu có, và fallback vào file `bot_reply_switch.json`.
- API `/api/bot-reply-switch` hỗ trợ GET/POST và tự đọc trạng thái thật khi tải trang.
- Dashboard tự gọi API khi load để đồng bộ trạng thái nút gạt thay vì mặc định checked.

## Supabase
Không bắt buộc migration mới. Nếu có bảng `app_settings`, hệ thống sẽ dùng các cột hiện có:
- `key` + `value`, hoặc
- `setting_key` + `setting_value`.

Nếu Supabase chưa sẵn sàng, trạng thái vẫn lưu local để không mất sau F5.
