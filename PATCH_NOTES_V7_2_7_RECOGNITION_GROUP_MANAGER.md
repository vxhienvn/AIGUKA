# AIGUKA V7.2.7 - Recognition Group Manager

## Mục tiêu
Hoàn thiện tầng nhận diện sản phẩm trước Product Brain, tránh lỗi quảng cáo tổng hợp/Bathroom bị bot tự chọn nhầm một sản phẩm cụ thể như bồn cầu thông minh.

## Đã thêm
- Mục **Nhóm sản phẩm nhận dạng** ngay trong trang Ad Mapping.
- Cho phép **thêm / sửa / xóa** nhóm nhận dạng.
- Cho phép sửa alias/từ khóa nhận dạng theo từng nhóm.
- Cho phép chọn nhiều **danh mục cụ thể / production** thuộc một nhóm nhận dạng.
- Có nút **Tạo/chuẩn hóa nhóm Tổng hợp**.
- Nhóm **Tổng hợp** có thể chọn tất cả danh mục cụ thể.
- Nhóm Tổng hợp có `mode = GENERAL` để bot hiểu đây chỉ là phạm vi rộng, không được tự chọn 1 sản phẩm cụ thể.

## API mới
- `GET /api/recognition-groups`
- `POST /api/recognition-groups`

Dữ liệu lưu vào Supabase bảng `ai_learning_settings` với key:

```text
recognition_groups
```

Không cần migration bảng mới.

## Danh mục production mặc định
- Combo thiết bị vệ sinh
- Bệt vệ sinh
- Chậu / tủ chậu
- Sen cây / sen tắm
- Vòi lavabo
- Gương
- Phụ kiện nhà tắm
- Bồn tắm
- Chậu rửa bát
- Vòi rửa bát
- Quạt các loại
- Phụ kiện inox nhà bếp
- Bếp từ + hút mùi
- Bồn cầu thông minh
- Thiết bị vệ sinh
- Gạch
- Đèn trang trí

## Quy tắc hệ thống
Nếu mapping quảng cáo chọn nhóm nhận dạng **Tổng hợp**:

```text
mode = GENERAL
```

Bot phải hiểu:

```text
Không tự kết luận sản phẩm cụ thể.
Không tự chọn bồn cầu thông minh/lavabo/sen nếu khách chưa nói rõ.
Chỉ hỏi nhu cầu theo nhóm hoặc xin SĐT/Zalo để sale tư vấn tổng thể.
```

