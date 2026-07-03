# AIGUKA V6.1 - Lead Tracker Core LT-02.3

Base: AIGUKA-main(10).zip

## Nguyên tắc
- Không xóa Dashboard cũ.
- Không sửa bảng cũ như `ad_phone_leads`.
- Lead Tracker Core chỉ đọc `messages` và ghi vào bảng mới `lt_*`.
- Meta/Pancake/Dashboard cũ chỉ dùng để so sánh ở phase sau, không làm nguồn xác định Lead thật.

## File mới
- `database/migrations/20260703_001_lead_tracker_core.sql`
- `src/services/leadTracker/phoneExtractor.js`
- `src/services/leadTracker/leadTrackerEngine.js`
- `src/routes/leadTrackerCoreRoutes.js`

## File sửa
- `src/app.js`: mount route `/api/leadtracker`

## API
- `GET /api/leadtracker/health`
- `GET /api/leadtracker/analyze?limit=5000`
- `GET|POST /api/leadtracker/rescan?limit=5000`
- `GET /api/leadtracker/summary`
- `GET /api/leadtracker/list?limit=100`
- `GET /api/leadtracker/debug/:phone`
- `GET /api/leadtracker/lead/:id`

## Cải tiến LT-02.3
- Chỉ nhận lead từ tin nhắn khách (`role=customer` hoặc source khách).
- Bỏ qua bot/page/system/meta_auto/bot_blocked.
- Chuẩn hóa SĐT Việt Nam: `+84`, `84`, dấu cách, dấu chấm, dấu gạch ngang.
- Chỉ nhận đầu số VN hợp lệ: 03/05/07/08/09.
- Có blacklist mặc định hotline `0973693677` và có thể bổ sung qua env `LT_PHONE_BLACKLIST`.
- Analyze trả thêm rejected reason để debug.
- Rescan có thể rebuild lại toàn bộ `lt_*` từ `messages`.

## Lệnh test sau deploy
1. Chạy SQL trong Supabase:
   `database/migrations/20260703_001_lead_tracker_core.sql`
2. Restart Render.
3. Analyze trước:
   `/api/leadtracker/analyze?limit=5000`
4. Nếu kết quả ổn, rebuild:
   `/api/leadtracker/rescan?limit=5000`
5. Kiểm tra summary:
   `/api/leadtracker/summary`
