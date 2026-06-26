# AIGUKA 3.9.5

## Mục tiêu bản này
Đóng lỗi dashboard Meta/Pancake: khi chọn **Meta trực tiếp**, số hội thoại phải khớp Meta Ads Manager/báo cáo tháng, không lấy số từ webhook/Pancake.

## Deploy
```bash
git add .
git commit -m "AIGUKA 3.9.5 - Lock dashboard Meta direct source"
git push origin main
```

## Kiểm tra sau deploy
```text
/dashboard-today?time_basis=meta&data_source=meta&force=1
/dashboard-meta-month?data_source=meta&force=1
/dashboard-source-debug?mode=today&time_basis=meta&data_source=meta&force=1
```

## Quy tắc nguồn dữ liệu dashboard
- Meta Direct: hội thoại lấy từ Meta account/day Insights.
- Pancake: hội thoại lấy từ Pancake/Webhook.
- SĐT/Zalo: dữ liệu bổ sung từ webhook/Pancake, không làm tăng số hội thoại Meta.

## Product Sheet
- Bot đọc Google Sheet.
- Chỉ báo khoảng giá min → max.
- Không báo giá cụ thể từng mẫu/model.
