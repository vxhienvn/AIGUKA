# AIGUKA V7.2.4 - Product Brain Core Fix

Mục tiêu: sửa triệt để lỗi Knowledge có dữ liệu nhưng AI Compare/Bot không vận dụng được.

## Sửa chính

1. Product Brain trả lời trực tiếp
- Thêm `answerProductQuery()` trong `src/ai/productObjectService.js`.
- Khi query có điều kiện sản phẩm như giá, model, kích thước, hệ thống tự lọc Product Object trước.
- Ví dụ: `Có bồn tắm dưới 10 triệu không?` sẽ lọc theo `price < 10000000` thay vì để AI search text mơ hồ.

2. AI Compare dùng Product Brain trước AI Provider
- `/api/ai-ops/compare` gọi Product Brain trước khi gọi OpenAI/Gemini.
- Nếu có kết quả, UI hiển thị panel `Product Brain trả lời trực tiếp` phía trên thẻ OpenAI/Gemini.
- Context gửi vào OpenAI/Gemini có thêm block bắt buộc ưu tiên model/giá/kích thước từ Product Brain.

3. Bot Messenger dùng Product Brain
- `src/app.js` và `src/services/openaiService.js` thêm Product Brain Direct Answer vào prompt trước AI Brain text.
- Khi Product Brain có dữ liệu, bot không được trả lời chung chung là chưa có dữ liệu.

4. Build AI Brain theo batch để tránh 502
- `/learning/brain/build` không còn xử lý 20.000 rows trong một request.
- Chạy theo batch nhỏ, mặc định 120 rows/lần.
- Frontend tự lặp batch đến khi hoàn tất.
- Giảm nguy cơ Render trả HTML 502 / timeout.

## Log mới

- `[PRODUCT_OBJECT_DIRECT_ANSWER]`
- `[AI_COMPARE_CONTEXT_BUILDER]` có `hasDirectAnswer`, `productBrainMatched`
- `[AI_EXPLAIN_PRODUCT_DIRECT_ANSWER]`
- `ai_brain_built_batch`

## Test bắt buộc sau deploy

Trong AI Compare hỏi:

- Có bồn tắm dưới 10 triệu không?
- Cho tôi vài mẫu bồn tắm 1,7m
- AR4162 giá bao nhiêu?

Kết quả đạt: phải hiện panel Product Brain với model/giá/kích thước cụ thể trước phần OpenAI/Gemini.
