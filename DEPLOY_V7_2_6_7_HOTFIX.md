# AIGUKA V7.2.6.7 Hotfix - Slide Scope Guard cho Sen vòi

## Lỗi đã xử lý
Khách hỏi **sen cây/sen vòi**, bot gửi carousel có nhãn `SEN-xx` nhưng ảnh thực tế là **tủ chậu/gương lavabo**.

Nguyên nhân chính: gallery `faucet` hardcode cũ có URL ảnh bị lệch sản phẩm. Metadata vẫn ghi `Sen tắm, vòi...`, nên hệ thống tự gắn SKU `SEN-xx` dù ảnh không đúng.

## Thay đổi
1. Chặn static fallback của `faucet` mặc định.
   - Chỉ bật lại bằng `AIGUKA_ALLOW_STATIC_FAUCET_GALLERY=1` khi đã kiểm tra ảnh thủ công.
2. Với `faucet`, ưu tiên lấy Drive/Product Item folder:
   - `Sen vòi 01`
   - `Sen vòi cao cấp`
   - `Lavabo` khi khách hỏi lavabo/chậu rửa mặt.
3. Sửa title carousel ưu tiên `source_folder/titlePrefix` để tránh title cũ trong file ảnh làm lệch SKU.
4. Nếu không lấy được Drive folder thì không gửi slide sai; bot sẽ chuyển sang lời nhắn xin Zalo/SĐT hoặc chờ sale chăm sóc.

## Test
- `node --check src/app.js` OK.
