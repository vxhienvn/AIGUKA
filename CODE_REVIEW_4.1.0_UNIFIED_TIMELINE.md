# CODE REVIEW 4.1.0 - Unified Meta + Pancake Timeline

## Mục tiêu
Supabase không chỉ nhận dữ liệu từ Meta webhook mà có thể đồng bộ thêm dữ liệu Pancake để audit thấy cả customer, bot, admin/echo_unknown.

## Thay đổi chính
1. `supabaseGetOrCreateConversation` không còn gom theo conversation open cuối cùng.
2. Session key mới: `source:page_id:sender_id:ad_or_post:YYYY-MM-DD`.
3. Thêm `/pancake-sync-to-supabase?limit=20&details=1`.
4. Thêm `/supabase-replay?sender_id=<id>`.
5. Thêm `/supabase-audit-summary?limit=500`.
6. Parser Pancake mềm để tương thích nhiều cấu trúc API.

## Lưu ý
- Pancake API có thể trả cấu trúc khác nhau theo tài khoản/quyền. Endpoint sync sẽ báo `errors[].attempts` nếu không lấy được message detail.
- Nếu Pancake bị 429, giảm `limit` hoặc tăng `delay_ms`, ví dụ `/pancake-sync-to-supabase?limit=20&delay_ms=1000`.
- Bản này không đổi luồng trả lời khách; tập trung vào kiến trúc dữ liệu/audit.

## Test nhanh sau deploy
- `/healthz` phải hiện version `4.1.0-Unified-Meta-Pancake-Timeline`.
- `/supabase-health` OK.
- `/pancake-sync-to-supabase?limit=5&details=1` trả JSON.
- `/supabase-audit-summary?limit=200` trả thống kê.
- `/supabase-replay?sender_id=<id>` xem được timeline.
