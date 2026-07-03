# AIGUKA V6.1 - LT-04 Lead Tracker UI Core

## Base
- Built from: `AIGUKA-main-v6.1-LT-03-engine-completion.zip`

## Goal
Hoàn thiện yêu cầu cốt lõi:

> Mỗi quảng cáo có bao nhiêu SĐT, cụ thể là số nào, của khách nào, xem được hội thoại nào làm bằng chứng.

## Added
- `public/lead-tracker.html`
- `GET /lead-tracker`
- `GET /api/leadtracker/ad-summary`
- `GET /api/leadtracker/ad-leads?ad_key=...`

## Modified
- `src/app.js`
- `src/routes/leadTrackerCoreRoutes.js`
- `src/services/leadTracker/leadTrackerEngine.js`

## Not changed
- Không sửa Dashboard cũ.
- Không xóa bảng cũ.
- Không sửa Meta/Pancake dashboard.
- Không đọc `ad_phone_leads` cũ.
- Lead Tracker vẫn đọc từ `lt_*`, mà `lt_*` được rebuild từ `messages`.

## Usage
1. Deploy.
2. Mở `/lead-tracker`.
3. Nếu chưa có dữ liệu, bấm `Quét lại từ messages`.
4. Bấm `Xem số` ở từng nhóm quảng cáo.
5. Bấm `Xem hội thoại` để mở timeline/evidence.

## Note
Nếu `ad_id/ad_name` chưa có trong `lt_leads`, UI sẽ gom vào nhóm `Chưa rõ quảng cáo`. Phase sau mới bổ sung Meta/Pancake mapping để gắn đúng quảng cáo.
