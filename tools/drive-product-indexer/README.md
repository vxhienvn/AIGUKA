# AIGUKA 7.3 Drive Product Indexer

Bản này thay cho migrator để tránh phiền phức quyền Google Drive.

## Nguyên tắc

- Không cần `GOOGLE_DRIVE_ACCESS_TOKEN`.
- Không cần service account.
- Không tạo/đổi tên/di chuyển/xóa gì trên Google Drive.
- Chỉ tạo mapping Product Center nội bộ từ snapshot folder hiện tại.

## Chạy

```bash
npm run drive:index
npm run drive:validate
```

Để tương thích lệnh cũ, `npm run drive:migrate` cũng được chuyển sang chế độ index an toàn.

## Output

```txt
tools/drive-product-indexer/output/product-center-index.json
tools/drive-product-indexer/output/product-alias-map.json
tools/drive-product-indexer/output/product-folder-map.json
tools/drive-product-indexer/output/validate-report.json
```

Các file này dùng làm nền cho Product Engine 7.3.
