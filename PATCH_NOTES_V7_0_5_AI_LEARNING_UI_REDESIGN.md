# PATCH NOTES V7.0.5 - AI Learning Conversation UI Redesign

## Mục tiêu
Sửa giao diện tab "Hội thoại học tập" theo thiết kế mới đã duyệt: khu vực timeline ngang toàn trang, có thể kéo/mở rộng, và phần đánh giá của OpenAI / Gemini / DeepSeek chia đều 3 cột ở dưới.

## Đã cập nhật
- Thay layout 2 cột cũ bằng layout học tập toàn trang.
- Thêm ô tìm kiếm hội thoại rộng, hỗ trợ nhập tên khách, SĐT, PSID, Conversation ID, Ad ID, sản phẩm hoặc nội dung hội thoại.
- Danh sách hội thoại tìm được hiển thị thành card, click để chọn.
- Timeline hội thoại hiển thị trong khung rộng, có nút "Mở rộng toàn trang".
- Timeline phân biệt màu theo vai trò: khách hàng, bot, sale/admin, hệ thống.
- Phần đánh giá 3 nền tảng chuyển từ dạng log/textarea sang 3 report card ngang nhau:
  - OpenAI
  - Gemini
  - DeepSeek
- Mỗi report card có điểm, sao, điểm mạnh, lỗi/cần sửa, đề xuất.
- Có nút xem bản gốc nếu cần đọc đầy đủ.
- Thêm AI Consensus: tổng hợp nhanh điểm chung của 3 AI và lưu thành kinh nghiệm.

## Không thay đổi
- Không đổi API backend.
- Không đổi logic tìm hội thoại.
- Không đổi logic gọi 3 nền tảng đánh giá.
- Không đổi các tab Multi AI, Upload, Knowledge, Dạy kinh nghiệm.

## Kiểm tra
- Đã kiểm tra cú pháp JavaScript inline bằng `node --check`.
