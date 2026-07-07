# AIGUKA Drive Product Migrator 7.3

Công cụ tạo cây `AIGUKA Product Center 7.3` trên Google Drive theo danh mục A/B/C/D.

Mặc định an toàn: tạo folder mới và shortcut tới folder cũ, không đổi tên/di chuyển/xóa dữ liệu production.

## Cấu hình quyền ghi

Dùng một trong các cách:

```bash
export GOOGLE_DRIVE_ACCESS_TOKEN="..."
```

hoặc service account:

```bash
export GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON='{"client_email":"...","private_key":"..."}'
```

Root mặc định lấy từ `folder-mapping.json`; có thể override:

```bash
export GOOGLE_DRIVE_PRODUCTS_ROOT_ID="1Um529hhojal4EacDDiDZ2TccwHgRtHsn"
```

## Chạy thử, chưa sửa Drive

```bash
node tools/drive-product-migrator/migrate-drive.js
```

## Tạo Product Center 7.3 thật

```bash
node tools/drive-product-migrator/migrate-drive.js --apply
```

## Kiểm tra sau migrate

```bash
node tools/drive-product-migrator/validate-drive.js
```

## Không khuyến nghị khi bot đang chạy production

```bash
node tools/drive-product-migrator/migrate-drive.js --apply --move-source
```

Lệnh này add thêm parent mới cho folder nguồn, không remove parent cũ nếu không biết chính xác parent hiện tại.
