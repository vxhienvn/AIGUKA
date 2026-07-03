# AIGUKA V6.1 Lead Check V1.2 - Phone Dedupe + Sale Config Hardening

## Fix chính
- Bổ sung nhận diện SĐT viết né: `@376254945`, `O376254945`, `o376254945`, `0376.254.945`, `0376-254-945`, `+84 376 254 945`.
- Chuẩn hóa số Việt Nam về dạng `0xxxxxxxxx`.
- Loại hotline nội bộ `0973693677` khỏi danh sách SĐT khách.
- Lead Check không đếm theo dòng Pancake nữa; ưu tiên dedupe theo `phone_normalized`.
- Click SĐT tìm hội thoại fallback theo nhiều dạng: đủ số, bỏ số 0 đầu, 8/7/6 số cuối.
- Sale Center lưu cấu hình tương thích cả schema `key/value` và `setting_key/setting_value` của `app_settings`.

## Không thay đổi
- Không sửa Dashboard cũ.
- Không xóa bảng cũ.
- Không thay đổi logic bot.
