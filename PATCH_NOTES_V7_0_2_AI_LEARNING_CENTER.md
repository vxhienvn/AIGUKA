# AIGUKA V7.0.2 — AI Learning Center Active

## Mục tiêu
Tập trung đúng nhu cầu hiện tại: để admin upload tài liệu cho AI tự học có kiểm duyệt, đồng thời vẫn giữ mục dạy kinh nghiệm thực tế cho bot.

## Đã cập nhật

### 1. AI Learning Center trong `/ai-operations`
- Thêm khu vực upload tài liệu.
- Hỗ trợ chọn/kéo thả: PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, MD, JSON, JPG, PNG, WEBP, MP4/MOV.
- Có ô ghi chú để admin hướng dẫn AI đọc tài liệu.
- Upload xong tạo item học trong `ai_learning_items.json` và lưu file vào `ai_learning_uploads/`.

### 2. Kích hoạt chế độ học
- Thêm API:
  - `GET /api/ai-ops/learning/settings`
  - `POST /api/ai-ops/learning/settings`
  - `GET /api/ai-ops/learning/items`
  - `POST /api/ai-ops/learning/upload`
  - `POST /api/ai-ops/learning/item/:id/process`
  - `POST /api/ai-ops/learning/item/:id/status`
- Mặc định bật:
  - `active: true`
  - `autoProcess: true`
  - `requireApproval: true`
  - `targetDays: 7`

### 3. AI tạo bản nháp kiến thức
- Thêm `generateLearningDraft()` trong `providerManager`.
- Ưu tiên Gemini Learning cho ảnh/PDF/OCR/Vision khi Gemini API key hoạt động.
- Các provider có role `learning` có thể tham gia tạo bản nháp.
- Kết quả luôn ở trạng thái chờ duyệt, bot không tự dùng nếu admin chưa approve.

### 4. Giữ mục “Dạy kinh nghiệm cho bot”
- Không xóa phần dạy kinh nghiệm.
- Đây là nơi admin nhập các case thực tế, ví dụ đúng/sai, kinh nghiệm sale.
- Tài liệu sản phẩm và kinh nghiệm sale được tách rõ:
  - Learning Center: học từ tài liệu.
  - Dạy kinh nghiệm: học từ kinh nghiệm thực tế.

### 5. Thêm nút link nhanh trong quản trị
Trên header `/ai-operations` có 2 nút:
- Mở AI Operations: `https://manychat-openai-6oiq.onrender.com/ai-operations`
- Mở Sale Center: `https://manychat-openai-6oiq.onrender.com/admin/sale-center.html`

### 6. Tăng giới hạn body JSON
- `express.json` tăng từ `2mb` lên mặc định `25mb` để upload file dạng base64.
- Có thể chỉnh bằng biến môi trường: `JSON_BODY_LIMIT`.

## Lưu ý vận hành
- File lớn/video lớn nên upload từng file nhỏ trước để tránh vượt giới hạn request của Render.
- DOCX/XLSX hiện được lưu và đưa vào hàng đợi học; phần đọc nội dung sâu sẽ phụ thuộc provider/khả năng xử lý tiếp theo.
- Ảnh/PDF sẽ hiệu quả nhất nếu bật `GEMINI_API_KEY` và role `Learning` cho Gemini.

## Kiểm tra
- Đã kiểm tra cú pháp Node bằng `node -c` cho các file đã sửa.
- Không chạy server local được trong môi trường build này vì chưa cài `node_modules`.
