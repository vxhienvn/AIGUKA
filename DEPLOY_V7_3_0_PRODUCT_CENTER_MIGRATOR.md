# AIGUKA V7.3.0 - Product Center Migrator

Đã thêm công cụ chuẩn hóa Google Drive cho Product Center 7.3.

## Có gì mới

- `tools/drive-product-migrator/product-config.json`: danh mục chuẩn A/B/C/D + Product ID + alias.
- `tools/drive-product-migrator/folder-mapping.json`: mapping folder Drive hiện tại sang Product ID 7.3.
- `tools/drive-product-migrator/migrate-drive.js`: tạo cây `AIGUKA Product Center 7.3`.
- `tools/drive-product-migrator/validate-drive.js`: kiểm tra cấu trúc sau migrate.
- `tools/drive-product-migrator/rollback.js`: hướng dẫn rollback an toàn.

## Nguyên tắc an toàn

Mặc định script chỉ tạo folder mới và shortcut tới folder cũ, không xóa/đổi tên/di chuyển dữ liệu production.

## Lệnh chạy

```bash
npm run drive:migrate:dry
npm run drive:migrate
npm run drive:validate
```

## Biến môi trường cần có

Một trong hai cách:

```bash
GOOGLE_DRIVE_ACCESS_TOKEN=...
```

hoặc:

```bash
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=...
```

Root mặc định: `1Um529hhojal4EacDDiDZ2TccwHgRtHsn`.
