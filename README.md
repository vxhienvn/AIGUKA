# AIGUKA 4.2.2 - Stable Sync Timeline

## Mục tiêu
- Sửa lỗi `Cannot read properties of undefined (reading 'push')` khi sync Messenger.
- Phân loại đúng timeline từ Messenger Graph:
  - `messenger_graph_customer`: khách nhắn trực tiếp/Messenger.
  - `messenger_graph_page_admin`: sale/admin/Page trả lời thủ công, có kích hoạt sale-lock.
  - `messenger_graph_bot_ai`: tin bot AIGUKA đã gửi.
  - `pancake_comment_auto`: Pancake tự inbox khi khách comment, KHÔNG kích hoạt sale-lock.
- Thêm thống kê `sources` và `pancake_auto_seen` trong API sync.
- Thêm endpoint xem timeline theo `sender_id`.

## Endpoint kiểm tra
- `GET /api/debug/health`
- `GET /api/sync/messenger?limit=5&messages=20`
- `GET /api/sync/messenger/sender/<sender_id>?messages=20`
- `GET /api/debug/latest-conversations?limit=10`
- `GET /api/debug/sender/<sender_id>`

## Ghi chú
- Tin Pancake auto do khách comment được lưu là `role=bot`, `source=pancake_comment_auto`, không khóa bot như sale.
- Tin sale/admin thật được lưu là `role=admin`, `source=messenger_graph_page_admin`, và sẽ khóa bot theo thời gian admin_pause_minutes.
- BOT_REPLY_ENABLED mặc định vẫn phụ thuộc cấu hình hiện tại. Khi chưa ổn định nên để tắt trả lời bot.
