# AIGUKA v3.8.3 - Meta Month Messages & Payment Method Fix

## Sửa lỗi
- Bảng `/dashboard-meta-month` không còn chỉ đếm tin nhắn từ `message_events.json` mới phát sinh sau deploy 3.8.
- Thêm đọc `actions` từ Meta Ads Insights theo ngày để lấy số lượt bắt đầu hội thoại lịch sử trong tháng, ví dụ ngày 01/06 vẫn hiện được 28 nếu Meta trả về chỉ số này.
- SĐT/Zalo ở báo cáo tháng dùng dữ liệu nội bộ và bù từ Pancake khi có dữ liệu, để lịch sử trước 3.8 không bị toàn 0 nếu Pancake còn đọc được.

## Cập nhật thanh toán
- Cột “Thẻ Visa” đổi thành “Thẻ Visa / Phương thức”.
- Nếu tài khoản dùng thẻ thì hiển thị 4 số cuối khi đọc được.
- Nếu tài khoản nạp tiền/số dư trả trước hoặc không đọc được thẻ, dashboard hiển thị `Trả trước/không thẻ` thay vì để trống.

## Ghi chú
- Chi tiêu vẫn lấy từ Meta Insights nhiều tài khoản.
- Tin nhắn lịch sử phụ thuộc vào action_type mà Meta API trả về cho từng tài khoản/quảng cáo.
