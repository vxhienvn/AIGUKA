# AIGUKA V6.1 - Lead Tracker Core

## Mục tiêu

Tạo module Lead Tracker độc lập, chỉ đọc dữ liệu gốc từ `public.messages` để xác định khách hàng có SĐT/Zalo thật.

## Nguyên tắc

- Không xóa bảng cũ.
- Không sửa trực tiếp `ad_phone_leads` cũ.
- Dashboard cũ vẫn giữ nguyên để đọc Meta/Pancake và so sánh.
- Lead Tracker Core chỉ ghi vào bảng mới `lt_*`.
- Mọi KPI Lead phải có bằng chứng truy ngược được tới tin nhắn trong `messages`.

## File mới

- `database/migrations/20260703_001_lead_tracker_core.sql`
- `database/AIGUKA_V6_1_LEAD_TRACKER_CORE_V1_1.sql`
- `src/services/leadTracker/phoneExtractor.js`
- `src/services/leadTracker/supabaseLtClient.js`
- `src/services/leadTracker/leadTrackerEngine.js`
- `src/routes/leadTrackerCoreRoutes.js`

## API mới

- `GET /api/leadtracker/health`
- `GET /api/leadtracker/analyze?limit=5000`
- `POST /api/leadtracker/rescan`
- `GET /api/leadtracker/summary`
- `GET /api/leadtracker/list?limit=100`
- `GET /api/leadtracker/lead/:id`
- `GET /api/leadtracker/debug/:phone`

Alias:

- `/api/lead-tracker/...` cũng dùng được.

## Cách chạy

1. Vào Supabase SQL Editor.
2. Chạy file `database/migrations/20260703_001_lead_tracker_core.sql`.
3. Deploy code.
4. Kiểm tra:

```text
/api/leadtracker/health
```

5. Analyze trước, không ghi database:

```text
/api/leadtracker/analyze?limit=5000
```

6. Nếu kết quả hợp lý, rebuild bảng `lt_*`:

```text
/api/leadtracker/rescan?limit=5000
```

## Lưu ý

- `rescan` sẽ xóa dữ liệu trong các bảng `lt_*` rồi rebuild từ `messages`.
- Không xóa `messages`, không xóa Dashboard cũ, không xóa Pancake/Meta data.
