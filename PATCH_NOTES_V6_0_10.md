# PATCH NOTES V6.0.10

## Ad Mapping Supabase Legacy Schema Fallback
- Sửa lỗi lưu mapping khi bảng `ad_mappings` chưa có cột `effective_status`.
- Khi Supabase báo thiếu cột mới, API `/api/ad-mapping/bulk` tự fallback sang schema cũ và bỏ các trường mở rộng: `price_range`, `recognition_name`, `drive_folders`, `zalo_url`, `ad_account_name`, `account_status`, `effective_status`.
- Bộ lọc Meta vẫn dùng dữ liệu đọc trực tiếp từ Meta trên UI; không bắt buộc phải lưu trạng thái quảng cáo vào Supabase.

## Khuyến nghị
Nếu muốn lưu đầy đủ trạng thái QC/tài khoản vào Supabase, chạy migration `database/SUPABASE_PATCH_V6_0_9_AD_MAPPING_STATUS.sql`.
