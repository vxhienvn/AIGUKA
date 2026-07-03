# AIGUKA V6.1 - LT-02.5 Lead Intelligence

## Mục tiêu
Nâng Lead Tracker từ công cụ đếm số điện thoại thành Lead Intelligence Engine.

## Giữ nguyên
- Không xóa Dashboard cũ.
- Không sửa Meta/Pancake dashboard.
- Không sửa bảng cũ `ad_phone_leads`.
- Lead Tracker vẫn lấy `messages` làm dữ liệu gốc.

## Thêm mới
- `src/services/leadTracker/leadClassifier.js`
- Migration: `database/migrations/20260703_003_lt_02_5_lead_intelligence.sql`
- Bảng `lt_ai_analysis`
- Các cột intelligence trong `lt_leads`:
  - `intent`
  - `product_group`
  - `product_label`
  - `quantity`
  - `location_text`
  - `need_callback`
  - `need_quotation`
  - `need_sample`
  - `intelligence_summary`
- View:
  - `v_lt_intelligence_summary`
  - `v_lt_product_summary`
- API:
  - `GET /api/leadtracker/intelligence/summary`

## Test sau deploy
1. Chạy SQL migration:
   `database/migrations/20260703_003_lt_02_5_lead_intelligence.sql`
2. Restart Render.
3. Test:
   - `/api/leadtracker/analyze?limit=5000`
   - `/api/leadtracker/rescan?limit=5000`
   - `/api/leadtracker/summary`
   - `/api/leadtracker/intelligence/summary`
   - `/api/leadtracker/list`

