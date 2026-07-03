# AIGUKA V6.1 - LT-03 Engine Completion

Base source: AIGUKA-main-v6.1-LT-02.5-lead-intelligence(1).zip

## Mục tiêu
Hoàn thiện Lead Tracker Core theo checklist đã chốt, không đổi kiến trúc và không động vào Dashboard cũ / Meta / Pancake / bảng cũ.

## Đã thêm
- `src/services/leadTracker/customerResolver.js`
- `src/services/leadTracker/conversationBuilder.js`
- `src/services/leadTracker/timelineBuilder.js`

## Đã sửa
- `src/services/leadTracker/leadTrackerEngine.js`
  - Analyze/Rescan phân tích theo toàn bộ `conversation_id`, không chỉ message chứa SĐT.
  - Customer Resolver giảm tình trạng `customer_name = null` bằng fallback nhiều nguồn.
  - Ghi `first_message_at`, `last_message_at` theo toàn bộ hội thoại.
  - Ghi toàn bộ message của conversation vào `lt_lead_messages` cho mỗi lead.
  - Ghi timeline toàn bộ hội thoại vào `lt_timeline_events`.
  - Product/intent/need/score lấy từ toàn bộ hội thoại của khách.
  - Debug phone tìm thêm trong `lt_leads` và `lt_evidence`.
  - Debug conversation trả timeline + phân tích conversation.
- `src/services/leadTracker/leadClassifier.js`
  - Thêm `classifyLeadConversation()`.
- `src/routes/leadTrackerCoreRoutes.js`
  - Cập nhật version LT-03.

## Không thay đổi
- Không xóa bảng cũ.
- Không sửa `ad_phone_leads`.
- Không sửa Dashboard cũ.
- Không sửa Meta/Pancake.
- Không thêm bảng mới.

## Test nhanh sau deploy
```text
/api/leadtracker/analyze?limit=5000
/api/leadtracker/rescan?limit=5000
/api/leadtracker/summary
/api/leadtracker/intelligence/summary
/api/leadtracker/debug/conversation/<conversation_id>
/api/leadtracker/debug/phone/<phone>
```

## Ghi chú
LT-03 không cần chạy thêm SQL nếu đã chạy đủ các migration LT-02.3/02.4/02.5 trước đó.
