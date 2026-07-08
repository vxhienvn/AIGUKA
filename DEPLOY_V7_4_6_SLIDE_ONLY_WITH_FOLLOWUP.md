# AIGUKA V7.4.6 SAFE - Slide Only + 1 Follow-up Text

Mục tiêu: chỉ test chức năng gửi slide trên Page phụ.

## Luồng được phép

1. Khách nhắn/xin mẫu/xem mẫu/catalog/ảnh rõ ràng.
2. Bot nhận diện sản phẩm.
3. Bot gửi slide/template/image.
4. Bot gửi thêm đúng 1 cụm text an toàn:

> Dạ em gửi anh/chị vài mẫu ưa chuộng, bán chạy bên em để mình tham khảo trước ạ. Bên em còn nhiều mẫu khác nữa; anh/chị muốn xem thêm mẫu phù hợp hơn hoặc cần tư vấn cụ thể thì cho em xin SĐT/Zalo, bên em gửi album đầy đủ và tư vấn đúng nhu cầu cho mình nhé.

## Luồng vẫn bị chặn

- Lời chào tự động.
- Báo giá.
- Tư vấn dài.
- Hỏi địa chỉ.
- Follow-up cũ.
- GPT/AI reply.
- Pending text.
- Force send text khác.

## ENV test Page phụ

```env
SLIDE_ONLY_TEST_MODE=true
ALLOW_SLIDE_OUTBOUND=true
ALLOW_SLIDE_FOLLOWUP_TEXT=true
ALLOW_BOT_OUTBOUND=false
BOT_REPLY_ENABLED=false
PRIORITY_RULE_FORCE_SEND=false
```

## Deploy

```bash
git add .
git commit -m "V7.4.6 SAFE - slide only with followup text"
git push origin main
```

## Kiểm tra version

Mở:

```text
/api/version
```

Cần thấy:

```json
{
  "slide_only": true,
  "slide_outbound_allowed": true,
  "text_outbound_allowed": false,
  "slide_followup_text_allowed": true
}
```

## Lưu ý

Không bật `ALLOW_BOT_OUTBOUND=true` khi test slide-only.
