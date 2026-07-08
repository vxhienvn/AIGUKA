# AIGUKA V7.4.1 — Priority Rules + Image Proxy Hotfix

## Mục tiêu
Sửa lỗi khách hỏi địa chỉ/xin mẫu nhưng bot không xử lý đúng thứ tự, và lỗi click ảnh slide bị màn hình đen.

## Đã sửa

1. **Địa chỉ là ngoại lệ cứng**
   - `ask_address` trả lời trực tiếp bằng rule.
   - Không để AI/Knowledge Engine chen ngang.
   - Bổ sung nhận diện: `đ/c`, `dc`, `d/c`, `địa điểm`, `đường đi`, `chi nhánh`, `cơ sở`, `shop ở đâu`.

2. **Mẫu là ngoại lệ cứng**
   - `xin mẫu / xem mẫu / gửi mẫu / cho xem` đặt `priorityRuleBypassUntil` để slide vẫn được gửi theo Product Center.
   - Không để Knowledge Engine/text-only làm mất slide.
   - Intro/close của sample dùng `force` để tránh bị schedule/bot switch chặn nhầm trong rule ưu tiên.

3. **Image proxy**
   - `/image-proxy` nhận cả `?u=` và `?url=`.
   - Trước đây một số link mở ảnh dùng `?url=...`, server chỉ đọc `u`, dẫn tới ảnh đen/400.

4. **Câu địa chỉ gọn hơn**
   - Không xin Zalo/SĐT khô ngay khi khách chỉ hỏi địa chỉ.
   - Trả lời địa chỉ trước, hỏi có cần Google Maps không.

## Test nhanh

- `xin địa chỉ`
- `đ/c ở đâu`
- `shop ở đâu`
- `xin mẫu lavabo`
- `xin mẫu sen cây`
- `giá quạt 10 cánh`
- Click ảnh slide, kiểm tra không còn trang đen do `?url=`.
