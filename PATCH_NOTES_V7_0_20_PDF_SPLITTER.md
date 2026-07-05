# PATCH V7.0.20 - PDF Splitter cho AI Learning

## Mục tiêu
Bổ sung công cụ tách PDF lớn ngay trên trang Upload tài liệu để tránh lỗi treo/520 khi upload file catalogue lớn.

## Thay đổi chính
- Thêm nút **Tách PDF lớn** trong AI Operations → Upload tài liệu.
- Khi file PDF > 30MB bị chặn, UI hiển thị nút **Tách PDF lớn ngay**.
- Tách PDF trực tiếp trên trình duyệt bằng pdf-lib, không gửi file 85MB lên server.
- Mỗi phần được tạo mục tiêu dưới ~25MB.
- Tên file part dạng `ten_file_part_01_of_04.pdf` để dễ nhận diện cùng một catalogue.
- Sau khi tách xong, danh sách file trong input được thay bằng các part nhỏ; người dùng bấm Upload để đưa từng part vào AI Learning.

## Lưu ý
- Cần internet để tải thư viện pdf-lib từ CDN.
- Với PDF scan quá nặng/mã hóa hoặc máy yếu RAM, tách trên trình duyệt có thể thất bại; khi đó nên tách/nén thủ công bên ngoài.
- Bản này chưa gộp metadata original_file trong DB; tên part giúp truy vết tạm thời.
