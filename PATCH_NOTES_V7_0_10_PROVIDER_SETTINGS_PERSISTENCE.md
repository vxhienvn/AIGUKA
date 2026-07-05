# AIGUKA V7.0.10 – Provider Settings Persistence

## Mục tiêu
Khắc phục lỗi sau deploy/restart làm các toggle AI Provider tự quay về mặc định trong code.

## Đã sửa
- Provider Manager giờ load cấu hình từ Supabase key `ai_provider_settings` trong bảng `ai_learning_settings`.
- Khi bật/tắt `Active / Monitor / Learning / Evaluate / Propose`, hệ thống lưu ngay vào Supabase.
- `Preset ACTIVE`, `Preset MONITOR`, `OFF hết` cũng lưu ngay vào Supabase.
- UI hiển thị trạng thái lưu:
  - `✓ Đã lưu Supabase`
  - `⚠ Đang dùng cache local, chưa có bản Supabase`
  - `✕ Chưa xác nhận lưu Supabase`
- API `/api/ai-ops/learning/persistence-check` kiểm tra thêm Provider Persistence.
- Compare/Diagnostics tự đồng bộ provider settings trước khi chạy.

## Migration đã chạy trên Supabase
Seed key `ai_provider_settings` với trạng thái tất cả provider OFF để giữ đúng ý người dùng trước deploy.

## Kiểm tra sau deploy
1. Vào AI Center → Multi AI.
2. Xem dòng `Provider Persistence: ✓ Đã load từ Supabase`.
3. Bật/tắt một toggle.
4. Refresh trang.
5. Deploy/restart server.
6. Mở lại, trạng thái phải giữ nguyên.

## Nguyên tắc từ bản này
Cấu hình vận hành AI không được chỉ lưu local JSON. Supabase là nguồn chuẩn, local chỉ là cache/fallback.
