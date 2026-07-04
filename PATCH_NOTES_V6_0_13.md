# PATCH NOTES V6.0.13 - Ad Mapping Admin Loading Isolation Fix

## Fix chính

- Sửa lỗi JavaScript khiến trang Ad Mapping treo ở trạng thái `Đang tải...`:
  - `onDriveFolderCheck()` bị khai báo trùng `const tr`, gây SyntaxError và làm toàn bộ script không chạy.

- Tách tải dữ liệu theo từng nguồn thay vì để một nguồn lỗi làm chết toàn trang:
  - Product Items
  - Google Drive Products Tree
  - Meta Ads / Ad Mapping

- Thay Promise.all bằng Promise.allSettled cho quá trình tải trang.

- Thêm timeout cho API:
  - Product Items: 8s
  - Drive Tree: 10s
  - Meta Ads: 12s
  - Save Mapping: 15s

- Nếu Meta lỗi:
  - Trang vẫn hiện mapping đã lưu từ Supabase `/api/ad-mapping`.
  - Không đứng im ở loading.

- Nếu Drive lỗi:
  - Trang vẫn hoạt động.
  - Người dùng vẫn có thể nhập folder thủ công.

- Nút `Đồng bộ Drive` vẫn render lại UI sau khi đồng bộ thành công.

## Kiểm tra

- `node --check src/app.js`: pass
- `node --check` script trong `public/ad-mapping.html`: pass
