# Hướng dẫn deploy AIGUKA 5.4.0

1. Cài dependency nếu cần:
```bash
npm install
```

2. Kiểm tra cú pháp:
```bash
node --check src/app.js
node --check src/prompts/salesPrompt.js
```

3. Biến môi trường đề xuất:
```env
MESSENGER_CARE_WAIT_MINUTES=45
```

4. Commit/deploy:
```bash
git add .
git commit -m "AIGUKA 5.4.0 Brain OS wholesale messenger care"
git push origin main
```

5. Theo dõi log:
- `V5_MODULAR_REPLY`
- `A4_WHOLESALE`
- `PENDING_REPLY_EXECUTE`
