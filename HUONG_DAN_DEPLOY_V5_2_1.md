# Hướng dẫn triển khai AIGUKA V5.2.1 Gateway Control

## 1. Mô hình sau khi triển khai

```text
Meta Webhook
   ↓
AIGUKA Gateway
https://manychat-openai-6oiq.onrender.com/webhook
   ↓ đọc Supabase server_control
   ├── active_server = none        → không server nào xử lý
   ├── active_server = aiguka      → AIGUKA xử lý local
   └── active_server = aiguka_plus → forward sang AIGUKA-Plus
                                  https://aiguka-plus.onrender.com/webhook
```

Chỉ server active mới được xử lý, ghi Supabase, tạo pending replies và gửi Messenger.

---

## 2. Chạy SQL trong Supabase

Vào Supabase → SQL Editor → dán toàn bộ nội dung file:

```text
SUPABASE_PATCH_V5_2_1.sql
```

Bấm **Run**.

Sau khi chạy xong, kiểm tra:

```sql
SELECT * FROM server_control;
```

Kết quả mong muốn:

```text
id = messenger_primary
active_server = none
```

---

## 3. Cấu hình Environment trên Render

### 3.1. AIGUKA hiện tại - Gateway

Vào Render → service **AIGUKA** → Environment → thêm/sửa:

```env
SERVER_ID=aiguka
FORWARD_URL=https://aiguka-plus.onrender.com/webhook
```

Giữ nguyên các key đang có:

```env
OPENAI_API_KEY
PAGE_ACCESS_TOKEN
VERIFY_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PANCAKE...
```

### 3.2. AIGUKA-Plus - bản ổn định

Vào Render → service **AIGUKA-Plus** → Environment → thêm/sửa:

```env
SERVER_ID=aiguka_plus
```

Không cần `FORWARD_URL` ở AIGUKA-Plus.

---

## 4. Deploy code

### Cách dùng Codespaces

Giải nén zip V5.2.1 vào repository AIGUKA, sau đó chạy:

```bash
git status
git add .
git commit -m "AIGUKA V5.2.1 simple gateway server control"
git push origin main
```

Render sẽ auto deploy.

---

## 5. Không đổi Meta Webhook

Trong Meta Developers vẫn giữ callback cũ:

```text
https://manychat-openai-6oiq.onrender.com/webhook
```

Không trỏ Meta sang AIGUKA-Plus.

---

## 6. Bật server active trong Admin

Mở:

```text
https://manychat-openai-6oiq.onrender.com/admin-v5
```

Tại **Server Control**:

- Bấm **Tắt cả hai** nếu muốn dừng toàn bộ bot.
- Bấm **Bật AIGUKA** nếu muốn server AIGUKA xử lý.
- Bấm **Bật AIGUKA-Plus** nếu muốn server Plus xử lý khách thật.

Khuyến nghị ban đầu:

```text
active_server = none
```

Sau khi kiểm tra xong mới bật:

```text
active_server = aiguka_plus
```

---

## 7. Test sau deploy

### Test 1: Tắt cả hai

Admin → Server Control → Tắt cả hai.

Gửi tin nhắn thử vào page.

Kỳ vọng log AIGUKA có:

```text
[GATEWAY] active_server=none; webhook accepted but not processed
```

Không có bot trả lời.

### Test 2: Bật AIGUKA

Admin → Bật AIGUKA.

Gửi tin nhắn thử.

Kỳ vọng AIGUKA xử lý local, không forward sang Plus.

### Test 3: Bật AIGUKA-Plus

Admin → Bật AIGUKA-Plus.

Gửi tin nhắn thử.

Kỳ vọng:

AIGUKA log:

```text
[GATEWAY] forwarded webhook
```

AIGUKA-Plus log:

```text
WEBHOOK HIT
```

Chỉ AIGUKA-Plus ghi dữ liệu và gửi Messenger.

---

## 8. Quy tắc vận hành

- Không bật xử lý thật ở cả hai con bằng code thủ công.
- Mọi chuyển đổi phải qua `server_control`.
- Nếu test bản mới, deploy vào AIGUKA trước.
- Khi bản ổn, deploy/copy sang AIGUKA-Plus rồi bật Plus làm active.

