# DEPLOY V7.4.2 - Conversation Sync Engine Hotfix

## Mục tiêu
Khắc phục lỗi cốt lõi: Supabase chỉ có một phần hội thoại vì hệ thống cũ chủ yếu lưu tin nhắn từ webhook, chưa đồng bộ full history từ Messenger Graph.

## Thay đổi chính

### 1. Sync Messenger có phân trang thật
- `/api/sync/messenger?limit=50&messages=500`
- Lấy danh sách conversation từ Graph API bằng paging.
- Với mỗi conversation, gọi tiếp `/{conversation-id}/messages` và paging đến tối đa `messages` tin.
- Không còn chỉ lấy `messages.limit(20)` trong field expand.

### 2. Sync theo sender_id mạnh hơn
- `/api/sync/messenger/sender/:senderId?messages=500`
- Dùng `user_id` để tìm thread; fallback quét nhiều thread gần nhất.
- Lấy full messages bằng endpoint riêng và paging.

### 3. Sync theo conversation_id
- `/api/sync/messenger/conversation/:conversationId?messages=1000`
- Dùng khi đã biết thread/conversation id từ Graph hoặc debug.

### 4. Cho phép sync ghi Supabase kể cả active server đang OFF
- `logMessageToSupabase` có thêm `bypassActiveServerGuard`.
- Chỉ áp dụng cho Messenger Graph Sync.
- Mục đích: tắt bot vẫn sync được dữ liệu, không gửi tin nhắn.

## Cách test nhanh

1. Tắt bot trả lời nếu cần.
2. Deploy bản này.
3. Mở:

```text
/api/debug/health
```

4. Chạy sync gần nhất:

```text
/api/sync/messenger?limit=50&messages=500
```

5. Chạy sync theo khách nếu biết sender_id:

```text
/api/sync/messenger/sender/<SENDER_ID>?messages=500
```

6. Kiểm tra lại:

```text
/api/debug/search-messages?q=<tên hoặc số điện thoại>&limit=50
```

## ENV cần có

```env
PAGE_ACCESS_TOKEN=...
PAGE_ID=...                 # khuyến nghị có, tránh phân loại nhầm page/customer
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
MESSENGER_SYNC_ENABLED=true
```

## Lưu ý
- Sync này chỉ đọc/lưu dữ liệu. Không gọi OpenAI/Gemini. Không gửi tin nhắn cho khách.
- Nếu Graph API trả lỗi quyền, kiểm tra token có quyền `pages_messaging`, `pages_show_list`, `pages_read_engagement` và token thuộc đúng Page.
