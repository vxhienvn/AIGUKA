# PATCH V7.0.17 - AI Center JS Fix

## Lý do
Bản V7.0.16 có lỗi cú pháp JavaScript trong `public/ai-operations.html` tại phần upload guard. Lỗi này làm toàn bộ script của AI Center không chạy, dẫn đến Multi AI / AI Compare bị treo ở trạng thái "Đang tải...".

## Đã sửa
- Sửa chuỗi xuống dòng trong JavaScript upload guard.
- Giữ nguyên chức năng chặn file lớn >30MB.
- Kiểm tra cú pháp script bằng `node --check`.

## Ghi chú deploy
Sau khi deploy, mở trang AI Center và nhấn Ctrl + F5 để xóa cache trình duyệt.
