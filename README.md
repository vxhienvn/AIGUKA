# AIGUKA 4.1.1

Bản cập nhật trên nền 3.9.11, bổ sung nhận diện nhóm **tủ chậu gương / tủ lavabo** trong Bathroom và gửi mẫu từ Google Drive khi khách xin mẫu/xem thêm.

## Deploy

```bash
git add .
git commit -m "AIGUKA 4.1.1 - Add vanity cabinet mirror intent"
git push origin main
```

## Test nhanh

```text
Tủ chậu gương
Tủ lavabo có mẫu không
Cho xem mẫu tủ chậu
Gương lavabo giá bao nhiêu
Xin mẫu tủ chậu gương
```

## Ghi chú

- Bot map nhóm này vào `vanity`.
- Google Drive folder fallback: `Bathroom/tủ chậu gương`.
- Nếu Google Sheet chưa có dòng tủ chậu gương, bot vẫn có thể lấy ảnh từ Drive bằng fallback row.
- Nếu có dòng trong Google Sheet, Sheet vẫn được ưu tiên để lấy khoảng giá và path.
