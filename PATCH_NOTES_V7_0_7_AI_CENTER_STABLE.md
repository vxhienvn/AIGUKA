# AIGUKA V7.0.7 – AI Center Stable

## Mục tiêu
Chuẩn hóa AI Center theo phạm vi đã chốt: không mở rộng thừa, tập trung làm AI Center dễ dùng, dễ kiểm tra lỗi, không để Gemini/DeepSeek làm treo toàn bộ giao diện.

## Cập nhật chính

### 1. Điều hướng Admin
- Thêm liên kết nhanh **AI Center** vào trang Admin.
- Thêm liên kết nhanh **Lịch Sale / Chế độ Bot** vào trang Admin.
- Trên AI Center giữ sidebar trái, bỏ dãy tab ngang trùng chức năng.

### 2. AI Compare đồng bộ với Hội thoại học tập
- AI Compare dùng cùng chuẩn card hiển thị với Hội thoại học tập.
- Kết quả OpenAI/Gemini/DeepSeek hiển thị dạng report card, không còn dạng text/log thô.
- Có nút ẩn/hiện từng nền tảng, đặc biệt hữu ích khi DeepSeek hết quota.
- Card tự chia lại không gian khi ẩn bớt nền tảng.

### 3. Timeout riêng từng nền tảng
Thêm cấu hình timeout qua biến môi trường:

```env
OPENAI_TIMEOUT_MS=20000
GEMINI_TIMEOUT_MS=45000
DEEPSEEK_TIMEOUT_MS=30000
AI_COMPARE_TIMEOUT_MS=60000
AI_LEARNING_TIMEOUT_MS=60000
GEMINI_RETRY=1
```

- Gemini không còn bị giới hạn cứng 10 giây ở AI Compare.
- Gemini được retry 1 lần nếu timeout.
- DeepSeek lỗi quota không làm các nền tảng khác ngừng hoạt động.

### 4. Thanh trạng thái / Task Progress
- Thêm thanh trạng thái cho thao tác tìm hội thoại, đồng bộ nhanh, AI Compare, đánh giá hội thoại.
- Có danh sách bước: kết nối dữ liệu, tìm Supabase/cache, gửi OpenAI/Gemini/DeepSeek, tạo AI Consensus.
- Có nhật ký xử lý để biết đang kẹt ở bước nào.

### 5. Đồng bộ nhanh hội thoại mới
- Thêm nút **Đồng bộ mới** ở Hội thoại học tập.
- Endpoint mới: `POST /api/ai-ops/conversations/sync-quick`
- Endpoint này gọi lại các luồng sync có sẵn nếu server production đã cấu hình Meta/Pancake.

### 6. AI Consensus chỉnh sửa được
- AI Consensus chuyển thành ô văn bản có thể sửa.
- Admin/Sale có thể điều chỉnh nội dung trước khi lưu thành kinh nghiệm.
- Có nút khôi phục bản AI gốc.
- Bot chỉ học nội dung đã được admin/sale duyệt.

### 7. AI cần bạn hôm nay có thể click
- Các ô thống kê có thể bấm được.
- Tài liệu chờ duyệt → Chờ duyệt.
- Cần xử lý / Nhận diện yếu → AI đang học.
- Kinh nghiệm chờ áp dụng → Dạy kinh nghiệm.
- Knowledge đã duyệt → Knowledge.

### 8. AI Diagnostics
- Thêm tab **AI Diagnostics**.
- Test từng nền tảng: OpenAI/Gemini/DeepSeek.
- Kiểm tra Chat và Compare.
- Hiển thị rõ: thiếu key, timeout, hết quota, lỗi model/API.

### 9. DeepSeek model mặc định
- Fallback mặc định đổi từ `deepseek-chat` sang `deepseek-v4-flash`.
- Nếu tài khoản đang hết tiền, lỗi 402 vẫn cần xử lý bằng nạp credit hoặc đổi API key.

## File thay đổi
- `public/ai-operations.html`
- `public/v5-admin.html`
- `src/ai/providerManager.js`
- `src/routes/aiOperationsRoutes.js`

## Kiểm tra cú pháp
- `node -c src/ai/providerManager.js`
- `node -c src/routes/aiOperationsRoutes.js`
- `node -c src/app.js`
