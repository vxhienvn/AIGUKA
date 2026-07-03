# PATCH NOTES V6.0.20

## Slide Mapping load/filter fix
- Khi Meta trả 0 quảng cáo theo bộ lọc, trang vẫn hiển thị mapping đã lưu từ Supabase và không áp bộ lọc trạng thái QC lên dữ liệu fallback.
- Khôi phục chọn sản phẩm cụ thể từ cấu hình đã lưu: UI đọc cả `recognition_name`, `product_drive_path`, `product_item_key`, `product_name`, `drive_folder`.
- Tránh tình trạng đã lưu mapping nhưng F5/đổi bộ lọc làm danh sách trống.
