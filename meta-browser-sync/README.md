# AIGUKA Meta Browser Sync

Mục tiêu: lấy bằng chứng lead từ Meta Business Suite Inbox để biết **quảng cáo nào ra số điện thoại nào**.

## Cài đặt

```bash
cd meta-browser-sync
cp .env.example .env
npm install
npx playwright install chromium
```

Điền `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` vào `.env`.

## Đăng nhập Meta

```bash
npm run login
```

Đăng nhập Business Suite, vào Inbox, sau đó quay lại terminal bấm Enter.

## Quét dữ liệu

```bash
npm run sync
```

Sau đó mở `/lead-tracker` trên server AIGUKA.

Lưu ý: Meta thường thay đổi giao diện. Nếu selector không bắt đủ hội thoại, chạy chậm lại bằng `META_SYNC_SLOW_MS=1200` hoặc mở Business Inbox đúng tab trước khi chạy.
