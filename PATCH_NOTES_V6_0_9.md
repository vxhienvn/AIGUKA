# AIGUKA V6.0.9 - Ad Mapping Active Account Filter Fix

- Ad Mapping chỉ đọc quảng cáo trong tài khoản đang chọn khi lọc tài khoản.
- Mặc định chỉ lấy quảng cáo có effective_status=ACTIVE.
- Loại tài khoản quảng cáo bị disabled/suspended/closed/unsettled khỏi danh sách hoạt động.
- Không kéo mapping cũ của QC không còn trả về từ Meta vào màn hình active mặc định.
- Sửa lưu Supabase khi schema chưa có account_status/ad_account_name bằng compatibility fallback.

Migration tùy chọn: database/SUPABASE_PATCH_V6_0_9_AD_MAPPING_STATUS.sql
