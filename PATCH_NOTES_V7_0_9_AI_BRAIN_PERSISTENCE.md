# AIGUKA V7.0.9 — AI Brain Persistence Module

## Mục tiêu
- Kho kiến thức AI không mất sau deploy/restart.
- Tất cả knowledge được lưu bền vững vào Supabase.
- Có công cụ kiểm tra, export/import AI Brain.

## Thay đổi chính
- Thêm endpoint `/api/ai-ops/learning/persistence-check`.
- Thêm endpoint `/api/ai-ops/learning/export`.
- Thêm endpoint `/api/ai-ops/learning/import`.
- `learning/settings` được lưu vào Supabase `ai_learning_settings`, local JSON chỉ là cache.
- Trang Knowledge có nút:
  - Kiểm tra lưu bền vững
  - Xuất kho AI Brain
  - Import kho AI
- Danh sách Knowledge đọc từ `learning_segments` Supabase + local fallback.
- Khi lưu Experience cũng ghi thêm vào Supabase như AI Memory.

## Nguyên tắc an toàn
- Deploy lại Render/Worker không ảnh hưởng dữ liệu học nếu Supabase không bị xóa/reset.
- File export `.json` có thể dùng để khôi phục hoặc chuyển kho tri thức sang server/dự án khác.
