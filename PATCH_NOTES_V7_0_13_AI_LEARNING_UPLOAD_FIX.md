# Patch V7.0.13 — AI Learning Upload Fix

## Lỗi đã sửa
- Upload PDF/XLSX/DOCX/ảnh báo `Unexpected token '<', <!DOCTYPE ... is not valid JSON`.
- Frontend trước đây gửi file dạng JSON base64 vào `/learning/upload`, dễ gặp lỗi body quá lớn hoặc backend trả HTML 404/413/500.
- Khi lỗi API không trả JSON, giao diện báo lỗi khó hiểu.
- Không có trạng thái upload khiến người dùng không biết file đang gửi hay đã lỗi.

## Thay đổi
- Thêm endpoint mới: `POST /api/ai-ops/learning/upload-file` dùng `multipart/form-data`.
- Frontend upload bằng `FormData`, không còn base64 JSON cho file lớn.
- Thêm trạng thái upload từng file: đang upload, thành công, thất bại.
- Tăng giới hạn JSON/urlencoded mặc định lên `80mb` để tương thích route cũ.
- Hàm `api()` kiểm tra response text trước khi parse JSON và báo rõ: sai route, backend chưa deploy, body quá lớn hoặc server lỗi.
- Giữ lại route cũ `/learning/upload` để tương thích ngược.

## Biến môi trường tùy chọn
- `LEARNING_UPLOAD_LIMIT_MB=80`
- `JSON_BODY_LIMIT=80mb`

## Lưu ý deploy
Sau deploy, hard refresh trình duyệt bằng Ctrl+F5 để tránh dùng file `ai-operations.html` cũ trong cache.
