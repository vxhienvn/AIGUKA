# PATCH NOTES V7.0.16 — Upload Guard & Status

## Mục tiêu
Sửa lỗi upload file lớn bị treo lâu, không có trạng thái, backend/Render trả HTML 520 thay vì JSON.

## Đã sửa
- Frontend kiểm tra dung lượng file trước khi upload.
- File > 30MB sẽ bị chặn upload trực tiếp và báo rõ: cần tách/nén trước.
- PDF 20–30MB có cảnh báo rủi ro.
- Thêm trạng thái rõ ràng: kiểm tra trước upload, đang upload, đã upload, lỗi và gợi ý xử lý.
- Backend kiểm tra `Content-Length` trước khi đọc body để trả JSON 413 thay vì để Render/proxy trả HTML 520.
- Nếu backend trả HTML/sai JSON, frontend hiển thị gợi ý thay vì báo lỗi khó hiểu.

## Lưu ý
Bản này chưa tách file tự động. Mục tiêu là chặn lỗi treo/520 trước. Công cụ tách/nén file sẽ làm ở bản sau nếu cần.
