# AIGUKA v7.3.3 - Product Recognition Refresh

## Mục tiêu
Đồng bộ lại toàn bộ chỉ dẫn/nhận diện thiết bị theo cấu trúc Google Drive mới đã được dọn lại thủ công.

## Đã cập nhật
- Product Center version `7.3.3`.
- Alias nhận diện tăng từ 79 lên 145.
- Tách rõ các nhóm dễ nhầm:
  - `SEN_CAY` không còn gộp với `LAVABO`.
  - `LAVABO` tách riêng.
  - `GUONG` tách riêng.
  - `TU_CHAU_GUONG` / `GƯƠNG TỦ` tách riêng.
  - `DEN_TRUM`, `GACH_OP_LAT`, `DA_OP_LAT`, `NGOI_LOP` được bổ sung alias.
- Cập nhật seed `product_items` theo đúng folder Drive mới:
  - COMBO PHÒNG TẮM
  - BỆT VỆ SINH
  - LAVABO
  - GƯƠNG-TỦ / GƯƠNG TỦ
  - GƯƠNG
  - SEN CÂY / Sen vòi / Sen vòi cao cấp
  - BỒN TẮM / Bồn tắm ARES / Bồn tắm massage
  - PHÒNG BẾP / CHẬU VÒI RỬA BÁT / BẾP TỪ- HÚT MÙI / PHỤ KIỆN NHÀ BẾP
  - QUẠT TRẦN- ĐÈN TRÙM / ĐÈN TRÙM
  - GẠCH NGÓI / Gach 80x80 / SPAIN / INDIAN / Stone
- Cập nhật slide mixed folder để không kéo chéo lavabo/sen/gương tủ.
- Cập nhật Product Object fallback recognition.

## Kiểm tra
```bash
node --check server.js
node --check src/app.js
node --check src/ai/productObjectService.js
npm run drive:index
npm run drive:validate
```

Kết quả validate:
```txt
Products: 15
Aliases: 145
Errors: 0
Warnings: 1
```

Warning còn lại:
- `NGOI_LOP` chưa có folder/media nguồn trong Drive. Bot nhận diện được ngói nhưng chưa tự gửi slide ngói.

## Deploy
```bash
git add .
git commit -m "AIGUKA v7.3.3 product recognition refresh"
git push origin main
```
