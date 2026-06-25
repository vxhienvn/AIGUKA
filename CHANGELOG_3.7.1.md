# AIGUKA 3.7.1 - Finance Dashboard Multi Account Fix

## Sửa chính
- Dashboard Meta tháng không còn chỉ đọc 1 tài khoản khi vẫn còn `META_AD_ACCOUNT_ID` cũ.
- `META_AUTO_AD_ACCOUNTS` mặc định bật. Nếu muốn tắt, đặt `META_AUTO_AD_ACCOUNTS=false`.
- Tự quét thêm tài khoản từ:
  - `/me/adaccounts`
  - `/me/businesses/{business_id}/owned_ad_accounts`
  - `/me/businesses/{business_id}/client_ad_accounts`
- Gộp tài khoản khai báo thủ công với tài khoản tự quét, không ghi đè nhau.
- Thêm endpoint kiểm tra: `/meta-accounts-debug`.

## Lưu ý thẻ Visa
Meta API không trả 4 số cuối thẻ. Cột Visa vẫn cần một trong các nguồn:
- `META_ACCOUNT_CARD_MAP`
- `/payment-webhook`
- `META_CARD_LAST4` cho tài khoản mặc định
