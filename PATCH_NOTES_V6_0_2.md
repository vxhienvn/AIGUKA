# PATCH NOTES V6.0.2 - Messenger Care Policy Update

## Mục tiêu cập nhật
Điều chỉnh mục tiêu hội thoại theo rule mới:

> AI ưu tiên xin SĐT/Zalo để chuyển cho sale. Nếu khách không muốn cho số, chưa cho số sau 2-3 lần xin hợp lý, hoặc yêu cầu tư vấn/xem mẫu trên Messenger, bot phải tiếp tục tư vấn trên Messenger theo dữ liệu đầu vào đang có.

## Thay đổi chính

### 1. Messenger Care Policy
- Không còn hiểu Messenger Care là cấm tư vấn dài.
- Messenger Care được kích hoạt khi:
  - Khách yêu cầu trao đổi/xem thông tin tại Messenger.
  - Khách không tiện nghe/gọi.
  - Khách chưa cho số sau 2-3 lần xin hợp lý.
- Khi vào Messenger Care, bot tiếp tục tư vấn theo dữ liệu đang có và không xin số lặp lại.

### 2. Contact Ask Policy
- Bot vẫn ưu tiên xin SĐT/Zalo sau khi đã tạo giá trị ban đầu.
- Nếu khách hỏi giá/xin mẫu/có tín hiệu mua sau vài lượt, bot được xin số nhẹ nhàng.
- Nếu khách đã né hoặc muốn tư vấn tại đây, bot không ép số nữa.

### 3. Prompt/Constitution Update
- Cập nhật prompt trong `src/app.js`.
- Cập nhật:
  - `article_014_no_contact_messenger_care.json`
  - `article_021_messenger_care_mode.json`

### 4. Human Wording
- Giảm các cụm “tư vấn qua Messenger” máy móc.
- Chuyển sang câu tự nhiên hơn: “mình trao đổi tại đây cũng được”.

## File đã sửa
- `src/app.js`
- `brain-os/constitution/articles/article_014_no_contact_messenger_care.json`
- `brain-os/constitution/articles/article_021_messenger_care_mode.json`
- `PATCH_NOTES_V6_0_2.md`

## Kiểm tra
- `node --check src/app.js` pass.
