# AIGUKA V6.1 Lead Check V1.3 Critical Fix

## Fixed
- Sửa lỗi bấm "Xem hội thoại" không hiện gì do DOM id bị escape sai.
- Fallback tìm hội thoại theo SĐT vẫn hoạt động với số viết né: @, O/o, dấu chấm, dấu cách, gạch ngang.
- Bổ sung mapping tên QC/TKQC seed cho các ID đang xuất hiện trong Dashboard/Lead Check.
- Ưu tiên tên QC/TKQC đã map thay vì hiển thị "Không rõ" khi có ID QC.
- Sale Center: lưu cấu hình vào app_settings bằng PATCH/POST, không phụ thuộc on_conflict/unique index nên giảm lỗi refresh/deploy mất cấu hình.

## Not changed
- Không thay đổi Dashboard cũ.
- Không thêm bảng mới.
- Không cần chạy lại SQL nếu đã chạy migration 20260703_008 trước đó.
