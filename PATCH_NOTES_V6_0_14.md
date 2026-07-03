# AIGUKA V6.0.14 - Supabase Ad Mapping Schema Fallback Fix

## Fix
- Sửa triệt để lỗi lưu Ad Mapping khi bảng Supabase `ad_mappings` thiếu các cột mới như `is_active`, `image_urls`, `effective_status`, `account_status`, `drive_folders`, `zalo_url`, `price_range`...
- Backend không còn chỉ fallback một số cột cố định. Khi PostgREST báo thiếu bất kỳ cột nào, hệ thống tự loại cột đó khỏi payload và thử lưu lại.
- Chỉ giữ bắt buộc `ad_id` vì đây là khóa chính để upsert mapping.

## Kết quả
- Không cần chạy migration ngay vẫn lưu được với schema cũ, miễn bảng có `ad_id` và unique constraint cho `ad_id`.
- Nếu muốn lưu đầy đủ các trường mới, vẫn nên chạy migration bổ sung sau.
