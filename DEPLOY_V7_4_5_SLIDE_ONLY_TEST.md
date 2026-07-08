# AIGUKA V7.4.5 - SLIDE ONLY TEST MODE

Mục tiêu: test duy nhất chức năng gửi slide / carousel / ảnh mẫu trên Page phụ.

## An toàn mặc định
- Chặn toàn bộ text reply: lời chào, báo giá, địa chỉ, xin SĐT, follow-up, pending text.
- Chỉ cho phép gửi `template` hoặc `image` nếu bật rõ biến slide-only.
- Vẫn sync Messenger/Supabase bình thường.
- Không bật cho Page chính khi chưa test xong.

## ENV bắt buộc khi test Page phụ

```env
SLIDE_ONLY_TEST_MODE=true
ALLOW_SLIDE_OUTBOUND=true
ALLOW_BOT_OUTBOUND=false
BOT_REPLY_ENABLED=false
PRIORITY_RULE_FORCE_SEND=false
```

Ý nghĩa:
- `SLIDE_ONLY_TEST_MODE=true`: vào chế độ chỉ test slide.
- `ALLOW_SLIDE_OUTBOUND=true`: cho phép gửi carousel/image.
- `ALLOW_BOT_OUTBOUND=false`: không cho gửi text outbound thường.
- `BOT_REPLY_ENABLED=false`: bot trả lời thường tắt.

## Lệnh deploy

```bash
git add .
git commit -m "V7.4.5 SAFE - slide only test mode"
git push origin main
```

Render nếu không auto deploy:

```text
Manual Deploy → Deploy latest commit
```

## Kiểm tra sau deploy

Mở:

```text
/api/version
```

Phải thấy:

```json
"version": "7.4.5-slide-only-test-safe",
"slide_only": true,
"slide_outbound_allowed": true,
"text_outbound_allowed": false
```

## Kịch bản test

Tin KH nên gửi:

```text
xin mẫu quạt
xin mẫu lavabo
cho xem mẫu bồn tắm
cho em xem ảnh bếp từ hút mùi
```

Kỳ vọng:
- Có carousel/image nếu mapping và ảnh có dữ liệu.
- Không có lời chào text.
- Không có báo giá.
- Không có địa chỉ.
- Không xin SĐT/Zalo.

## Log cần xem

```text
[SLIDE_ONLY] skip intro text
[SLIDE_ONLY] skip close text after media
[MESSAGE_GATEWAY_SEND_REQUEST] messageType: template/image
[OUTBOUND_TEXT_BLOCKED_SLIDE_ONLY]
```

Nếu thấy text gửi ra Messenger là lỗi nghiêm trọng, không test tiếp.
