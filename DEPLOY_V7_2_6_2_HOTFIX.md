# AIGUKA v7.2.6.2 Hotfix - Deploy Guide

## Nội dung đã sửa

### Vấn đề 1 - Product Showcase Mode
Khi khách đã nói rõ sản phẩm, ví dụ:
- `máy hút mùi`
- `bếp từ`
- `lavabo`
- `quạt vàng 10 cánh`

Bot không hỏi thêm nhu cầu khô cứng nữa. Bot sẽ:
1. Xác nhận sản phẩm.
2. Gửi slide/ảnh/mẫu nổi bật nếu có.
3. Xin SĐT/Zalo.
4. Dừng pipeline, không cho AI/V5 chen thêm tin.

### Vấn đề 2 - Safe Fallback, không lộ lỗi nội bộ
Khi khách hỏi giá/mẫu nhưng hệ thống chưa lấy được slide đúng nhóm, bot không được nói:
- `chưa lấy được slide`
- `không tìm thấy mapping`
- `không có dữ liệu`

Bot sẽ fallback theo hướng bán hàng:
1. Trả lời khoảng giá/giá phụ thuộc mẫu.
2. Thử gửi slide bằng rule media cũ.
3. Nếu fail, thử lại bằng Showcase/Drive Mapping.
4. Nếu vẫn không có ảnh, vẫn xin SĐT/Zalo tự nhiên, không lộ lỗi hệ thống.

## File chính đã sửa

```txt
src/app.js
```

Các vùng sửa chính:
- `productDisplayNameForDecision()`
- `getSafePriceRangeForDecision()`
- `buildV7262IntroByDecision()`
- `buildV7262CloseByDecision()`
- `decideBotActionV726()`
- `executeBotActionV726()`

## Lệnh kiểm tra trước deploy

```bash
node --check src/app.js
```

Nếu không hiện lỗi là cú pháp OK.

## Deploy bằng GitHub + Render Auto Deploy

Giải nén file zip, copy đè toàn bộ source lên project đang dùng, sau đó chạy:

```bash
git add .
git commit -m "AIGUKA v7.2.6.2 product showcase and safe fallback hotfix"
git push origin main
```

Nếu project dùng nhánh khác, thay `main` bằng tên nhánh đang deploy.

## Test bắt buộc sau deploy

### Test 1 - Máy hút mùi, hỏi tư vấn
Khách:
```txt
xin tư vấn
máy hút mùi
```
Kỳ vọng:
- Bot nhận diện máy hút mùi/đồ bếp.
- Gửi mẫu/slide nếu có.
- Xin SĐT/Zalo.
- Không hỏi lại `anh cần nhu cầu gì`.

### Test 2 - Máy hút mùi, hỏi giá
Khách:
```txt
may hut mui bao nhieu 1 cai vay e
```
Kỳ vọng:
- Bot trả lời khoảng giá chung.
- Gửi mẫu/slide nếu có.
- Xin SĐT/Zalo.
- Không nói `chưa lấy được slide đúng nhóm`.

### Test 3 - QC tổng hợp, hỏi địa chỉ
Khách:
```txt
cho xin địa chỉ
```
Kỳ vọng:
- Chỉ trả địa chỉ.
- Không tự gán bồn cầu/lavabo/quạt.

### Test 4 - Khách đã cho số
Kỳ vọng:
- Bot không xin số lại.
- Chuyển sang trạng thái handover/sale hỗ trợ.

## Rollback

Nếu có lỗi nghiêm trọng, rollback về bản trước:

```bash
git revert HEAD
git push origin main
```
