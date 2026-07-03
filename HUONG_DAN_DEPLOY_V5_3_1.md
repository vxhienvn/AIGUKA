# Hướng dẫn deploy AIGUKA 5.3.1

1. Upload toàn bộ source như các bản trước.
2. Cài dependency nếu cần:
```bash
npm install
```
3. Kiểm tra cú pháp:
```bash
node --check src/app.js
node --check src/prompts/salesPrompt.js
```
4. Biến môi trường mới tùy chọn:
```env
MESSENGER_CARE_WAIT_MINUTES=20
```
5. Deploy lên server hiện tại.

## Lưu ý vận hành
- Nếu khách đã từng cho số/Zalo, bot mặc định không tự trả lời tiếp trên Messenger.
- Nếu khách không cho số sau khi được xin, sau khoảng chờ bot có thể chăm tiếp trên Messenger.
- Nếu khách click quảng cáo mới, session mới sẽ ưu tiên quảng cáo hiện tại hơn lịch sử cũ.
