# Hướng dẫn deploy AIGUKA 5.4.1

1. Cài package nếu cần:
```bash
npm install
```

2. Kiểm tra cú pháp:
```bash
node --check src/app.js
node --check src/prompts/salesPrompt.js
```

3. Commit và deploy:
```bash
git add .
git commit -m "Hotfix 5.4.1 Supabase stale unanswered scanner"
git push origin main
```

4. Sau deploy, xem log tìm:
```text
[SUPABASE_STALE_UNANSWERED_SCAN]
[SUPABASE_STALE_UNANSWERED_PENDING_CREATED]
[PENDING_REPLY_EXECUTE]
```

Nếu chỉ thấy `Durable pending worker processed` mà không có `SUPABASE_STALE_UNANSWERED_SCAN`, nghĩa là chưa deploy đúng bản 5.4.1.
