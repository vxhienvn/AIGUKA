# AIGUKA V6.1 - LT-05 Meta Identity Mapping

## Mục tiêu
Giải quyết 3 lỗi chính của Lead Tracker:

1. Chưa lấy được tên quảng cáo.
2. Chưa lấy được tên tài khoản quảng cáo.
3. Chưa lấy được tên khách hàng.

## Nguyên tắc giữ nguyên

- Lead thật vẫn xác định từ `messages` bằng SĐT/Zalo trong tin nhắn khách.
- Không sửa Dashboard cũ.
- Không xóa bảng cũ.
- Không dùng số thống kê tổng của Pancake làm KPI chính.

## Bảng mới

Chạy migration:

```text
database/migrations/20260703_004_lt_05_meta_identity_mapping.sql
```

Thêm:

- `lt_ad_identities`
- `lt_conversation_identities`
- `v_lt_identity_coverage`
- `lt_apply_identity_mappings()`

## API mới

```text
GET  /api/leadtracker/identity/status
POST /api/leadtracker/identity/upsert
POST /api/leadtracker/identity/bulk
POST /api/leadtracker/identity/sync-pancake?limit=300
```

## UI mới

Trang `/lead-tracker` đã có:

- Filter thời gian: hôm nay, hôm qua, 7 ngày, 30 ngày, khoảng tùy chọn.
- Bảng chính theo quảng cáo.
- Tên quảng cáo in đậm.
- Tên tài khoản QC in mờ bên dưới.
- Danh sách SĐT trong từng quảng cáo.
- Click SĐT / Xem số để mở hội thoại.
- Toggle hiển thị cột Pancake.

## Ghi chú

Nếu `ad_id/ad_name/ad_account_name` vẫn là `null`, cần chạy sync mapping từ Meta Business Suite hoặc Pancake.
Lead Tracker vẫn đúng ở phần SĐT thật, chỉ thiếu danh tính quảng cáo.
