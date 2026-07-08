# AIGUKA V7.3.1 - Drive Indexer Safe

## Mục tiêu

Thay Drive Migrator bằng Drive Indexer an toàn để không cần access token/service account và không sửa dữ liệu Google Drive production.

## Thay đổi

- `npm run drive:migrate` không còn gọi Google Drive API.
- `npm run drive:migrate` được đổi sang tạo local Product Center index.
- Thêm `npm run drive:index`.
- `npm run drive:validate` kiểm tra local index, không yêu cầu quyền Drive.
- Giữ script migrate API cũ ở lệnh riêng: `npm run drive:migrate:apply`.

## Lệnh chạy

```bash
npm run drive:migrate
npm run drive:validate
```

## Output

```txt
tools/drive-product-indexer/output/product-center-index.json
tools/drive-product-indexer/output/product-alias-map.json
tools/drive-product-indexer/output/product-folder-map.json
tools/drive-product-indexer/output/validate-report.json
```

## Kết quả test

- Products: 17
- Aliases: 76
- Errors: 0
- Warnings: 6

Warnings hiện tại là dữ liệu cần bổ sung/tách sau, không phải lỗi cú pháp:

- `VOI_LAVABO` chưa có folder riêng.
- `PHU_KIEN_BEP` chưa có folder riêng.
- `NGOI_LOP` chưa có folder riêng.
- Một số folder đang dùng chung cho nhiều Product ID: tủ chậu/gương, chậu/vòi bếp, bếp từ/hút mùi.

## Ghi chú an toàn

Bản này không đổi tên, không di chuyển, không xóa, không tạo folder trên Google Drive.
