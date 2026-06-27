# AIGUKA v3.9.10

## Deploy

```bash
git add .
git commit -m "AIGUKA 3.9.10 - Stable replies and photo request priority"
git push origin main
```

## Test nhanh sau deploy

Gửi khách thử:

```text
Lavabo này có những mẫu nào?
Xin mẫu
```

Log cần thấy:

```text
AI-01-WEBHOOK
AI-02-STATE
AI-03-PHOTO-REQUEST
AI-05-PRODUCT-ROW
AI-06-PHOTO-RULE
```

## Admin takeover qua echo

Mặc định bản này tắt takeover qua echo để tránh auto-reply quảng cáo làm bot im lặng.
Muốn bật lại:

```text
AIGUKA_ENABLE_HUMAN_TAKEOVER_ECHO=1
```
