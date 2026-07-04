# AIGUKA V7.0.4 - Conversation Learning Backend Complete

## Mục tiêu
Hoàn thiện chức năng **Hội thoại học tập** trong AI Learning Center.

## Đã sửa
- Nút **Tìm hội thoại** không còn chỉ đọc `conversations.json` local.
- Ưu tiên tìm hội thoại production trong Supabase khi `SUPABASE_ENABLED=true`.
- Hỗ trợ tìm theo:
  - SĐT/Zalo
  - tên khách
  - sender_id / PSID
  - conversation id
  - ad id / post id
  - nhóm sản phẩm
  - nội dung tin nhắn
- Load timeline đầy đủ từ bảng `messages`.
- Gửi hội thoại cho OpenAI/Gemini/DeepSeek cùng đánh giá qua cơ chế Compare hiện có.
- Fallback local `conversations.json` và `message_events.json` vẫn được giữ để không mất chức năng cũ.

## API liên quan
- `GET /api/ai-ops/conversations/search?q=...`
- `GET /api/ai-ops/conversations/:id`
- `POST /api/ai-ops/conversations/:id/evaluate`

## Lưu ý deploy
Chức năng tìm hội thoại thật cần Supabase được bật:

```env
SUPABASE_ENABLED=true
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Nếu Supabase tắt hoặc thiếu key, hệ thống vẫn fallback về file local nhưng sẽ không thấy dữ liệu production.
