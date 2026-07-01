# PATCH NOTES V5.4.1 - Supabase Stale Scanner Hotfix

## Lỗi sửa
Worker cũ chỉ xử lý pending_replies có sẵn và chỉ scan RAM conversations. Sau restart/deploy, RAM trống nên các hội thoại khách đã nhắn 2-3 tiếng trước không được tạo pending và bot không trả lời.

## Đã sửa
- Thêm `scanSupabaseStaleUnansweredConversations()` quét trực tiếp Supabase conversations/messages.
- Nếu tin cuối là customer, chưa có SĐT/Zalo, chưa có pending mở, quá thời gian chờ thì tạo pending mới.
- Thêm hydrate local history từ Supabase trước khi `processPendingReplyRow()` xử lý để tránh bị hủy vì RAM rỗng.
- Log mới:
  - `[SUPABASE_STALE_UNANSWERED_SCAN]`
  - `[SUPABASE_STALE_UNANSWERED_PENDING_CREATED]`
  - `[PENDING_REPLY_EXECUTE]`

## Env gợi ý
```env
AIGUKA_STALE_UNANSWERED_SCAN_MINUTES=5
MESSENGER_CARE_WAIT_MINUTES=45
```

## Kiểm tra
```bash
node --check src/app.js
node --check src/prompts/salesPrompt.js
```
