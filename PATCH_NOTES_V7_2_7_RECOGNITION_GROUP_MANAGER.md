# PATCH NOTES V7.2.7 - Recognition Group Manager + Persistent Supabase Config

## Mục tiêu
Hoàn thiện phần còn thiếu của V7.2: Nhóm sản phẩm nhận dạng phải là cấu hình nghiệp vụ lưu trong Supabase, không lưu trong RAM/code. Deploy hoặc restart Render không làm mất cấu hình.

## Database đã thêm
Migration Supabase:

- `recognition_groups`
- `recognition_group_aliases`
- `recognition_group_products`

Seed mặc định:

- Tổng hợp — GENERAL
- Bathroom / Thiết bị vệ sinh — GENERAL
- Quạt — PRODUCT
- Bồn tắm — PRODUCT
- Bếp / Hút mùi / Chậu vòi bếp — CATEGORY
- Đèn trang trí — CATEGORY

## API mới

- `GET /api/recognition-groups`
- `POST /api/recognition-groups`
- `PATCH /api/recognition-groups/:id`
- `DELETE /api/recognition-groups/:id`
- `POST /api/recognition-groups/seed-general`

## UI mới
Trong trang Ad Mapping thêm khu vực **Nhóm sản phẩm nhận dạng**:

- Thêm nhóm
- Sửa nhóm
- Xóa nhóm
- Sửa alias
- Chọn nhiều nhóm sản phẩm con
- Tạo/cập nhật nhóm Tổng hợp

## Rule Engine / Context Builder
Thêm Recognition Group Resolver vào Context Builder và Product Object Resolver.

Quy tắc quan trọng:

- Nếu Recognition Group mode = `GENERAL` thì bot không được tự chọn một sản phẩm cụ thể.
- Bathroom/Tổng hợp chỉ xác định phạm vi, không tự suy luận thành bồn cầu thông minh.
- Chỉ truy vấn Product Brain khi khách đã có Product Intent rõ hoặc Exact Product.

## Kết quả mong đợi
Case khách từ quảng cáo showroom/tổng hợp nói “trang bị nhà mới”:

- Không được gán bừa thành bồn cầu thông minh.
- Không tư vấn sâu một sản phẩm cụ thể.
- Bot hỏi nhu cầu theo nhóm hoặc xin SĐT/Zalo để sale tư vấn tổng thể.

## Lưu ý deploy
Migration đã được apply vào Supabase production project. Sau deploy:

1. Ctrl + F5 trang Admin.
2. Vào Ad Mapping.
3. Kiểm tra khu vực Nhóm sản phẩm nhận dạng.
4. Bấm Tải lại nhóm nhận dạng.
5. Mapping các quảng cáo tổng hợp nên chọn nhóm `Tổng hợp` hoặc `Bathroom / Thiết bị vệ sinh` mode GENERAL.
