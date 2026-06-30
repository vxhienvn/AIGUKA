# AIGUKA 4.2.1 - Messenger Sync Role Fix

Hotfix sau 4.2.0:

- Sửa lỗi `normalizeForDuplicate is not defined` trong Messenger Sync Engine.
- Tự suy ra `page_id` từ Graph `/me` nếu Render chưa cấu hình `PAGE_ID/META_PAGE_ID`.
- Sửa phân loại role khi đồng bộ Messenger:
  - `from.id === page_id` => `role = admin` hoặc `bot` nếu trùng tin bot vừa gửi.
  - còn lại => `role = customer`.
- Khi Page/Sale/Pancake nhắn qua Messenger, sync sẽ ghi là `admin`, không còn tính nhầm là `customer`.
- Raw log lưu thêm `from_id`, `page_id`, `to_ids`, participant để dễ debug.

Test sau deploy:

```
/api/debug/health
/api/sync/messenger?limit=5&messages=20
/api/debug/latest-conversations?limit=5
```

Kỳ vọng:

- Không còn lỗi `normalizeForDuplicate is not defined`.
- Nếu các tin mới là sale/page trả lời thì `admin_seen` phải tăng.
- `customer_seen` chỉ tăng khi khách thật sự nhắn.
