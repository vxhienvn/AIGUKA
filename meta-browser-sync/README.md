# AIGUKA Meta Browser Sync / Lead Tracker V6.0.3

Mục tiêu của module này: biết **mỗi quảng cáo ra bao nhiêu SĐT**, **đó là những số nào**, và có **lịch sử hội thoại làm bằng chứng** để đối chiếu với Pancake/Zalo flag.

## 1) Chạy SQL trước

Mở Supabase SQL Editor và chạy:

```sql
database/SUPABASE_PATCH_V6_0_3_LEAD_TRACKER.sql
```

File này tạo các bảng:

- `ad_phone_leads`: lead theo từng quảng cáo, có số và bằng chứng.
- `lead_messages`: những tin nhắn chứa SĐT/Zalo.
- `conversation_snapshots`: lịch sử hội thoại để đối chiếu.
- `app_settings`: nơi lưu cấu hình bền vững khi update version.
- `v_ad_lead_summary`: view tổng hợp theo quảng cáo.

## 2) Cài Playwright riêng cho module

Không cài Playwright vào Cloudflare Worker. Module này phải chạy trên VPS/Render/Railway/máy tính có Chromium.

```bash
cd meta-browser-sync
npm install
npm run install-browser
```

## 3) Cấu hình `.env`

Tạo file `meta-browser-sync/.env` theo `.env.example` hoặc dùng biến môi trường sẵn có của project.

Bắt buộc:

```bash
SUPABASE_ENABLED=true
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
META_BUSINESS_INBOX_URL=https://business.facebook.com/latest/inbox/all
META_SYNC_HEADLESS=false
META_SYNC_MAX_CONVERSATIONS=50
```

## 4) Đăng nhập Meta lần đầu

```bash
npm run sync:meta:login
```

Một cửa sổ Chromium sẽ mở. Đăng nhập Meta Business Suite, vào Inbox, rồi quay lại terminal nhấn Enter. Session được lưu ở:

```text
meta-browser-sync/session/meta-storage-state.json
```

## 5) Đồng bộ hội thoại

Từ thư mục gốc project:

```bash
npm run sync:meta
```

Hoặc trong thư mục module:

```bash
cd meta-browser-sync
npm run sync
```

Module sẽ lưu:

- số điện thoại thật tìm thấy trong nội dung chat;
- cờ Zalo nếu thấy chữ Zalo/QR Zalo;
- lịch sử hội thoại snapshot;
- ad_id/ad_name đọc được từ giao diện Meta nếu có.

Lưu ý: Meta UI thay đổi thường xuyên, nên lần đầu nên chạy `META_SYNC_HEADLESS=false` để nhìn trực tiếp. Nếu Meta không hiển thị `ad_id` trong DOM, bản ghi sẽ vào nhóm `unknown_ad`; khi đó cần bổ sung mapping từ Pancake hoặc Meta API ở bước sau.

## 6) Xem báo cáo trên Dashboard

Sau khi deploy server bản mới và chạy SQL, mở:

```text
/lead-tracker
```

Ở đây có:

- SĐT thật theo từng quảng cáo;
- cờ Zalo;
- tổng lead liên hệ;
- danh sách từng số;
- bằng chứng tin nhắn;
- lịch sử hội thoại để đối chiếu.

API:

```text
GET /api/lead-tracker/summary
GET /api/lead-tracker/ads/:adId/leads
```

## 7) Chống mất cấu hình khi update version

Bản này thêm `app_settings` và tự backup `working_settings` vào:

```text
app_settings.key = working_settings
```

Khi bảng `bot_working_settings` lỗi/missing sau update, server sẽ fallback đọc từ `app_settings`, tránh mất cấu hình giao diện cài đặt.
