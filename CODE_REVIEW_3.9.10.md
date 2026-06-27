# CODE REVIEW 3.9.10

## Vấn đề chính đã tìm thấy

1. Echo từ Page/auto-reply có thể bị hiểu nhầm là admin trả lời thủ công.
   Hậu quả: bot set `humanTakeoverUntil` và im lặng 10 phút.

2. Tin “Xin mẫu” bị xử lý sau flow tư vấn/khai thác nhu cầu.
   Hậu quả: một số khách hỏi mẫu không vào PHOTO_RULE đúng nhịp.

3. `isPriceRequest()` được gọi nhưng không tồn tại.
   Hậu quả: khách hỏi giá có thể làm `handleMessage` lỗi runtime.

4. Lỗi gửi ảnh/carousel chưa có fallback riêng.
   Hậu quả: Graph API lỗi có thể làm bot im lặng sau khi khách xin mẫu.

## Sửa trong bản này

- Mặc định tắt admin takeover từ echo, có thể bật lại bằng `AIGUKA_ENABLE_HUMAN_TAKEOVER_ECHO=1`.
- Ưu tiên PHOTO_REQUEST trước các nhánh tư vấn khác.
- Thêm `handleProductMediaRequest()` có log + fallback.
- Thêm `isPriceRequest()`.
- Thêm AI trace để soi chính xác bot dừng ở bước nào.
- Đã chạy `node --check` toàn bộ file JS.

## Test cần làm sau deploy

1. Khách hỏi: `Lavabo này có những mẫu nào?`
2. Khách nhắn tiếp: `Xin mẫu`
3. Log phải có:
   - `AI-01-WEBHOOK`
   - `AI-03-PHOTO-REQUEST`
   - `AI-05-PRODUCT-ROW`
   - `AI-06-PHOTO-RULE`
4. Messenger phải có intro + ảnh/slide hoặc fallback xin Zalo, không được im lặng.
