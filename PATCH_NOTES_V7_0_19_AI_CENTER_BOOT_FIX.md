# V7.0.19 - AI Center Boot Fix

Sửa lỗi AI Center đứng ở trạng thái "Đang tải..." sau V7.0.16-18.

Nguyên nhân chính:
- API `/api/ai-ops/learning/summary` gọi Supabase count bằng `fetch` trực tiếp nhưng không có timeout.
- Khi Supabase REST chậm/treo, trang Multi AI chờ mãi, không hiện lỗi rõ.
- Frontend còn tự tải cả dữ liệu tab ẩn như Learning/Reports khi mở trang Multi AI, làm tăng rủi ro treo.

Đã sửa:
- Thêm timeout cho toàn bộ Supabase count trong `getSupabaseLearningCounts()`.
- Chạy các count song song, lỗi count nào fallback 0 count đó.
- AI Center chỉ tải Settings + Summary khi vào màn Multi AI.
- Không tự tải Learning/Reports khi tab đang ẩn.
- Thêm watchdog UI: nếu quá 10 giây vẫn "Đang tải" thì hiện cảnh báo thay vì im lặng.
