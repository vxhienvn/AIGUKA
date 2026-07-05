# AIGUKA V7.0.12 - Drive Manager trực tiếp trong Ad Mapping

## Mục tiêu
Hoàn thiện trang **Gán ID quảng cáo → Sản phẩm / Slide** để không phải vào Google Drive sửa thủ công từng thư mục/file ảnh.

## Đã bổ sung

### 1. Quản lý Google Drive Products ngay trên UI
- Xem nội dung thư mục đang chọn.
- Tạo thư mục con mới.
- Sửa tên thư mục/file.
- Xóa thư mục/file trên Google Drive.
- Upload nhiều ảnh JPG/PNG/WebP.
- Cấp quyền public cho ảnh.
- Check ảnh của thư mục đang quản lý.
- Đồng bộ lại cây thư mục Products sau khi sửa.

### 2. API Drive ghi mới
Thêm các endpoint:

```text
GET    /api/drive/manage/status
GET    /api/drive/manage/list?folder=...
POST   /api/drive/manage/folder
PATCH  /api/drive/manage/item
DELETE /api/drive/manage/item
POST   /api/drive/manage/public
POST   /api/drive/manage/upload
```

### 3. Quyền ghi Google Drive
Server hỗ trợ 2 cách cấu hình:

#### Cách A - Access Token
```env
GOOGLE_DRIVE_ACCESS_TOKEN=...
```

#### Cách B - Service Account
```env
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=...
```

hoặc:

```env
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_DRIVE_PRIVATE_KEY=...
```

Lưu ý: thư mục Products root phải được share quyền Editor cho service account nếu dùng cách B.

### 4. Quy tắc an toàn
- Chỉ cho upload JPG/PNG/WebP.
- Chặn upload ảnh lớn hơn 12MB.
- Mặc định cấp public cho ảnh sau upload để Meta/Pancake có thể tải.
- Xóa có hộp xác nhận rõ ràng vì thao tác xóa ảnh hưởng trực tiếp đến slide bot.

## File thay đổi chính
- `src/services/productDriveService.js`
- `src/app.js`
- `public/ad-mapping.html`
