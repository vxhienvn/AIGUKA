# Deploy AIGUKA v7.2.6.4 - Media Dedup Safe Hotfix

## Nội dung sửa

Bản này gộp toàn bộ sửa đổi của v7.2.6.3 và bổ sung fix nhỏ nhưng quan trọng:

- Chỉ đánh dấu `lastDecisionShowcase` khi carousel/ảnh/slide thật sự gửi thành công (`mediaResult.sent === true`).
- Nếu media gửi lỗi hoặc không hiển thị, bot không còn tự nhận là "đã gửi mẫu ở trên" ở lần hỏi sau.
- Giữ nguyên các fix của v7.2.6.3:
  - Xưng hô qua `applyHumanAddressPolicy`.
  - QC hiện tại ưu tiên hơn ngữ cảnh cũ.
  - Không dùng `product_item_key` cũ nếu không khớp nhóm hiện tại.
  - Chặn AI/V5 chen sau rule action.

## Cách deploy qua GitHub + Render

```bash
git add .
git commit -m "AIGUKA v7.2.6.4 media dedup safe hotfix"
git push origin main
```

Sau đó chờ Render build xong và kiểm tra log.

## Test nhanh sau deploy

1. QC sen tắm + khách hỏi "Giá bao nhiêu vậy cháu"  
   Kỳ vọng: dùng scope sen tắm hiện tại, không lấy ngữ cảnh cũ.

2. Khách gọi "cháu"  
   Kỳ vọng: bot xưng cháu, gọi chú/cô phù hợp.

3. Media gửi lỗi/không có slide  
   Kỳ vọng: bot không nói lỗi nội bộ và lần sau không nói "đã gửi mẫu ở trên" nếu media chưa gửi thành công.

4. Media gửi thành công, khách hỏi lại trong 10 phút  
   Kỳ vọng: không gửi lặp slide, chỉ nhắc đã gửi mẫu và xin SĐT/Zalo.

5. Khách vào QC mới  
   Kỳ vọng: QC hiện tại thắng context cũ, trừ khi khách nói rõ sản phẩm khác.
