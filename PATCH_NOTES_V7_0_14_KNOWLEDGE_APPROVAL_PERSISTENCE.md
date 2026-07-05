# PATCH V7.0.14 — Knowledge Approval Persistence Fix

## Lỗi đã xử lý
- File upload báo lỗi JSON/route nhưng vẫn xuất hiện ở khu nhận dạng do item được tạo local trước/sau khi backend lỗi.
- Khi bấm `Duyệt vào Knowledge`, dữ liệu chỉ được ghi vào file local JSON (`ai_learning_knowledge.json`), chưa cập nhật trạng thái approved bền vững trong Supabase.
- Ảnh/PDF không trích xuất được text không có `learning_segments`, nên dù duyệt vẫn không thấy trong Knowledge sau deploy/reload.
- `Knowledge đã duyệt` đang đếm toàn bộ `learning_segments`, kể cả dữ liệu upload/chưa duyệt, gây hiểu nhầm là đã lưu Knowledge.

## Sửa chính
- Khi upload: segment Supabase mới để `active=false`, chưa cho bot dùng ngay.
- Khi admin duyệt: cập nhật `ai_learning_documents.status='approved'`.
- Khi admin duyệt: mở khóa segment liên quan bằng `active=true` và `attributes.approved=true`.
- Nếu file không có text/segment, tạo fallback knowledge segment từ bản nháp nhận diện để vẫn lưu bền vững.
- Trang Knowledge chỉ đọc segment đã duyệt thật: `active=true` + `attributes.approved=true`.
- KPI Knowledge đã duyệt chỉ đếm `approvedSegments`, không đếm toàn bộ segment thô.

## Ghi chú vận hành
- Các segment cũ đã được tạo trước bản này có thể chưa có `attributes.approved=true`, nên sẽ không hiện trong Knowledge cho đến khi duyệt lại hoặc chạy migration đánh dấu thủ công.
- Đây là hành vi đúng để tránh bot dùng nhầm dữ liệu chưa được admin duyệt.
