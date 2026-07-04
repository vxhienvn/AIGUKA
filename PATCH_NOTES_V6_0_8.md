# AIGUKA V6.0.8 - Ad Mapping Filter & Folder Selection Fix

## Admin Ad Mapping
- Thêm bộ lọc theo tài khoản quảng cáo.
- Thêm bộ lọc trạng thái quảng cáo: đang hoạt động / không hoạt động.
- Thêm bộ lọc mapping: đã gán sản phẩm / chưa gán sản phẩm.
- Cột tài khoản quảng cáo hiển thị thêm tên tài khoản nếu Meta trả về.

## Folder Picker
- Bổ sung nút chọn thư mục chính của sản phẩm.
- Bổ sung nút chọn tất cả thư mục con/nhiều cấp.
- Bổ sung nút bỏ chọn nhanh.
- Vẫn cho phép nhập thủ công nhiều folder, mỗi dòng một folder.

## Backend
- Lưu thêm ad_account_name và account_status nếu Supabase schema đã có cột tương ứng.
- Nếu schema cũ chưa có cột, code tự fallback để không làm hỏng lưu mapping.
