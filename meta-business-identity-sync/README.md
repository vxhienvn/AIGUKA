# AIGUKA Meta Business Identity Sync

Module này chỉ lấy **identity quảng cáo** từ Meta Business Suite:
- tên khách nếu đọc được
- sender/profile id nếu đọc được
- ID quảng cáo
- tên quảng cáo
- tên page/tài khoản nếu đọc được

Nó **không dùng để đếm SĐT**. SĐT thật vẫn được Lead Tracker lọc từ bảng `messages`.

## Chạy

```bash
cd meta-business-identity-sync
npm install
npx playwright install chromium
AIGUKA_BASE_URL=https://manychat-openai-6oiq.onrender.com npm run login
```

Đăng nhập Meta Business Suite trong trình duyệt hiện ra, mở Inbox hoặc Bình luận.
Sau đó chạy:

```bash
AIGUKA_BASE_URL=https://manychat-openai-6oiq.onrender.com META_IDENTITY_LIMIT=100 npm run sync
```

Sau sync, mở:

```text
/api/leadtracker/identity/status
/lead-tracker
```

Nếu Meta không expose được sender_id/conversation_id trong DOM, mapping sẽ cần Pancake hoặc thao tác thủ công `/api/leadtracker/identity/upsert`.
