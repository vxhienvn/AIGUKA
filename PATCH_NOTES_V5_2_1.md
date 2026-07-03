# AIGUKA V5.2.1 - Simple Gateway Server Control

## Mục tiêu

Meta chỉ dùng **1 webhook duy nhất**. AIGUKA Gateway đọc bảng `server_control` trong Supabase để quyết định server nào được xử lý thật.

- `active_server = none`: cả hai tắt, chỉ nhận webhook/log nhẹ.
- `active_server = aiguka`: AIGUKA xử lý local.
- `active_server = aiguka_plus`: AIGUKA Gateway forward nguyên webhook sang AIGUKA-Plus.

## Điểm khác V5.2.0

V5.2.1 đơn giản hóa theo đúng vận hành hiện tại:

- Chưa dùng heartbeat.
- Chưa dùng auto failover.
- Không cần cấu hình vòng tròn 2 chiều.
- Chỉ cần AIGUKA làm Gateway, AIGUKA-Plus làm server ổn định.

## Biến môi trường cần thêm

### AIGUKA Gateway

```env
SERVER_ID=aiguka
FORWARD_URL=https://aiguka-plus.onrender.com/webhook
```

### AIGUKA-Plus

```env
SERVER_ID=aiguka_plus
```

Các biến API/Supabase/OpenAI vẫn copy như hiện tại.

## Supabase

Chạy file:

```text
SUPABASE_PATCH_V5_2_1.sql
```

Sau khi chạy, mặc định:

```text
active_server = none
```

Vào `/admin-v5` để chọn server active.

## URL Meta Webhook

Giữ nguyên URL trong Meta:

```text
https://manychat-openai-6oiq.onrender.com/webhook
```

Không cần trỏ Meta trực tiếp sang AIGUKA-Plus.

## Log cần kiểm tra

Khi chọn Plus active, AIGUKA log sẽ có:

```text
[GATEWAY] forwarded webhook
```

AIGUKA-Plus log sẽ có:

```text
WEBHOOK HIT
```

Khi server không active:

```text
[SERVER_CONTROL] inactive skip
```

