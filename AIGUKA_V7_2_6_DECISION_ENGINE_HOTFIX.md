# AIGUKA V7.2.6 Decision Engine Hotfix

## Mục tiêu
Sửa hướng kiến trúc: các rule quan trọng không còn chỉ nằm trong prompt/V5 reply, mà được thực thi bằng code trước khi gọi AI.

## Đã sửa trong `src/app.js`

### 1. Thêm Central Decision Engine
Các hàm mới:
- `getAdScopeFromEventAndState`
- `detectExplicitProductForDecision`
- `isInfoRequestIntent`
- `decideBotActionV726`
- `executeBotActionV726`

Decision Engine chạy ngay sau khi lưu tin khách, trước `reply_bot_v5` và trước legacy workflow.

### 2. NOTE 01
Khách hỏi địa chỉ/ship/giờ mở cửa/bảo hành/lắp đặt là service intent.

Kết quả:
- Trả lời trực tiếp câu hỏi vận hành.
- Không tự khóa sản phẩm từ Ads Mapping.
- Không tự nhảy sang bồn cầu thông minh/lavabo/quạt nếu khách chưa nói.

### 3. NOTE 02
Khách hỏi mẫu/ảnh/catalogue/giá/thông tin là lead action cứng.

Kết quả:
- Nếu khách nói rõ sản phẩm: dùng sản phẩm khách nói.
- Nếu khách chưa nói rõ sản phẩm: dùng Ads Mapping làm phạm vi slide nhóm.
- Gửi slide trước, sau đó xin SĐT/Zalo.
- Không để V5/AI quyết định có gửi slide hay không.

### 4. Ads Mapping chỉ còn là scope/context
Đã sửa `createAdSession`, `updateCurrentSessionFromEvent`, `resolveWorkflowProduct`:
- Ads Mapping không tự gán `currentTopic/productType/lockedProduct` nữa.
- Ads Mapping lưu vào `adProductScope/lastAdScope`.
- Product cụ thể chỉ khóa khi khách nói rõ hoặc Decision Engine thực hiện action phù hợp.

## Test cú pháp
Đã chạy:

```bash
node --check src/app.js
```

Kết quả: không lỗi cú pháp.

## Các case cần test production
1. QC tổng hợp + “cho xin địa chỉ” → trả địa chỉ, không nói bồn cầu.
2. QC tổng hợp + “em ở Ninh Bình” → trả lời ship/khu vực, không tự gán sản phẩm.
3. QC tổng hợp + “xin mẫu lavabo” → gửi slide lavabo + xin SĐT/Zalo.
4. QC bồn cầu + “có mẫu không” → gửi slide nhóm bồn cầu + xin SĐT/Zalo.
5. QC bất kỳ + “giá sao” → gửi slide theo scope/sản phẩm + xin SĐT/Zalo, không báo giá sâu.
6. Admin đang trả lời → bot không chen ngang; Decision Engine không chạy auto slide trong admin hold.
