# AIGUKA 5.3.0 - Brain v1 Human Address Policy

## Mục tiêu
- Giữ nguyên nền 5.2.3 sale-center modular.
- Bổ sung lớp Brain v1 bước đầu: chọn ngữ cảnh con người trước khi bot trả lời.
- Không cho bot nói chuyện máy móc bằng cách gọi khách là `anh/chị`.

## Thay đổi chính

### 1. Human Address Policy
Bot tự chọn một đại từ nhân xưng cụ thể cho từng khách:

- Khách xưng `anh` → gọi khách là `anh`, bot xưng `em`.
- Khách xưng `chị` → gọi khách là `chị`, bot xưng `em`.
- Khách xưng `em` → mặc định gọi khách là `chị`, bot xưng `em`.
- Khách xưng `chú`, `cô`, `bác`, `ông`, `bà` → gọi đúng vai, bot xưng `cháu`.
- Khách xưng trung tính như `tôi`, `tớ`, `mình`, `bạn` → mặc định gọi khách là `anh` để tránh dùng `anh/chị`.
- Nếu khách không xưng gì → mặc định chọn `anh` và khóa trong hội thoại để không lúc anh lúc chị.

### 2. Khóa xưng hô theo từng khách
Thêm `state.humanProfile` trong `customer_states.json`:

```json
{
  "humanProfile": {
    "address": "anh",
    "selfPronoun": "em",
    "addressLocked": true,
    "addressConfidence": 0.97,
    "addressSource": "customer_pronoun_anh"
  }
}
```

Nếu khách tự sửa lại vai, ví dụ: `chị nhé em`, bot sẽ cập nhật lại thành `chị`.

### 3. Chặn cuối trước khi gửi Messenger
Tất cả text reply đi qua `sendMessage()` đều được xử lý lại:

- `anh/chị` → đổi thành đại từ đã chọn.
- Nếu khách là `chú/cô/bác/ông/bà`, bot đổi xưng `em` thành `cháu`.
- Nếu đã khóa là `chị`, các chỗ gọi nhầm `anh` sẽ được đổi thành `chị`.
- Nếu đã khóa là `anh`, các chỗ gọi nhầm `chị` sẽ được đổi thành `anh`.

### 4. Áp dụng cả carousel/template
Template/carousel cũng được lọc `title` và `subtitle` trước khi gửi để tránh sót cách gọi `anh/chị`.

### 5. Bổ sung Brain v1 Context
Thêm hàm `buildBrainV1Context()` để chuẩn bị cho các bản sau:

- customer profile
- humanProfile
- product context
- conversation context
- policy flags

Bản 5.3 chưa viết lại toàn bộ Decision Engine, nhưng đã đặt nền để phát triển Brain v1 theo hướng có kỷ luật.

## Kiểm tra kỹ thuật
- Đã chạy `node --check src/app.js`.
- Đã chạy `node --check src/prompts/salesPrompt.js`.

## Ghi chú vận hành
- Bản này vẫn giữ nguyên toàn bộ logic 5.2.3.
- Thay đổi tập trung ở lớp xưng hô và guard cuối trước khi gửi tin.
- Nếu muốn đổi mặc định `tôi/mình/bạn` từ `anh` sang `chị`, chỉ cần chỉnh trong `inferHumanAddressFromText()`.
