# AIGUKA 6.0.1 - Conversation Intelligence Hotfix

## P0 fixes

1. **Safe Send hard lock**
   - `OFF` trong Sale Center/Admin Schedule giờ chặn ở tầng gửi cuối (`sendMessage`, `sendTemplate`).
   - Dù workflow, GPT, pending hay timer gọi nhầm thì vẫn không gửi ra Facebook khi mode là `off`.

2. **Pending loop / gửi lặp mỗi 10 phút**
   - Pending chỉ chạy khi tin cuối cùng là của khách.
   - Nếu đã có bot trả lời sau tin khách cuối, pending bị hủy.
   - Mỗi tin khách có khóa trả lời riêng (`lastRepliedCustomerMessageKey`).
   - Sau khi gửi thành công, pending cùng khách được đánh dấu đã xử lý.

3. **Semantic duplicate lock**
   - Chặn tin giống hệt và tin giống ý trong 30 phút.
   - Giảm lỗi bot gửi cùng một câu chỉ đổi đại từ/câu chữ.

4. **Call request / handover**
   - Khách nói “gọi cho mình”, “alo”, “liên hệ”… bot không hỏi nhu cầu nữa.
   - Nếu đã có số trong lịch sử: hỏi xác nhận còn dùng số đã che bớt.
   - Nếu chưa có số: xin SĐT/Zalo ngắn gọn rồi dừng.

5. **Contact recovery**
   - Bot đọc lại số điện thoại trong state và lịch sử hội thoại.
   - Không hỏi lại số từ đầu khi đã có số.

6. **Human style cleanup**
   - Giảm các mở đầu máy móc: “Dạ em hiểu rồi…”, “Dạ em nhận được rồi…”.
   - Chặn cụm “tư vấn trên Messenger / hỗ trợ trên Messenger / trao đổi trên Messenger”.

7. **Product family recognition**
   - Tăng nhận diện: combo vệ sinh, combo nhà vệ sinh, combo nhà tắm, combo phòng tắm, bộ vệ sinh → `combo`.
   - Hỗ trợ tin nhắn có dấu chấm/ký tự lạ như `combo.ve.sinh.bao.nhieu.tien`.

8. **Product/media request behavior**
   - Khi khách xin mẫu/ảnh/catalog/video, phản hồi được kéo về hành động gửi đúng mẫu + xin SĐT/Zalo để gửi báo giá/video/chính sách.

9. **Feature/direct answer intent**
   - Bổ sung nhận diện các câu hỏi công năng/thông số như áp lực, hoạt động, chất liệu, kích thước.

## Deploy note

- Deploy bản này thay thế 6.0.0 foundation.
- Sau deploy vào `/api/version` kiểm tra version phải là `6.0.1-conversation-intelligence-hotfix`.
- Vào `/api/sale-center/status` kiểm tra mode thực tế.
