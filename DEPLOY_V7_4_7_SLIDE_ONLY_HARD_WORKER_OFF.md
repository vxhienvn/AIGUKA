# AIGUKA V7.4.7 SAFE - Slide Only Hard Worker OFF + Server Control Fix

## Mục tiêu
Bản này chỉ dùng để test Page phụ:
- Chỉ cho phép gửi slide/template/image.
- Chỉ cho phép đúng 1 cụm text an toàn sau slide nếu bật `ALLOW_SLIDE_FOLLOWUP_TEXT=true`.
- Chặn toàn bộ reply text AI, lời chào, báo giá, pending, follow-up, stale unanswered.
- Sửa Server Control để trả về `read_back` sau khi bấm chuyển server, tránh tình trạng UI đổi nhưng Supabase chưa đổi.

## ENV bắt buộc cho test Page phụ

```env
SLIDE_ONLY_TEST_MODE=true
ALLOW_SLIDE_OUTBOUND=true
ALLOW_SLIDE_FOLLOWUP_TEXT=true
ALLOW_BOT_OUTBOUND=false
BOT_REPLY_ENABLED=false
PRIORITY_RULE_FORCE_SEND=false

DISABLE_PENDING_WORKER=true
DISABLE_STALE_UNANSWERED_SCAN=true
DISABLE_FOLLOWUP_WORKER=true
DISABLE_ALL_BACKGROUND_WORKERS=true
```

## Nếu muốn ép server hiện tại tự xử lý local khi Server Control bị lệch
Chỉ dùng trên Page phụ/test:

```env
SLIDE_ONLY_BYPASS_SERVER_CONTROL=true
```

Không bật biến này trên Page chính nếu cả 2 server cùng nhận webhook.

## Kiểm tra sau deploy

```text
/api/version
```

Cần thấy:

```json
"version": "7.4.7-slide-only-hard-worker-off-server-control-fix",
"safety": {
  "slide_only": true,
  "pending_worker_disabled": true,
  "stale_unanswered_scan_disabled": true,
  "followup_worker_disabled": true,
  "text_outbound_allowed": false
}
```

Kiểm tra server control:

```text
/api/server-control
/api/infra-status
```

Khi đổi active server, response phải có `read_back.active_server` đúng với server vừa chọn.

## Lệnh deploy

```bash
git add .
git commit -m "V7.4.7 SAFE - slide only hard worker off server control fix"
git push origin main
```
