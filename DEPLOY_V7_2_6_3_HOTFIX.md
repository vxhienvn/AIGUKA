# AIGUKA v7.2.6.3 Hotfix Deploy Guide

## Mục tiêu bản này

Bản này sửa 3 lỗi phát sinh sau 7.2.6.2:

1. **Xưng hô trong Decision Engine**
   - Các tin do Decision Engine sinh ra cũng đi qua `applyHumanAddressPolicy()`.
   - Nếu khách xưng “chú/cô/bác/ông/bà”, bot phải xưng “cháu”.
   - Không dùng “anh/chị” trong tin action cứng.

2. **Chống lấy sai ngữ cảnh cũ**
   - Nếu khách trả lời một QC mới/current ad entry, scope của QC hiện tại thắng context cũ.
   - Nếu QC hiện tại chưa map được nhóm sản phẩm, bot không được fallback sang `currentTopic/lockedProduct` cũ để gửi nhầm slide.
   - `productItemKey` cũ chỉ được dùng lại khi cùng nhóm sản phẩm.

3. **Chống gửi lặp slide/showcase**
   - Cùng action + cùng QC/scope + cùng product/item trong 10 phút sẽ không gửi lại carousel/slide.
   - Bot chỉ nhắc nhẹ “đã gửi mẫu ở trên” và xin SĐT/Zalo.

## Lệnh deploy GitHub → Render

```bash
git add .
git commit -m "AIGUKA v7.2.6.3 context address dedup hotfix"
git push origin main
```

Render auto deploy nếu service đang bật auto deploy.

## Kiểm tra sau deploy

Mở endpoint:

```text
/api/version
```

Kỳ vọng version:

```text
7.2.6.3-context-address-dedup-hotfix
```

## Test nhanh bắt buộc

1. Khách từ QC tổng hợp cũ, hôm nay vào QC sen tắm, hỏi: “Giá bao nhiêu vậy cháu”
   - Kỳ vọng: scope theo QC sen tắm.
   - Không lấy đồ bếp/BEP/tủ gương cũ.
   - Xưng: cháu - chú.

2. Khách hỏi lại giá trong vòng 10 phút
   - Kỳ vọng: không gửi lại slide/card.
   - Chỉ nhắc đã gửi mẫu ở trên và xin SĐT/Zalo.

3. Khách vào QC mới nhưng mapping chưa có sản phẩm
   - Kỳ vọng: không fallback sang sản phẩm cũ.
   - Bot để V5/legacy hỏi rõ nhóm hoặc xử lý an toàn.

4. Khách xưng chú/cô/bác
   - Kỳ vọng: mọi tin bot, kể cả Decision Engine, dùng đúng vai xưng hô.

## Rủi ro còn lại

- Nếu Ads Mapping hiện tại sai hoặc chưa map QC sen tắm, bot sẽ không tự đoán từ context cũ nữa; có thể hỏi lại nhóm thay vì gửi slide. Đây là hành vi an toàn hơn gửi nhầm.
- Ảnh không hiển thị trên Meta Business/Pancake có thể liên quan định dạng public URL/Google Drive/CDN, chưa xử lý triệt để trong bản này.
