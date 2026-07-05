# AIGUKA V7.1.1 - Chunked Upload dưới 10MB

## Mục tiêu
Sửa triệt để lỗi PDF lớn tách không đều theo trang. Không nén PDF, không giảm chất lượng ảnh.

## Thay đổi chính
- Bỏ phụ thuộc vào việc tách PDF thành các PDF nhỏ hợp lệ.
- File lớn >10MB sẽ được upload theo chunk nhị phân, mỗi chunk ~8MB.
- Server nhận chunk, ghép lại đúng file gốc rồi mới đưa vào AI Learning.
- Giữ nguyên chất lượng file gốc, phù hợp catalogue có ảnh/chữ nhỏ.
- Thêm endpoint: `POST /api/ai-ops/learning/upload-chunk`.

## Ghi chú
- Nút Tách PDF lớn vẫn còn, nhưng không còn là đường bắt buộc để upload file lớn.
- Với file 85MB, hệ thống sẽ chia upload khoảng 11 chunk, mỗi chunk dưới 10MB.
