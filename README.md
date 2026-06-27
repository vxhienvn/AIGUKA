# AIGUKA v3.9.8

## Phiên bản hiện tại
AIGUKA 3.9.8 - Product Chat Integration & PHOTO_RULE hoàn chỉnh

## Deploy

```bash
git add .
git commit -m "AIGUKA 3.9.8 - Product Chat Integration and Photo Rule"
git push origin main
```

## Kiểm tra sau deploy

```text
/product-sheet-debug?force=1
/product-drive-debug?folder=fan/10%20cánh/Gold&force=1
/dashboard-today?time_basis=meta&data_source=meta&force=1
/dashboard-today?time_basis=pancake&data_source=pancake&force=1
```

## Ghi chú
- Google Sheet là nguồn lấy nhóm sản phẩm, Folder và khoảng giá.
- Google Drive là kho ảnh sản phẩm.
- Bot chỉ báo khoảng giá, không báo giá cụ thể từng mẫu.
- PHOTO_RULE V2.0: 1–4 ảnh gửi lẻ; từ 5 ảnh trở lên gửi Slide 1; khách hỏi tiếp gửi Slide 2 gồm toàn bộ ảnh còn lại rồi xin SĐT/Zalo.
