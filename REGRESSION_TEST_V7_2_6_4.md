# Regression Test v7.2.6.4

## Case bắt buộc

- QC tổng hợp + "cho xin địa chỉ" -> chỉ trả địa chỉ, không gán sản phẩm.
- QC tổng hợp + "xin mẫu lavabo" -> gửi đúng mẫu lavabo + xin SĐT/Zalo.
- QC sen tắm + "giá bao nhiêu vậy cháu" -> gửi/giới thiệu đúng scope sen tắm, giữ xưng hô chú/cô - cháu.
- QC mới chưa map + khách hỏi giá -> không lấy product cũ để gửi sai slide.
- Media gửi thành công -> dedup hoạt động 10 phút.
- Media gửi thất bại -> không mark dedup, lần sau được thử gửi lại.
- Admin hold -> bot không chen ngang.
- Bot OFF + khách xin mẫu -> vẫn chạy auto slide nếu không admin hold.
