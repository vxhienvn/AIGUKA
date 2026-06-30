# AIGUKA 4.2.0 - Universal Sync Engine

Bản này triển khai cơ chế Messenger là nguồn dữ liệu gốc để giảm lỗi thiếu log admin/sale và chống bot cướp lời sale.

## Thay đổi chính

- Thêm `AIGUKA_VERSION = 4.2.0-universal-sync-engine`.
- Thêm Messenger Graph Sync Engine:
  - `GET/POST /api/sync/messenger?limit=10&messages=20`
  - `GET/POST /api/sync/messenger/sender/:senderId?messages=20`
- Trước khi bot gửi tin, hệ thống tự đồng bộ nhanh hội thoại Messenger theo `senderId` để phát hiện sale/Pancake vừa nhắn.
- Nếu sync thấy tin từ Page/admin mới, bot tự kích hoạt human takeover và chặn trả lời.
- Chống ghi trùng message bằng `external_message_id` khi webhook, Pancake sync và Messenger sync cùng thấy một tin.
- Ghi `source = messenger_graph_sync` cho tin đồng bộ từ Messenger.
- Bot gửi qua API sẽ lưu thêm `external_message_id` từ Facebook send result.
- Debug health hiển thị version 4.2.0.

## Biến môi trường mới

```env
MESSENGER_SYNC_ENABLED=true
```

Mặc định bật. Nếu Graph API thiếu quyền đọc conversation, endpoint sync sẽ báo lỗi rõ ràng nhưng webhook cũ vẫn chạy.

## Sau deploy cần test

1. Mở:
   `/api/debug/health`

2. Đồng bộ Messenger gần nhất:
   `/api/sync/messenger?limit=5&messages=20`

3. Kiểm tra hội thoại:
   `/api/debug/latest-conversations?limit=5`

4. Test sale nhắn từ Pancake/Meta rồi gọi:
   `/api/sync/messenger/sender/<sender_id>?messages=20`

Nếu thấy `role: admin` hoặc `source: messenger_graph_sync`, sale-lock sẽ có dữ liệu để chặn bot.

## Lưu ý

- Bản này giữ nút bật/tắt bot hiện có.
- Không bật mặc định nếu `BOT_REPLY_ENABLED=false` trên Render.
- Nếu Meta Page token không có quyền đọc `/me/conversations`, cần cấp quyền Page/Messenger phù hợp trong Meta App.
