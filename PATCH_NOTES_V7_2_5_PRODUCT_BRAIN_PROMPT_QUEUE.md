# AIGUKA V7.2.5 - Product Brain Prompt Injection + Safe Build Batch

Mục tiêu: hoàn thiện phần còn thiếu của V7.2 để Product Brain không chỉ hiển thị trên UI mà thực sự được Bot/AI Compare dùng khi trả lời.

## Đã sửa

1. Product Resolver lọc cứng theo điều kiện dữ liệu có cấu trúc:
   - Câu hỏi "dưới 10 triệu" chỉ lấy sản phẩm có `price <= 10.000.000`.
   - Câu hỏi theo model chỉ lấy đúng model/alias.
   - Câu hỏi theo kích thước chỉ lấy sản phẩm gần kích thước mục tiêu.

2. Bot Messenger ưu tiên trả lời trực tiếp bằng Product Brain khi đã tìm thấy sản phẩm rõ ràng.
   - Tránh LLM bỏ qua context rồi trả lời chung chung.
   - Có thể tắt bằng env: `PRODUCT_BRAIN_DIRECT_REPLY=false`.

3. AI Compare được chèn Product Brain vào prompt mạnh hơn.
   - Nếu Product Brain có model/giá/kích thước thì provider không được nói "chưa có dữ liệu".

4. Build AI Brain giảm batch xuống tối đa 25 record/lượt.
   - Tránh request 502/timeout trên Render.
   - UI cũng gọi batch 25.

## Log mới/quan trọng

- `[PRODUCT_OBJECT_RESOLVER]`
- `[PRODUCT_OBJECT_DIRECT_ANSWER]`
- `[PRODUCT_BRAIN_DIRECT_REPLY_USED]`
- `[AI_COMPARE_CONTEXT_BUILDER]`

## Test bắt buộc

- Có bồn tắm dưới 10 triệu không?
- Cho tôi vài mẫu bồn tắm 1,7m
- AR4162 giá bao nhiêu?
