# AIGUKA V6.1 Lead Check V1.1 Fix

## Sửa lỗi

1. Sale Center mất cấu hình sau refresh/deploy
- Lưu `app_settings.sale_center_config` trước, coi đây là nguồn chính.
- `bot_working_settings` chỉ là bảng tương thích cũ; nếu thiếu cột sẽ không làm mất cấu hình mới.

2. Lead Check lệch với Dashboard cũ
- Mặc định hiển thị tối đa 50 dòng để khớp bảng Dashboard cũ.
- Vẫn có thể tăng giới hạn hiển thị nếu cần xem toàn bộ.
- Giữ nguồn Dashboard cũ/Pancake, không thay bằng Lead Tracker lt_*.

3. Tên QC/TKQC chưa rõ
- Bổ sung hydrate từ `ad_mappings` và seed mapping hiện có.
- ID QC chỉ hiển thị nhỏ để đối chiếu.
- Tên QC và TKQC là dữ liệu chính.

4. Xem hội thoại không ra dữ liệu
- Nếu không tìm được theo Pancake conversation_id, fallback tìm trong Supabase `messages` theo SĐT.
- Sau đó lấy toàn bộ conversation tương ứng để hiển thị.

## Không thay đổi
- Không đụng Dashboard cũ.
- Không đụng bot logic.
- Không đụng Meta/Pancake thống kê cũ.
