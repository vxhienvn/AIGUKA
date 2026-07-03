# PATCH NOTES V5.5.1 - Specific Product Need Guard

## Mục tiêu
Sửa lỗi khách đã nói rõ sản phẩm/cấu hình cụ thể nhưng bot vẫn trả lời ngớ ngẩn như hỏi bảo hành hoặc hỏi lại nhu cầu chung chung.

## Lỗi thực tế
- Khách: "xin thông tin mẫu quạt 8 cánh, và giá"
- Bot: trả lời sang bảo hành.
- Khách: "quạt mát, êm, chất liệu cánh không phải bằng kim loại"
- Bot: xin thêm nhu cầu/SĐT kiểu chung chung, không dùng thông tin khách vừa cung cấp.

## Đã sửa
- Thêm `isSpecificProductConfiguredNeed()` nhận diện nhu cầu cụ thể: quạt 8/10 cánh, pha lê, cánh không kim loại, chất liệu, gió mát, chạy êm, model/brand/kích thước.
- Thêm `buildSpecificProductContactReply()` để trả lời đúng: xác nhận đúng cấu hình khách vừa nói, rồi xin SĐT/Zalo để gửi đúng album/video và báo khoảng giá chi tiết.
- Thêm guard: nếu khách không hỏi bảo hành mà câu trả lời có "bảo hành" thì rewrite.
- Không chặn xin SĐT/Zalo trong case khách đã nêu sản phẩm/cấu hình cụ thể, vì lúc này xin liên hệ để gửi đúng mẫu/báo giá là hợp lý.
- Làm chặt lại nhận diện `ask_warranty`, tránh nhầm mô tả sản phẩm thành hỏi bảo hành.

## Kiểm tra
- `node --check src/app.js`
