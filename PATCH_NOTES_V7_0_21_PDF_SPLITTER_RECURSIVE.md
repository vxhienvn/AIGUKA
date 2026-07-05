# PATCH NOTES V7.0.21 - PDF Splitter Recursive Fix

## Lý do
Bản 7.0.20 đã tách PDF lớn nhưng một số PDF scan/catalogue có vài trang rất nặng, sau khi tách vẫn còn part >30MB nên upload vẫn bị chặn.

## Sửa chính
- Tách PDF theo mục tiêu nhỏ hơn: ~18MB/part.
- Tự tách đệ quy các part vẫn >30MB.
- Sau khi tách, UI đánh dấu rõ part nào đạt / còn quá lớn.
- Nếu một trang PDF đơn lẻ vẫn >30MB thì báo cần nén PDF/ảnh, vì không thể tách nhỏ hơn theo trang.

## Lưu ý
Nếu catalogue chứa ảnh scan cực nặng trên từng trang, cần thêm bước nén/resize ảnh PDF ở phase tiếp theo.
