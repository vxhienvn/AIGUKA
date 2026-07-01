# PATCH NOTES V5.4.2 - Debug Stale Skip Reason

Mục tiêu: xác định vì sao Supabase stale scanner đã quét hội thoại nhưng không tạo pending reply.

## Thay đổi
- Thêm thống kê lý do skip cho Supabase stale scanner.
- Thêm log mẫu 12 hội thoại đầu bị skip để debug nhanh.
- Thêm thống kê lý do skip cho local stale scanner.

## Log cần tìm sau deploy
```text
[SUPABASE_STALE_UNANSWERED_SCAN]
[SUPABASE_STALE_UNANSWERED_SKIP_SAMPLES]
[STALE_UNANSWERED_SCAN]
```

Ví dụ:
```text
[SUPABASE_STALE_UNANSWERED_SCAN] checked=26 scheduled=0 skipped=26 reasons={"last_not_customer":20,"contact_lock_phone_or_zalo_found":4,"too_recent":2}
```

## Cách dùng kết quả
Gửi lại 2 dòng log `reasons=...` và `SKIP_SAMPLES` để xác định bước fix tiếp theo.
