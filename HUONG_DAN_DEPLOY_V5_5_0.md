# Hướng dẫn deploy AIGUKA 5.5.0

1. Giải nén file zip và thay vào source hiện tại.
2. Cài package nếu cần:

```bash
npm install
```

3. Kiểm tra cú pháp:

```bash
node --check src/app.js
node --check src/services/productSheetService.js
node --check src/services/messengerService.js
node --check src/prompts/salesPrompt.js
```

4. Commit và deploy:

```bash
git add .
git commit -m "AIGUKA 5.5.0 Brain OS Core Guard"
git push origin main
```

## Sau deploy cần xem log

```text
[RESPONSE_VALIDATOR_REWRITE]
[MESSAGE_GATEWAY_SEND_REQUEST]
[MESSAGE_GATEWAY_SEND_RESULT]
```

Nếu khách hỏi giá mà bot vẫn xin SĐT/Zalo, gửi lại log có `[RESPONSE_VALIDATOR_REWRITE]` hoặc đoạn `MESSAGE_GATEWAY` để kiểm tra.
