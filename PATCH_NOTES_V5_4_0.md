# PATCH NOTES V5.4.0 - Brain OS Wholesale + Messenger Care

## Fix/Update chính
- Thêm Article 21 - Messenger Care Mode: mặc định chờ 45 phút, tương thích quy tắc 30-60 phút.
- Thêm Article 22 - Wholesale Inquiry Policy: nhận diện mua sỉ/mua buôn/mua số lượng/đại lý/công trình/dự án/chiết khấu.
- Khi gặp khách mua sỉ, bot xin SĐT/Zalo khéo để chuyên viên phụ trách sỉ trao đổi trực tiếp.
- Nếu khách không tiện cho số, bot không bỏ khách; hỏi số lượng dự kiến, khu vực và nhóm mẫu để hỗ trợ trước trên Messenger.
- Không báo giá sỉ cụ thể trên Messenger.

## Biến môi trường
- `MESSENGER_CARE_WAIT_MINUTES=45` mặc định. Không nên đặt dưới 30 phút.

## Kiểm tra cú pháp
```bash
node --check src/app.js
node --check src/prompts/salesPrompt.js
```
