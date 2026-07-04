# AIGUKA V7.0.1 - Context Builder V2 + Multi AI Roles

Ngày cập nhật: 04/07/2026

## Mục tiêu
Tập trung đúng các yêu cầu cốt lõi đã chốt, không mở rộng quá mức:

1. Multi AI: OpenAI / Gemini / DeepSeek có các vai trò độc lập: Active, Monitor, Learning, Evaluate, Propose.
2. Chỉ một nền tảng được Active để trả lời khách.
3. Các nền tảng còn lại vẫn có thể giám sát, chấm điểm, học và đề xuất.
4. Tối ưu lỗi lớn nhất: bot nhận diện sai sản phẩm / sai intent / hỏi lại điều đã biết.

## Thay đổi chính

### 1. Multi AI Roles
Mỗi provider có 5 role:

- `active`: được quyền tạo câu trả lời gửi khách.
- `monitor`: giám sát lỗi hội thoại.
- `learning`: dùng cho luồng học tài liệu/kinh nghiệm.
- `evaluate`: chấm điểm câu trả lời/hội thoại.
- `propose`: đề xuất câu tốt hơn, kinh nghiệm mới hoặc hướng xử lý.

File thay đổi:

- `src/ai/providerManager.js`
- `src/routes/aiOperationsRoutes.js`
- `public/ai-operations.html`

### 2. UI AI Operations mới
Trang `/ai-operations` đã đổi thành bảng điều khiển dễ hiểu hơn:

- Mỗi provider có 5 công tắc role.
- Có preset ACTIVE / MONITOR / OFF.
- Cảnh báo nếu không có đúng 1 provider Active.
- Vẫn giữ Compare, Mentor Teach, Monitor Reports.

### 3. Context Builder V2
Thêm module mới:

- `src/ai/contextBuilderV2.js`

Module này đọc lịch sử hội thoại và tạo context chuẩn trước khi gọi AI:

- Tin khách mới nhất.
- Intent: hỏi giá, xin mẫu, hỏi địa chỉ, bảo hành, tư vấn...
- Sản phẩm gợi ý + điểm tin cậy.
- Tín hiệu quảng cáo/lịch sử.
- Knowledge sản phẩm từ Product Sheet nếu có.
- Có SĐT/Zalo chưa.
- Sale đã gọi/đang chăm chưa.
- Hành động khuyến nghị: không hỏi lại sản phẩm, báo giá trước, gửi slide, không xin lại số...

Context này được đưa vào prompt ở `getAIReply()` để giảm lỗi:

- Khách hỏi giá nhưng bot không báo giá.
- Khách xin xem mẫu nhưng bot không gửi slide.
- Khách nói rõ sản phẩm nhưng bot hỏi lại.
- Sale đã gọi/đã có số nhưng bot vẫn follow-up/xin lại số.

### 4. Model mặc định mới
Đã đổi fallback mặc định:

- OpenAI: `gpt-5.4-mini`
- Gemini: `gemini-2.5-flash`
- DeepSeek: `deepseek-chat`

Vẫn ưu tiên biến môi trường:

```env
OPENAI_MODEL=...
GEMINI_MODEL=...
DEEPSEEK_MODEL=...
```

## Không thay đổi

Các chức năng cũ được giữ nguyên:

- Webhook Messenger.
- Sale Center.
- Lead Check.
- Pancake routes.
- Product Sheet / Drive service.
- Bot reply switch.
- Các guard hiện tại trong Message Gateway.

## Ghi chú deploy

Sau deploy, vào:

`/ai-operations`

Thiết lập gợi ý:

- OpenAI: Active ON, Monitor ON, Learning ON, Evaluate ON, Propose ON.
- Gemini: Active OFF, Monitor ON, Learning ON, Evaluate ON, Propose ON.
- DeepSeek: Active OFF, Monitor ON, Learning ON, Evaluate ON, Propose ON.

Nếu Gemini hoặc DeepSeek thiếu API key, role bật vẫn hiển thị nhưng provider sẽ không chạy cho đến khi key được cấu hình.

## Kiểm tra đã chạy

- `node -c src/ai/providerManager.js`
- `node -c src/ai/contextBuilderV2.js`
- `node -c src/routes/aiOperationsRoutes.js`
- `node -c src/app.js`

Không chạy được server local đầy đủ vì môi trường kiểm tra không có `node_modules`.
