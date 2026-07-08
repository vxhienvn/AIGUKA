# AIGUKA V7.4.6 SAFE - Slide Only + Follow-up Text

Bản test Page phụ: chỉ gửi slide + 1 cụm text an toàn sau slide. Không bật AI reply/lời chào/báo giá.

Xem: `DEPLOY_V7_4_6_SLIDE_ONLY_WITH_FOLLOWUP.md`

# AIGUKA 5.1.0 Modular Production Candidate

Bản này đóng gói V5 theo hướng có thể deploy và test với khách thật sau khi bật công tắc trong Admin.

## Trang quản trị
- `/admin-v5`
- `/api/version`
- `/api/v5/status`
- `/api/modules`

## Quy tắc an toàn mặc định
- `legacy_reply_bot`: OFF để tránh bot 4.x chen/lặp.
- `slide_engine`: OFF để tránh gửi sai slide khi chưa xác minh mapping.
- `sale_lock`: ON.
- `policy_engine`: ON.
- `reply_bot_v5`: ON, nhưng chỉ trả lời khi công tắc tổng `reply_enabled` được bật.

## Test sau deploy
1. Mở `/api/debug/health` kiểm tra version.
2. Mở `/admin-v5`.
3. Kiểm tra Module Center.
4. Bật trả lời nếu muốn test thật.
5. Gửi tin nhắn thử từ Messenger.

## V7.4.7 SAFE note
Bản V7.4.7 khóa cứng pending/stale/follow-up worker trong Slide Only Test Mode và bổ sung read-back cho Server Control.
Xem `DEPLOY_V7_4_7_SLIDE_ONLY_HARD_WORKER_OFF.md`.
