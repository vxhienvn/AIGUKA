# AIGUKA V6.1 Stable Lead Tracker

Bản này tách Lead Tracker thành module ổn định, không dùng check constraint cũ của `ad_phone_leads`.

## Đã thêm
- `src/routes/leadTrackerStableRoutes.js`
- `/lead-tracker`
- `/meta-evidence`
- API:
  - `/api/lead-tracker/scan`
  - `/api/lead-tracker/summary`
  - `/api/lead-tracker/details`
- SQL ổn định: `database/AIGUKA_V6_1_STABLE_LEAD_TRACKER.sql`
- Module khung: `meta-browser-sync/`

## Cách deploy
1. Chạy SQL `database/AIGUKA_V6_1_STABLE_LEAD_TRACKER.sql` trong Supabase.
2. Deploy code.
3. Restart Render.
4. Mở `/lead-tracker`.
5. Bấm `Quét lại từ messages`.
