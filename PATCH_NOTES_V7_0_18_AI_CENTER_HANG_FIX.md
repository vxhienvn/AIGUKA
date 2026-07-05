# AIGUKA V7.0.18 - AI Center Hang Fix

## Mục tiêu
Sửa lỗi AI Center / AI Comparison bị treo ở trạng thái "Đang tải..." sau khi deploy 7.0.16/7.0.17.

## Nguyên nhân
Một số API khởi tạo AI Center đang chờ Supabase/backend quá lâu. Frontend không có timeout và không bắt lỗi từng khối, nên chỉ cần 1 request treo là UI nhìn như đơ.

## Đã sửa
- Thêm timeout 15 giây cho API frontend `/api/ai-ops/*`.
- Thêm timeout 8 giây cho request Supabase phía backend.
- Không để lỗi của một khối làm đơ toàn bộ AI Center.
- Nếu lỗi, UI hiện lỗi ngay trong đúng khối thay vì treo "Đang tải...".
- Nút "Làm mới" có thể thử tải lại.

## Lưu ý deploy
Sau deploy cần Ctrl+F5. Nếu vẫn báo lỗi, xem nội dung lỗi đỏ trong UI hoặc log Render để biết route nào đang treo.
