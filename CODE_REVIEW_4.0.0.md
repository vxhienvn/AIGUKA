# CODE REVIEW AIGUKA 4.0.0

## Đã chỉnh
- File chính: `src/app.js`
- Thêm `customerReplyTimers` để chờ 10 phút/5 phút và reset khi khách nhắn tiếp.
- Thêm Workflow Engine V4.0: `registerAndScheduleAiguka4CustomerMessage()` và `processAiguka4Workflow()`.
- Chặn luồng cũ bằng cách chuyển toàn bộ customer message vào Workflow Engine mới trước khi các nhánh 3.x chạy.
- Admin echo takeover mặc định bật, có thể tắt bằng `AIGUKA_ENABLE_HUMAN_TAKEOVER_ECHO=0`.
- Thêm `AD_PRODUCT_MAP` để map quảng cáo sang nhóm sản phẩm.
- Thêm Welcome Product Showcase: carousel mở đầu luôn là slide, có hotline trong subtitle.
- Sửa luồng xem thêm ảnh: không trùng, lần xin thêm thứ 3 chuyển sang SĐT/Zalo.

## Cần test sau deploy
1. Trong giờ làm việc: khách nhắn `xin giá` từ QC quạt => bot chờ 10 phút, gửi slide quạt rồi báo khoảng giá.
2. Ngoài giờ: khách nhắn => bot chờ 5 phút.
3. Khách gửi SĐT trong giờ => bot im lặng.
4. Khách gửi SĐT ngoài giờ => bot gửi đúng 1 tin xác nhận.
5. Khách nhắn `báo giá rồi gửi số` => bot báo khoảng giá an toàn, không lặp câu cũ.
6. Khách nhắn `xem thêm` nhiều lần => slide mới không trùng, lần thứ 3 xin SĐT/Zalo.
