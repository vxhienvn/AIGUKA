# PATCH NOTES V5.5.0 - Brain OS Core Guard

## Mục tiêu
Sửa nhóm lỗi gốc khi AIGUKA trả lời sai ngữ cảnh hoặc xin SĐT/Zalo quá sớm.

## Thay đổi chính

### 1. Context Resolver V2
- Tin nhắn mới nhất của khách có ưu tiên cao nhất.
- Nếu khách hỏi combo/bồn tắm/gạch/Inax/quạt... thì topic hiện tại được khóa lại theo chính tin nhắn đó.
- Tránh lỗi khách hỏi combo nhưng bot trả lời quạt, khách hỏi bồn tắm nhưng bot trả lời combo.

### 2. Response Validator
- Tất cả tin nhắn trước khi gửi qua Messenger đều được kiểm tra lần cuối.
- Nếu reply nhắc sai nhóm sản phẩm so với nhu cầu mới nhất của khách, hệ thống tự rewrite.
- Nếu khách hỏi giá mà reply xin SĐT/Zalo, hệ thống tự rewrite sang câu trả lời chăm trên Messenger.

### 3. Price Inquiry Policy
- Khách hỏi giá: trả lời khoảng giá/thang phân khúc, không xin SĐT/Zalo ngay.
- Không gửi ảnh khi khách chỉ hỏi giá.
- Không báo giá cụ thể từng mẫu nếu không chốt từ dữ liệu.

### 4. Value Before Ask
- Khi khách vừa cung cấp thêm nhu cầu, bot phải dùng thông tin đó để tư vấn tiếp.
- Không bỏ qua nhu cầu mới rồi xin SĐT/Zalo.

### 5. Tắt Welcome Slide mặc định
- Không gửi ảnh/slide như lời chào.
- Chỉ gửi khi khách xin mẫu/ảnh/catalog rõ ràng.

## Log mới cần theo dõi
- `[RESPONSE_VALIDATOR_REWRITE]`: tin nhắn bị rewrite do xin số sai thời điểm hoặc sai sản phẩm.
- `[MESSAGE_GATEWAY_SEND_REQUEST]`
- `[MESSAGE_GATEWAY_SEND_RESULT]`

## Kiểm tra cú pháp
- `node --check src/app.js`
- `node --check src/services/productSheetService.js`
- `node --check src/services/messengerService.js`
- `node --check src/prompts/salesPrompt.js`
