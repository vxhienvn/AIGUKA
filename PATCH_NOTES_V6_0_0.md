# AIGUKA 6.0.0 Foundation - Promptmo + Rule Guard

## Mục tiêu
Chuyển từ vá prompt lẻ sang Brain OS có luật: prompt vẫn diễn đạt mềm, nhưng Message Gateway và Response Validator kiểm tra cứng trước khi gửi.

## Sửa chính
- Thêm Brain Handbook v3.0 Foundation vào `brain-os/`.
- Chuẩn hóa ngôn ngữ: dùng `em/bên em`, loại bỏ `sale showroom`, `sale bên em`, `đội sale`, `bộ phận kinh doanh`, `hệ thống sẽ`.
- Hỏi giá theo sản phẩm/nhóm sản phẩm: trả lời có nhiều mẫu/phân khúc và xin SĐT/Zalo để bên em gửi đúng mẫu + báo giá trực tiếp.
- Sản phẩm/cấu hình cụ thể như quạt 8 cánh, pha lê, combo vệ sinh, bồn tắm: không hỏi lan man, không tự nói bảo hành nếu khách không hỏi.
- Pending Executor kiểm tra thời điểm gửi thật, không đánh dấu DONE rỗng khi workflow chỉ ghi lịch sử nhưng không gửi được tin.
- Message Gateway bổ sung duplicate lock trong RAM để tránh gửi lặp 5-10 tin giống nhau trong một conversation.
- Response Validator rewrite các câu lệch sản phẩm, hỏi giá nhưng nói bảo hành/động cơ/công suất, hoặc còn dùng từ cấm.

## Log cần theo dõi
- `[MESSAGE_GATEWAY_SEND_REQUEST]`
- `[MESSAGE_GATEWAY_SEND_RESULT]`
- `[MESSAGE_GATEWAY_BLOCK_DUPLICATE_LOCK]`
- `[RESPONSE_VALIDATOR_REWRITE]`
- `[PENDING_FALLBACK_SEND]`
- `[PENDING_DONE]`
