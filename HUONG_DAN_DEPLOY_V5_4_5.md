# Hướng dẫn deploy AIGUKA 5.4.5

1. Cài package nếu cần:
```bash
npm install
```

2. Check cú pháp:
```bash
node --check src/app.js
node --check src/prompts/salesPrompt.js
```

3. Commit và deploy:
```bash
git add .
git commit -m "AIGUKA 5.4.5 Pending Executor V2"
git push origin main
```

4. Sau deploy tìm log:
```text
[PENDING_START]
[PENDING_HISTORY_LOADED]
[PENDING_REPLY_EXECUTE]
[PENDING_FALLBACK_SEND]
[PENDING_DONE]
```

Nếu chỉ thấy `[PENDING_START]` mà không thấy `[PENDING_DONE]`, gửi lại log đoạn đó để kiểm tra bước bị dừng.
