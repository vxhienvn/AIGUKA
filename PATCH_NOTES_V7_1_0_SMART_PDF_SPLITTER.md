# AIGUKA V7.1.0 - Smart PDF Splitter

## Mục tiêu
Sửa triệt để lỗi tách PDF lớn bị lệch dung lượng: nhiều part chỉ 1-3MB nhưng vẫn còn 2 part hơn 30MB.

## Thay đổi chính
- Viết lại thuật toán tách PDF.
- Không chia cứng theo số trang nữa.
- Đo dung lượng từng trang bằng cách tạo thử PDF 1 trang.
- Gom các trang liên tiếp theo dung lượng mục tiêu khoảng 18MB/part.
- Giữ nguyên chất lượng PDF, không nén ảnh mặc định.
- Nếu một trang đơn lẻ đã quá 30MB thì tách riêng và báo rõ: trang này không thể nhỏ hơn nếu không nén/xử lý ảnh.
- Cập nhật trạng thái khi đang đo trang và đang tạo từng part để UI không im lặng.

## Ghi chú
V7.1.0 ưu tiên giữ chất lượng tài liệu để AI còn đọc được chữ nhỏ, mã sản phẩm, giá và thông số. Không tự giảm chất lượng ảnh.
