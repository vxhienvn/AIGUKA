# Hướng dẫn deploy AIGUKA 5.5.1

1. Giải nén đè lên source hiện tại.
2. Chạy kiểm tra:

```bash
node --check src/app.js
node --check src/prompts/salesPrompt.js
```

3. Commit và deploy:

```bash
git add .
git commit -m "AIGUKA 5.5.1 specific product need guard"
git push origin main
```

4. Sau deploy, theo dõi log:

```text
[RESPONSE_VALIDATOR_REWRITE]
[MESSAGE_GATEWAY_SEND_REQUEST]
[MESSAGE_GATEWAY_SEND_RESULT]
```
