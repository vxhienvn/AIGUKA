# PATCH NOTES V7.0.15 - Knowledge Absorption

## Mục tiêu

Chuyển Knowledge từ trạng thái "đã lưu/đã duyệt" sang trạng thái "AI đã hấp thụ được hay chưa".

Knowledge vẫn là thư viện dữ liệu, nhưng sau khi admin duyệt, AI Comparison sẽ chạy thêm bước hấp thụ để rút ra:

- AI hiểu được gì từ tài liệu.
- Sản phẩm/nhóm sản phẩm phát hiện được.
- FAQ tư vấn có thể dùng.
- Những thông tin còn thiếu.
- Điểm hấp thụ 0-100.
- Trạng thái: `absorbed`, `partial`, `needs_extraction`.

## Thay đổi chính

### 1. Bổ sung Knowledge Absorption

Khi bấm **Duyệt vào Knowledge**, hệ thống không chỉ mở khóa segment nữa mà còn chạy:

```text
Approved Knowledge
↓
AI Comparison / Learning Provider
↓
Digest / Self-test
↓
Absorption metadata
↓
Bot Search Context
```

Metadata hấp thụ được lưu trong `learning_segments.attributes` và `ai_learning_documents.metadata.knowledge_absorption`.

Không cần tạo bảng mới để tránh làm rối schema.

### 2. Dashboard Knowledge hiển thị trạng thái hấp thụ

Trong tab Knowledge, mỗi item có badge:

- Đã hấp thụ
- Hấp thụ một phần
- Cần trích xuất/OCR
- Chưa hấp thụ

Có nút **Hấp thụ lại** cho từng tài liệu.

### 3. Search Knowledge dùng dữ liệu đã hấp thụ

`buildLearningContext()` ưu tiên đưa vào prompt:

- Raw text gốc.
- Tóm tắt AI đã hấp thụ.
- Nhóm sản phẩm.
- Danh sách sản phẩm phát hiện.
- Điểm/trạng thái hấp thụ.

Điều này giúp AI không chỉ "tra cứu text", mà còn dùng phần đã tiêu hóa.

### 4. Search fallback tốt hơn

Khi hỏi từ khóa như `Navier`, nếu `text_value` không match trực tiếp, hệ thống sẽ fallback lọc metadata như filename/category/product_group để tránh lỗi "có file nhưng AI không tìm thấy".

### 5. Tự đánh dấu file rỗng

Nếu tài liệu chỉ có tên file/ghi chú mà không có nội dung thật, hệ thống đánh dấu `needs_extraction`, không cho hiểu nhầm là AI đã học xong.

## API mới

```http
POST /api/ai/learning/knowledge/:documentId/absorb
```

Chạy hấp thụ lại một tài liệu đã duyệt.

```http
POST /api/ai/learning/knowledge/absorb-all
```

Chạy hấp thụ hàng loạt cho các tài liệu đã duyệt chưa có absorption metadata.

Body mẫu:

```json
{
  "onlyMissing": true,
  "limit": 50
}
```

## Lưu ý

- Bản này không mở rộng thêm module mới.
- Không đổi giao diện tổng thể.
- Không tạo bảng mới.
- Không phá Knowledge cũ.
- Mục tiêu duy nhất: để Knowledge sau khi duyệt có bước "AI hấp thụ" và có thể kiểm chứng.
