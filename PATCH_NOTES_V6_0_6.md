# AIGUKA V6.0.6 - Meta Ad + Drive Multi-Folder Mapping

## Thay đổi chính

- Cập nhật trang `/admin/ad-mapping.html` theo yêu cầu mới:
  - Cột đầu tiên: **Quảng cáo hiện có trên Meta**.
  - ID quảng cáo hiển thị **in đậm**.
  - Tên quảng cáo hiển thị mờ nhỏ bên dưới.
  - Cột **Sản phẩm cụ thể** đồng bộ từ thư mục cấp 1 trong Google Drive `📦 Products`.
  - Cột **Thư mục ảnh / Slide** đồng bộ từ thư mục con trong sản phẩm đã chọn.
  - Cho phép chọn **nhiều thư mục**, **nhiều cấp thư mục** cùng lúc.
  - Thêm cột **Nút Zalo**, có thể sửa URL theo từng quảng cáo.

- Backend:
  - Thêm `drive_folders` cho Ad Mapping để lưu nhiều thư mục slide.
  - Thêm `zalo_url` cho Ad Mapping để tuỳ chỉnh nút Zalo theo từng quảng cáo.
  - Slide Engine khi gặp nhiều thư mục sẽ trộn ảnh từ các thư mục đã chọn.
  - Nút Zalo trên slide dùng `zalo_url` của mapping nếu có.
  - API Drive tree hỗ trợ đọc sâu đến 6 cấp thư mục.

- Module defaults:
  - `slide_engine` mặc định ON.
  - `followup` mặc định ON nhưng vẫn chịu sale/contact lock.

## Supabase migration cần chạy

```sql
alter table ad_mappings add column if not exists drive_folders jsonb default '[]'::jsonb;
alter table ad_mappings add column if not exists zalo_url text;
```

Nếu chưa chạy migration này, server vẫn fallback được nhưng dữ liệu nhiều thư mục/Zalo riêng có thể không lưu bền vững.
