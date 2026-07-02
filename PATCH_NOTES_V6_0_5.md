# AIGUKA V6.0.5 - Stale Rescue + VN Log + Lead Tracker

## Mục tiêu
Khắc phục phát sinh sau V6.0.2/V6.0.4: khách mới nhắn nhưng bot không trả lời, stale scan không cứu được hội thoại, và log khó đối chiếu vì dùng giờ UTC.

## Đã sửa
- Bật lại `stale unanswered scan` theo hướng an toàn.
- Không để `contact_lock` chặn việc trả lời khi khách đã hỏi lại mà chưa được phản hồi.
- Không coi tin tự động Botcake/Pancake kiểu "vui lòng kiểm tra" là câu trả lời thật của AIGUKA.
- Pending executor có cơ chế `PENDING_STALE_RESCUE_CONTINUE` để tiếp tục trả lời khi tin cuối là bot auto nhưng vẫn còn tin khách đang chờ.
- Log đã có prefix giờ Việt Nam `[VN yyyy-mm-dd hh:mm:ss]`.
- Giữ nguyên Lead Tracker và `meta-browser-sync` từ V6.0.3.

## Env mới/quan trọng
- `AIGUKA_ENABLE_STALE_UNANSWERED_SCAN=true` mặc định bật.
- Muốn tắt stale scan: đặt `AIGUKA_ENABLE_STALE_UNANSWERED_SCAN=false`.
- `AIGUKA_STALE_UNANSWERED_SCAN_MINUTES=5` mặc định 5 phút, tối thiểu 3 phút.

## Dòng log cần thấy sau deploy
- `[SUPABASE_STALE_UNANSWERED_SCAN] ...`
- `[PENDING_STALE_RESCUE_CONTINUE] ...` nếu cứu hội thoại có Botcake auto sau tin khách.
- `[PENDING_REPLY_EXECUTE] ...` khi bắt đầu trả lời pending.

## Kiểm tra sau deploy
1. Nhắn thử một câu sản phẩm như: `Sen cây bạn`.
2. Nếu webhook không trả lời ngay, chờ 5 phút.
3. Log phải tạo pending và thực thi trả lời.
