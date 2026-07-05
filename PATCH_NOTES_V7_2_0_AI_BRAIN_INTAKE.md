# AIGUKA V7.2.0 - AI Brain Intake Foundation

Mục tiêu: bắt đầu triển khai kiến trúc AI Brain đã chốt, nhưng theo hướng an toàn: thêm tầng nhập tri thức trực tiếp và cho bot đọc AI Brain trước khi trả lời, không phá luồng Meta/Pancake hiện có.

## Đã làm

- Thêm khu **Thêm tri thức trực tiếp vào AI Brain** trong tab Knowledge.
- Hỗ trợ lưu các loại Knowledge Object:
  - Quy tắc kinh doanh
  - Kinh nghiệm sales
  - Kiến thức sản phẩm
  - FAQ
  - Hiến pháp AI
  - Mẫu xử lý hội thoại
  - Kiến thức quảng cáo
- Lưu bền vào Supabase qua `ai_learning_documents` và `learning_segments`.
- Mỗi object được đánh dấu `approved=true`, `absorption_status=absorbed`, `ai_brain_version=7.2.0`.
- Bot Messenger/OpenAI giờ tự truy xuất AI Brain Context từ Supabase trước khi tạo câu trả lời.
- AI Compare vẫn đọc Knowledge đã duyệt như trước.
- Bỏ nút **Tách PDF lớn** khỏi UI upload để tránh nhầm với chunked upload.

## Ý nghĩa

Knowledge không chỉ là file/document. Bạn có thể nhập trực tiếp các nguyên tắc bán hàng, hiến pháp AI, kinh nghiệm thực tế, quy trình chăm khách và kiến thức sản phẩm để bot đọc như long-term memory.

## Ghi chú deploy

- Không cần chạy migration mới.
- Cần Supabase env như cũ: `SUPABASE_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Deploy xong Ctrl+F5 trang AI Center.
