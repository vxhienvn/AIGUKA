# PATCH NOTES V5.4.5 - Pending Executor V2

## Lỗi
Scanner đã tạo pending nhưng bot vẫn không trả lời khách. Log chỉ hiện `Durable pending worker processed X replies` nhưng không có log gửi Messenger.

## Nguyên nhân
Pending Executor cũ lấy pending ra nhưng nếu workflow trả về sớm/skip ở giữa thì không có fallback gửi tin, đồng thời thiếu log từng bước nên khó biết dừng ở đâu.

## Sửa
- Thêm Pending Executor V2 với log từng bước:
  - `[PENDING_START]`
  - `[PENDING_HISTORY_LOADED]`
  - `[PENDING_REPLY_EXECUTE]`
  - `[PENDING_FALLBACK_SEND]`
  - `[PENDING_DONE]`
  - `[PENDING_FAILED]`
- Không còn hủy pending chỉ vì tin cuối timeline không phải `Khách:`; executor tìm tin khách đang chờ gần nhất.
- Với pending do `stale_unanswered` tạo, không hủy lại vì các event hệ thống/page auto sau tin khách.
- Nếu workflow chính không gửi được tin, executor gửi fallback an toàn để khách không bị bỏ lửng.
- Fallback tuân thủ quy tắc:
  - không báo giá cụ thể;
  - hỏi mua sỉ/mua buôn thì xin SĐT/Zalo khéo, nếu chưa tiện thì hỏi số lượng/khu vực;
  - hỏi giá thì chỉ nói có nhiều phân khúc/khoảng giá chung, không gửi ảnh;
  - hỏi mẫu/ảnh thì hỗ trợ trên Messenger trước.

## Log cần theo dõi sau deploy
```text
[PENDING_START]
[PENDING_HISTORY_LOADED]
[PENDING_REPLY_EXECUTE]
[PENDING_FALLBACK_SEND]
[PENDING_DONE]
```
