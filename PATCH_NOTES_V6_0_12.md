# PATCH NOTES V6.0.12

## Fix Ad Mapping Save + Folder UI

- Sửa lỗi Supabase `PGRST204` khi bảng `ad_mappings` thiếu cột optional như `image_urls`, `effective_status`, `account_status`, `ad_account_name`, `drive_folders`, `zalo_url`, `recognition_name`, `price_range`.
- API `/api/ad-mapping/bulk` tự nhận diện cột optional bị thiếu và retry lưu với schema cũ, không làm hỏng thao tác lưu mapping.
- Frontend không gửi `image_urls` nữa vì slide hiện dùng Drive/Product Media thay vì link ảnh cũ.
- Sửa thao tác tick thư mục ảnh/slide: không render lại toàn bảng sau mỗi lần tick checkbox, tránh nhảy vị trí và loạn giá trị đang nhập.
