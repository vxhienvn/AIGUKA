# PATCH NOTES V6.1 - Dashboard Function Fix

## Đã sửa

1. **Dashboard - nút Ẩn/Hiện bảng Hiệu quả quảng cáo**
   - Sửa cơ chế toggle không phụ thuộc select cũ.
   - Dùng nút `Ẩn bảng QC / Hiện bảng QC` rõ ràng hơn.
   - Ghi nhớ trạng thái bằng `localStorage`.

2. **Dashboard - xuất file Excel**
   - Thay chức năng xuất text bằng nút `Xuất Excel`.
   - Xuất bảng Hiệu quả quảng cáo ra file `.xls` có thể mở bằng Excel.

3. **AI & Bot - nút bật/tắt bot**
   - Đổi từ hai nút `Bật trả lời / Tắt trả lời` sang công tắc gạt ON/OFF.
   - Đồng bộ trạng thái với `/api/debug/health` và `/api/bot-reply-switch`.

4. **Server Control**
   - Giữ giao diện server control dạng UI trong `/admin-v5`.
   - Bổ sung link nhanh `Server Control UI` để tránh phải đọc JSON thô.
   - Vẫn giữ link JSON cho debug kỹ thuật khi cần.

5. **Liên kết admin-v5**
   - Bổ sung thẻ/nút dẫn đến:
     `https://manychat-openai-6oiq.onrender.com/admin-v5`

6. **Mapping**
   - Bỏ nút `Tắt bot ngay` khỏi trang mapping để tránh thao tác nhầm.
   - Trang mapping chỉ còn nhiệm vụ cấu hình/lưu mapping.

## Không thay đổi

- Không thay đổi logic lấy dữ liệu Pancake.
- Không thay đổi logic AI trả lời khách.
- Không thay đổi cấu trúc Supabase.
