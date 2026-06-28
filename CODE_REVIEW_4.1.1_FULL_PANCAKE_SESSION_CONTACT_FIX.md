# AIGUKA 4.1.1 - Full Pancake / Session / Contact Fix

## Mục tiêu
Bản này nâng cấp kiến trúc dữ liệu sau 4.1.0 để audit ngày mai chính xác hơn.

## Đã sửa
- Không lưu `zalo = "zalo"` nữa. Chỉ lưu số Zalo khi khách ghi rõ `Zalo: 09...`, `gửi qua zalo số...`, `kết bạn zalo...`.
- Thêm hàm `detectContactInfo()` nhận diện `phone`, `zalo_phone`, `has_zalo`, `contact_preference`, `zalo_qr_provided`.
- Nếu DB chưa thêm cột mới, code tự fallback về schema cũ để không chết server.
- Product group được suy luận từ text + raw referral + state/product lock, hạn chế `NULL`.
- Khi xác định được product thì lưu lại `productLock` vào state.
- Intent engine nhận diện thêm: phản đối Zalo, sai sản phẩm, hỏi tính năng, hỏi vận chuyển, hỏi bảo hành.
- Pancake sync có chống trùng tốt hơn bằng `pancake_message_id` nếu có.
- Pancake sync giữ role `admin/customer/pancake_unknown`, không bỏ qua tin không phân loại được.
- Thêm endpoint `/supabase-migration-4-1-1-sql` để lấy SQL bổ sung cột CRM.
- `/supabase-audit-summary` bổ sung thống kê theo product_group và intent.

## Endpoint cần test
- `/healthz`
- `/reply-engine-health`
- `/supabase-migration-4-1-1-sql`
- `/pancake-sync-to-supabase?limit=100&details=1`
- `/supabase-audit-summary?limit=500`

## SQL cần chạy trên Supabase
Mở `/supabase-migration-4-1-1-sql`, copy SQL và chạy trong Supabase SQL Editor.

## Lưu ý
Bản này không thay đổi mạnh luồng trả lời khách. Trọng tâm là dữ liệu/audit: session, Pancake sync, intent, product group và contact/Zalo.
