# PATCH NOTES V6.1 - Dashboard UI Sidebar

## Mục tiêu
Thiết kế lại trang Dashboard theo hướng gọn, chuyên nghiệp, giảm nút chồng chéo và đưa các module như Lead Check, Mapping, Hội thoại, Báo cáo vào menu điều hướng rõ ràng.

## Đã cập nhật
- Thêm sidebar trái theo nhóm chức năng: Tổng quan, Quản lý lead, AI & Bot, Hệ thống.
- Bỏ cụm nút rời Hôm nay/Hôm qua/7 ngày/30 ngày/Khách nóng/Bản text trên header.
- Gom điều khiển thành toolbar: Thời gian, Bộ lọc, Tài khoản QC, Sản phẩm, Ngày cụ thể, Thống kê theo.
- ID quảng cáo và ID tài khoản chỉ hiển thị nhỏ, màu xám dưới tên chính.
- Bảng quảng cáo mặc định chỉ hiện cột quan trọng: Quảng cáo, Tài khoản QC, Trạng thái, Chi tiêu, Hội thoại, Có SĐT/ZL, Khách nóng, Cost/Hội thoại, Cost/SĐT.
- Các thông tin phụ như Chưa SĐT/ZL, Zalo, Đã gọi, Nhân viên, Tags, Sản phẩm, CPC, CPM, CTR được đưa vào dòng chi tiết, bấm vào từng quảng cáo để mở.
- Thêm thẻ truy cập nhanh: Lead Check, Mapping, Hội thoại, Báo cáo, Debug, Server.
- Giữ nguyên logic dữ liệu, route, API và các chức năng cũ.

## File thay đổi chính
- src/app.js
