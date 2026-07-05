# AIGUKA V7.2.1 - AI Brain Build

## Mục tiêu
Bản 7.2.0 mới có form nhập trực tiếp vào AI Brain, nhưng chưa có cơ chế hấp thụ toàn bộ Knowledge/Prompt cũ. V7.2.1 bổ sung đúng phần còn thiếu: **Xây dựng AI Brain từ Knowledge hiện có**.

## Thay đổi chính

### 1. Nút “Xây dựng AI Brain”
Trong tab Knowledge, thêm khối:

- Xây dựng AI Brain từ toàn bộ `learning_segments` hiện có.
- Kiểm tra trạng thái AI Brain.
- Hiển thị tổng segment, đã build, đã hấp thụ, partial, cần OCR/Parser, inactive.

### 2. Backend API mới

- `POST /api/ai-ops/learning/brain/build`
- `GET /api/ai-ops/learning/brain/status`

### 3. Khôi phục segment bị inactive
Các segment cũ từng bị inactive nhưng còn nội dung sẽ được đưa trở lại active và gắn metadata AI Brain.

### 4. Chuẩn hóa AI Brain Object
Mỗi segment được gắn thêm:

- `ai_brain_version: 7.2.1`
- `brain_object_type`
- `knowledge_object`
- `absorption_status`
- `absorption_score_0_100`
- `approved: true`

### 5. Không đổi kiến trúc lớn
Bản này không thay database schema. Chỉ dùng lại `learning_segments` và `ai_learning_settings` để đảm bảo an toàn deploy.

## Cách test

1. Deploy bản 7.2.1.
2. Ctrl + F5 ở AI Operations.
3. Vào Knowledge.
4. Bấm **Xây dựng AI Brain**.
5. Chờ hoàn tất.
6. Bấm **Kiểm tra trạng thái AI Brain**.
7. Test AI Compare bằng câu hỏi từ Knowledge cũ, ví dụ bồn tắm Ares, Navier, quạt vàng 10 cánh.

