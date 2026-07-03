# Hướng dẫn deploy AIGUKA 5.3.1.2

## 1. Kiểm tra cú pháp

```bash
node --check src/app.js
node --check src/prompts/salesPrompt.js
```

## 2. Biến môi trường nên để

```env
MESSENGER_CARE_WAIT_MINUTES=30
AIGUKA_STALE_UNANSWERED_SCAN_MINUTES=5
```

Không bật biến này nếu chưa cần:

```env
AIGUKA_ENABLE_PRE_REPLY_MESSENGER_SYNC=1
```

## 3. Deploy

```bash
git add .
git commit -m "Hotfix 5.3.1.2 pending worker"
git push origin main
```

## 4. Kiểm tra log sau deploy

Tìm các log:

```text
[STALE_UNANSWERED_PENDING_CREATED]
[PENDING_REPLY_EXECUTE]
```

Nếu thấy hai log này nghĩa là worker đã tự rà các tin khách bị bỏ lửng và gọi bot xử lý.
