# AIGUKA V7.4.3 - Conversation Sync Engine SAFE TEST

Mục tiêu bản này: test đồng bộ hội thoại từ Meta/Messenger vào Supabase mà KHÔNG để bot gửi tin nhắn thật cho khách.

## Thay đổi quan trọng

1. `ALLOW_BOT_OUTBOUND=false` mặc định: chặn mọi đường gửi Messenger ở tầng cuối cùng, kể cả `force`, template/carousel/image.
2. `BOT_REPLY_ENABLED=false` mặc định cho bản test sync.
3. Sửa lỗi hotline/số điện thoại bị làm mềm thành “khoảng 973-974 triệu”.
4. Thêm chặn câu trả lời nguy hiểm chứa “900 triệu”, “1 tỷ”, hoặc hotline đi kèm đơn vị giá.
5. Giữ Conversation Sync Engine để test tải lịch sử hội thoại.

## ENV khuyến nghị khi test

```env
ALLOW_BOT_OUTBOUND=false
BOT_REPLY_ENABLED=false
SUPABASE_ENABLED=true
```

Không đặt `ALLOW_BOT_OUTBOUND=true` khi chưa test xong.

## Test sync sau deploy

```text
/api/sync/messenger?limit=20&messages=200
/api/sync/messenger/sender/<SENDER_ID>?messages=500
/api/sync/messenger/conversation/<CONVERSATION_ID>?messages=1000
```

## Khi nào mới bật trả lời thật?

Chỉ khi đã xác nhận:
- timeline sync đủ,
- không còn câu báo giá 900 triệu/1 tỷ,
- dashboard bot switch hoạt động đúng.

Sau đó mới set:

```env
ALLOW_BOT_OUTBOUND=true
BOT_REPLY_ENABLED=true
```

