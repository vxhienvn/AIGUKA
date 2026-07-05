# AIGUKA V7.0.11 – Ad Mapping + Product Groups + Slide Image Checker

## Đã sửa

1. Trang **Gán ID quảng cáo → Sản phẩm / Slide** không còn phụ thuộc danh sách nhóm sản phẩm hardcode.
   - UI gọi `/api/product-groups`.
   - Nguồn chính là bảng `product_groups` trong Supabase.
   - Fallback vẫn có sẵn nếu Supabase tạm lỗi.

2. Chống mất cấu hình mapping khi vào lại trang.
   - Hỗ trợ đọc/lưu cả schema mới và schema cũ của `ad_mappings`.
   - Ghi song song các cột tương thích: `product_group/product_type`, `product_item_key/product_name`, `recognition_name/main_folder`, `drive_folders/selected_folders`, `is_active/enabled`.

3. Chuẩn hóa nhóm nhận dạng sản phẩm.
   - Các nhóm con cũ như `faucet`, `toilet`, `vanity`, `combo` được map về `bathroom` / **Thiết bị vệ sinh**.
   - Bot giảm khả năng nhầm slide giữa sen vòi, bồn cầu, combo WC, tủ chậu.

4. Thêm công cụ **Check ảnh Slide cho Meta/Pancake** ngay trong trang mapping.
   - Kiểm tra link ảnh có public thật không.
   - Kiểm tra HTTP status, MIME type, kích thước, dung lượng.
   - Cảnh báo ảnh dễ lỗi preview trên Meta Business Suite/Pancake.

## API mới

- `GET /api/product-groups`
- `GET /api/drive/check-images?folder=<path>`
- `POST /api/drive/check-images-bulk`

## Migration cần chạy trên Supabase

Chạy file:

`database/SUPABASE_PATCH_V7_0_11_AD_MAPPING_PRODUCT_GROUPS_AND_SLIDE_CHECK.sql`

## Lưu ý

Bản này đọc/check ảnh Drive bằng API key hiện tại. Chức năng sửa/xóa/tạo thư mục trực tiếp trên Google Drive cần OAuth hoặc Service Account có quyền ghi; chưa tự bật xóa file để tránh mất dữ liệu ngoài ý muốn.
