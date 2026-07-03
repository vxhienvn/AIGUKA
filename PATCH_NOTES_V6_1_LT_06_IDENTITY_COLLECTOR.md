# AIGUKA V6.1 - LT-06 Identity Collector

Mục tiêu cốt lõi: gắn được **Tên QC / ID QC / Tên TKQC / Tên khách** vào Lead Tracker để xem mỗi quảng cáo có bao nhiêu SĐT và những số nào.

## Không thay đổi
- Không xóa Dashboard cũ.
- Không xóa bảng cũ.
- Không dùng Pancake/Meta để xác định Lead thật.
- Lead thật vẫn lấy từ `messages` + bằng chứng tin nhắn khách.

## Đã thêm/sửa
- Cải thiện `/api/leadtracker/identity/sync-pancake` để map bằng `sender_id` nếu `conversation_id` Pancake không trùng `lt_leads`.
- Thêm GET cho `/api/leadtracker/identity/sync-pancake` để test nhanh trên trình duyệt.
- Thêm `/api/leadtracker/identity/apply` để áp identity đang có vào `lt_leads`.
- Thêm `/api/leadtracker/identity/sync-existing` để thử lấy identity từ các cột có sẵn trong `messages`.
- Thêm `meta-business-identity-sync/` dùng Playwright để quét Meta Business Suite Inbox/Comment và gửi identity về AIGUKA.
- `bulkUpsertIdentities` không còn fail toàn bộ khi một item thiếu id; nó trả về `errors_count`.

## Cách test nhanh
1. Deploy code.
2. Gọi:
   `/api/leadtracker/identity/status`
3. Thử sync từ dữ liệu hiện có:
   `/api/leadtracker/identity/sync-existing?limit=5000`
4. Nếu dùng Pancake:
   `/api/leadtracker/identity/sync-pancake?limit=300`
5. Apply lại:
   `/api/leadtracker/identity/apply`
6. Mở `/lead-tracker`.

## Meta Business Suite
Nếu vẫn chưa có tên QC/TKQC, chạy module:
```bash
cd meta-business-identity-sync
npm install
npx playwright install chromium
AIGUKA_BASE_URL=https://manychat-openai-6oiq.onrender.com npm run login
AIGUKA_BASE_URL=https://manychat-openai-6oiq.onrender.com META_IDENTITY_LIMIT=100 npm run sync
```
