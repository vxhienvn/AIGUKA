# AIGUKA V6.0.18 - Slide Mapping Load Fallback + Sale Center Persistence Follow-up

## Fixes

- Sửa trang `slide-mapping.html` bị trống khi Meta trả về 0 quảng cáo theo bộ lọc.
- Nếu Meta không có dữ liệu theo bộ lọc nhưng Supabase đã có mapping, UI tự hiển thị mapping đã lưu thay vì bảng trắng.
- `syncMeta()` không còn xóa màn hình khi Meta trả 0 dòng.
- `getAdMappingRowsAll()` tương thích schema cũ không có `updated_at`.
- Bộ lọc "Đã cấu hình đủ" không bắt buộc phải chọn Nhóm sản phẩm nếu đã chọn Sản phẩm cụ thể + thư mục/slide, vì sản phẩm cụ thể đã suy ra nhóm.

## Notes

- Trang lịch Sale vẫn giữ tại `/admin/ad-mapping.html`.
- Trang gán QC -> Slide vẫn ở `/admin/slide-mapping.html`.
