# Hướng dẫn deploy AIGUKA 6.0.0 Foundation

1. Giải nén ZIP và copy toàn bộ source lên repo hiện tại.
2. Cài dependencies nếu cần:
```bash
npm install
```
3. Kiểm tra cú pháp:
```bash
node --check src/app.js
node --check src/prompts/salesPrompt.js
node --check src/sales/salesEngine.js
```
4. Commit và deploy:
```bash
git add .
git commit -m "AIGUKA 6.0.0 Brain OS Foundation"
git push origin main
```
5. Sau deploy, theo dõi log:
```text
[MESSAGE_GATEWAY_SEND_REQUEST]
[MESSAGE_GATEWAY_SEND_RESULT]
[MESSAGE_GATEWAY_BLOCK_DUPLICATE_LOCK]
[RESPONSE_VALIDATOR_REWRITE]
```
