# Hướng dẫn deploy AIGUKA 5.3.0

## 1. Deploy như bản 5.2.3
Bản 5.3.0 giữ nguyên cấu trúc deploy của 5.2.3.

Trên Render hoặc server hiện tại:

```bash
npm install
npm start
```

## 2. Biến môi trường giữ nguyên
Không cần thêm biến môi trường mới.

Các biến cũ vẫn dùng:

- `PAGE_ACCESS_TOKEN`
- `VERIFY_TOKEN`
- `OPENAI_API_KEY`
- `BOT_REPLY_ENABLED`
- `SUPABASE_ENABLED`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AIGUKA_PUBLIC_URL`

## 3. Cách test nhanh sau deploy

### Test 1: Khách xưng anh
Khách nhắn:

```text
Anh hỏi mẫu quạt này bao nhiêu
```

Bot nên gọi:

```text
Dạ anh...
```

Không được gọi `anh/chị`.

### Test 2: Khách xưng chị
Khách nhắn:

```text
Chị muốn xem mẫu lavabo
```

Bot nên gọi:

```text
Dạ chị...
```

### Test 3: Khách xưng cô/chú
Khách nhắn:

```text
Cô muốn xem bồn cầu thông minh
```

Bot nên gọi:

```text
Dạ cô...
Cháu...
```

Không được xưng `em` với cô/chú.

### Test 4: Khách không xưng gì
Khách nhắn:

```text
Giá bao nhiêu
```

Bot sẽ mặc định gọi `anh` và giữ nhất quán trong cuộc hội thoại.

## 4. Log cần quan sát
Trong `customer_states.json`, kiểm tra trường:

```json
"humanProfile": {
  "address": "anh",
  "selfPronoun": "em",
  "addressLocked": true
}
```

Nếu có trường này là Brain v1 Human Address Policy đã hoạt động.
