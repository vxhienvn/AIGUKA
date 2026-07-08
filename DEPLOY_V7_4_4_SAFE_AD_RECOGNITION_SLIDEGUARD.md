# AIGUKA V7.4.4 SAFE - Ad Recognition + Slide Guard

## Mục tiêu
Bản này dùng để test trên Page phụ. Không deploy thẳng lên production nếu chưa test.

## Sửa chính
- Giữ Conversation Sync Engine từ V7.4.3.
- Giữ hard outbound gate: mặc định không gửi Messenger nếu `ALLOW_BOT_OUTBOUND=false`.
- Sửa nhận diện QC tổng hợp: QC có nhiều sản phẩm / showroom / full combo / thiết bị vệ sinh không bị khóa nhầm thành bồn cầu thông minh.
- Sửa `productFromAdText`: nếu QC có nhiều nhóm sản phẩm thì trả về `combo` hoặc `null`, không phán đoán 1 sản phẩm cụ thể.
- Gỡ `wc -> toilet` trong normalize alias để giảm khóa nhầm từ QC tổng hợp.
- Sửa slide trigger: bỏ nhầm `cho anh` là xin ảnh; chỉ trigger mạnh khi khách nói xin mẫu/xem mẫu/catalog/ảnh rõ ràng.
- Không cho direct rule dùng `force` mặc định. Muốn bypass admin-off khi test phải bật `PRIORITY_RULE_FORCE_SEND=true`.

## ENV khuyến nghị khi test Page phụ
```env
ALLOW_BOT_OUTBOUND=false
BOT_REPLY_ENABLED=false
PRIORITY_RULE_FORCE_SEND=false
```

Khi chỉ sync dữ liệu, giữ OFF như trên.

Nếu muốn test bot trả lời trên Page phụ, chỉ bật sau khi chắc chắn webhook của Page phụ trỏ đúng server test:
```env
ALLOW_BOT_OUTBOUND=true
BOT_REPLY_ENABLED=true
PRIORITY_RULE_FORCE_SEND=false
```

## Lệnh deploy
```bash
git add .
git commit -m "V7.4.4 SAFE - ad recognition slide guard"
git push origin main
```

Render nếu Auto Deploy tắt:
```text
Manual Deploy -> Deploy latest commit
```

## Test nhanh
```text
/health
/api/debug/sender/<SENDER_ID>
/api/sync/messenger?limit=20&messages=300
```

## Checklist cần test Page phụ
1. QC tổng hợp showroom: khách hỏi địa chỉ -> chỉ trả địa chỉ, không tự chọn bồn cầu.
2. QC tổng hợp showroom: khách xin mẫu -> gửi combo/tổng hợp, không khóa bồn cầu.
3. QC sen vòi: khách xin mẫu -> sen vòi.
4. QC quạt: khách chọn QUAT-01 hoặc hỏi quạt -> quạt.
5. Khách cho SĐT -> handoff, không tư vấn tiếp.
6. Không còn câu giá hotline thành “973-974 triệu”.
