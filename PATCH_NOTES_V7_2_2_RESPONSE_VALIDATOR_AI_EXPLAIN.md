# AIGUKA V7.2.2 - Response Validator + AI Explain

## Mục tiêu
Bổ sung lớp kiểm soát cuối trước khi gửi Messenger và lớp quan sát đường đi câu trả lời để debug lỗi bot trả lời sai/rỗng.

## Đã sửa

### 1. Chặn tin nhắn rỗng trước khi gửi Facebook
- Nếu AI sinh `""`, `null`, `undefined` hoặc text trắng, hệ thống không gửi payload rỗng sang Meta nữa.
- Tự tạo fallback an toàn theo ngữ cảnh gần nhất.
- Log mới: `[MESSAGE_GATEWAY_BLOCK_EMPTY_TEXT]`.

### 2. Response Validator
- Thêm `validateFinalBotReply()` cho luồng AI reply chính.
- Nếu provider trả rỗng, tự fallback và log rõ: `[RESPONSE_VALIDATOR_EMPTY_REPLY]`.

### 3. AI Brain Context vào bot Messenger
- Luồng `getAIReply()` trong `src/app.js` đã kéo thêm AI Brain Context trực tiếp từ `learning_segments`.
- Prompt Messenger có thêm khối `AI BRAIN - TRI THỨC DOANH NGHIỆP ĐÃ HẤP THỤ`.

### 4. AI Explain / Observability
- Log mới `[AI_BRAIN_LOOKUP]`: query preview, tokens, số kết quả, top object.
- Log mới `[AI_EXPLAIN_BRAIN_CONTEXT]`: bot có lấy được AI Brain Context không, độ dài context.
- Log mới `[AI_EXPLAIN_REPLY_BUILT]`: độ dài reply, có dùng fallback không, provider có cảnh báo đỏ không.

## Ý nghĩa
Khi bot trả lời sai, giờ có thể xem log để biết lỗi nằm ở:
- Brain lookup không có dữ liệu.
- Context không được đưa vào prompt.
- Provider trả rỗng.
- Response Validator fallback.
- Message Gateway gửi sang Meta.

## Lưu ý
Bản này không đổi kiến trúc lớn. Đây là lớp an toàn và quan sát cho kiến trúc AI Brain V7.2.
