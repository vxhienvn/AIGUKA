# AIGUKA 5.3.1 - Brain OS Session Context

## Mục tiêu
Cập nhật toàn bộ kiến trúc/quy luật đã thống nhất trong buổi tối 01/07/2026 vào bản 5.3, không chỉ yêu cầu gần nhất.

## Thay đổi chính

### 1. Brain OS Constitution module
Thêm thư mục `brain-os/` để quản lý tri thức dạng file lẻ:
- `constitution/articles/article_008_human_address_policy.json`
- `article_009_value_before_ask.json`
- `article_010_multi_channel_continuation.json`
- `article_011_contact_lock_rule.json`
- `article_012_recent_context_priority.json`
- `article_013_current_ad_entry_priority.json`
- `article_014_no_contact_messenger_care.json`

### 2. Session theo quảng cáo hiện tại
- Một khách có thể có nhiều session.
- Khi webhook có `ad_id/post_id/ref/campaign_id`, bot tạo hoặc cập nhật `activeSession`.
- Product hiện tại khóa theo quảng cáo hiện tại, không bị timeline cũ kéo lệch.

### 3. Current Ad Entry Priority
Thứ tự ưu tiên mới:
1. Sự kiện vào quảng cáo hiện tại.
2. Tin nhắn khách nói rõ sản phẩm.
3. Session hiện tại.
4. Recent conversation.
5. Timeline cũ.

### 4. Contact Lock Rule
- Trước khi bot trả lời, quét timeline để xem khách đã từng cho SĐT/Zalo chưa.
- Nếu đã có contact: không hỏi lại số, không tự nhảy vào Messenger tư vấn.
- Mặc định coi khách đã chuyển sang chăm sóc đa kênh.

### 5. No-contact Messenger Care
- Nếu bot/sale đã xin số nhưng khách không cho sau thời gian chờ hợp lý, bot được chăm tiếp trên Messenger.
- Mặc định chờ `MESSENGER_CARE_WAIT_MINUTES=20` phút.
- Khi vào Messenger Care Mode, bot không xin số lại liên tục.

### 6. Human Address Policy giữ nguyên
- Không gọi khách là `anh/chị`.
- Chọn đại từ cụ thể và khóa theo khách.

## Biến môi trường mới
```env
MESSENGER_CARE_WAIT_MINUTES=20
```
Nếu không cấu hình, mặc định 20 phút.

## Kiểm tra cú pháp
- `node --check src/app.js`
- `node --check src/prompts/salesPrompt.js`
