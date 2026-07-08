
# AIGUKA V7.5.0 - Page Routing + Slide Only Parallel Mode

## Mục tiêu

- AIcake tiếp tục chạy ở Page cũ.
- AIGUKA chỉ chạy ở Page được chọn để test riêng.
- Page không bật AIGUKA: webhook vẫn có thể ghi log/audit, nhưng AIGUKA không gửi text/slide.

## Trang cấu hình

Sau deploy mở:

```text
/page-routing
```

Chức năng:

- Load cấu hình Page hiện tại.
- Load toàn bộ Page từ Meta nếu có `META_USER_ACCESS_TOKEN`.
- Chọn ON/OFF AIGUKA cho từng Page.
- Mode mặc định: `slide_only`.
- Lưu cấu hình vào Supabase `app_settings` key `aiguka_page_routing`, fallback local `page_routing.json`.

## ENV khuyến nghị

```text
SLIDE_ONLY_TEST_MODE=true
ALLOW_SLIDE_OUTBOUND=true
ALLOW_BOT_OUTBOUND=false
BOT_REPLY_ENABLED=false
DISABLE_ALL_BACKGROUND_WORKERS=true
```

Nếu muốn load toàn bộ Page từ Meta:

```text
META_USER_ACCESS_TOKEN=<user token có quyền pages_show_list/pages_manage_metadata/pages_messaging>
```

Có thể cấu hình nhiều Page thủ công bằng ENV:

```json
PAGE_ACCESS_TOKENS_JSON={"PAGE_ID_1":{"name":"Page test","access_token":"TOKEN","enabled":true},"PAGE_ID_2":{"name":"Page cũ AIcake","access_token":"TOKEN","enabled":false}}
```

## Luật an toàn

- `isAigukaPageEnabled(pageId)` là cổng đầu vào theo Page.
- `messageGatewayGraphSend()` kiểm tra Page Routing lần cuối trước khi gửi.
- Nếu Page bị tắt: trả về `PAGE_ROUTING_DISABLED`, không gửi Messenger.
- Token gửi Messenger được chọn theo Page ID, không còn phụ thuộc duy nhất vào `PAGE_ACCESS_TOKEN`.

## API

```text
GET  /api/pages/routing
GET  /api/pages/routing?refresh=1
POST /api/pages/routing
GET  /api/pages/discover
```
