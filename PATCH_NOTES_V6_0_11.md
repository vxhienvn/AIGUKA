# PATCH NOTES V6.0.11 - Ad Mapping Configured Filter Fix

## Fix
- Sửa bộ lọc `Đã gán sản phẩm` gây hiểu nhầm: trước đây chỉ cần có `product_group` là được tính đã gán, nên nhiều quảng cáo chưa có sản phẩm cụ thể/thư mục slide vẫn lọt vào.
- Đổi UI thành:
  - `Đã cấu hình đủ`
  - `Chưa cấu hình đủ`

## Quy tắc mới
Một quảng cáo chỉ được coi là `Đã cấu hình đủ` khi có đủ:
1. Nhóm sản phẩm nhận dạng (`product_group` khác `unknown`)
2. Sản phẩm cụ thể từ `📦 Products` hoặc mã sản phẩm (`recognition_name` / `product_item_key`)
3. Thư mục ảnh/slide hoặc `slide_key` (`drive_folders` / `drive_folder` / `slide_key`)

## Kết quả
- Bộ lọc sẽ không còn hiện các dòng chỉ mới có nhóm sản phẩm nhưng chưa có cấu hình gửi slide.
- Dễ rà soát quảng cáo nào còn thiếu cấu hình thật sự.
