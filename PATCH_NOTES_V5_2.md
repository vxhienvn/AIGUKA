# AIGUKA V5.2 Gateway Server Control

## Mục tiêu
- Meta chỉ dùng 1 Callback URL.
- AIGUKA và AIGUKA-Plus có thể chạy song song.
- Supabase quyết định server nào được xử lý thật qua `server_control.active_server`.
- Server không active sẽ không xử lý webhook, không ghi Supabase, không gửi Messenger, không chạy pending/follow-up.

## Biến môi trường cần đặt

### AIGUKA
```env
SERVER_ID=aiguka
AIGUKA_PLUS_FORWARD_URL=https://aiguka-plus.onrender.com
GATEWAY_FORWARD_ENABLED=true
```

### AIGUKA-Plus
```env
SERVER_ID=aiguka_plus
AIGUKA_FORWARD_URL=https://manychat-openai-6oiq.onrender.com
GATEWAY_FORWARD_ENABLED=true
```

Cả hai nên có cùng Supabase/OpenAI/Page token như hiện tại.

## Admin
Mở `/admin-v5`, mục Server Control:
- Tắt cả hai
- Bật AIGUKA
- Bật AIGUKA-Plus

## API
- `GET /api/server-control`
- `POST /api/server-control/active` body: `{ "active_server": "aiguka_plus" }`

## SQL
Chạy `SUPABASE_PATCH_V5_2.sql` trước khi bật.
