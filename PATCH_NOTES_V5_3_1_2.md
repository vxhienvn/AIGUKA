# PATCH NOTES V5.3.1.2 - Hotfix Pending Worker

## Lý do
Một số khách nhắn tin nhưng bot không trả lời dù Bot ON. Nguyên nhân chính:

1. Sync Messenger trước khi bot gửi có thể kéo về echo/page-admin cũ, khiến sale_lock hiểu nhầm là admin vừa trả lời.
2. Nếu pending_replies không được tạo hoặc bị mất sau restart, bot chỉ chờ timer RAM/pending queue nên các tin khách cũ bị bỏ lửng.

## Đã sửa

- Mặc định tắt pre-reply Messenger sync:
  - `AIGUKA_ENABLE_PRE_REPLY_MESSENGER_SYNC=1` mới bật lại.
- Thêm `STALE_UNANSWERED_SCANNER`:
  - Mỗi phút rà local conversations.
  - Nếu tin cuối là của khách, chưa có SĐT/Zalo, không có admin trả lời sau đó, không có pending mở, đã quá thời gian chờ thì tự tạo pending reply.
- Mặc định thời gian chờ Messenger Care là 30 phút:
  - `MESSENGER_CARE_WAIT_MINUTES=30`
- Thêm biến tùy chọn:
  - `AIGUKA_STALE_UNANSWERED_SCAN_MINUTES=5`

## Khuyến nghị deploy

```bash
npm install
node --check src/app.js
node --check src/prompts/salesPrompt.js
git add .
git commit -m "Hotfix 5.3.1.2 pending worker"
git push origin main
```
