# PATCH NOTES V6.0.5 - Meta Ad Mapping + Google Drive Product Folder Sync

## Admin Ad Mapping
- Thêm cột **Quảng cáo hiện có trên Meta** trước cột **Nhóm sản phẩm nhận dạng**.
- Cột quảng cáo đọc danh sách quảng cáo hiện có từ Meta qua `/api/ad-mapping/meta`.
- Khi chọn quảng cáo trong dropdown, hệ thống tự điền `ad_id`, `ad_name`, `campaign`, `adset`, `ad_account_id`.
- ID quảng cáo hiển thị **in đậm**, tên quảng cáo hiển thị **mờ nhỏ** bên dưới để dễ đối chiếu.

## Google Drive Products Sync
- Thêm API `/api/drive/products-tree` để đọc cây thư mục Google Drive từ root `📦 Products`.
- Cột **Sản phẩm cụ thể** đồng bộ từ thư mục cấp 1 trong `📦 Products`.
- Cột **Thư mục ảnh / Slide** đồng bộ từ thư mục con bên trong sản phẩm đã chọn.
- Vẫn cho phép nhập tay đường dẫn Drive nếu cần.

## Technical
- Thêm `listProductFolderTree()` trong `src/services/productDriveService.js`.
- Cập nhật `public/ad-mapping.html` để phối hợp Meta Ads + Google Drive folder tree.
- `node --check src/app.js` pass.
