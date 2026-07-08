# AIGUKA V7.2.6.8 Hotfix - Global Slide Scope Guard

## Mục tiêu
Chặn lỗi gửi slide/ảnh sai nhóm sản phẩm không chỉ riêng sen vòi mà toàn bộ nhóm chính.

## Thay đổi chính
- Bổ sung `normalizeScopeProduct()` để chuẩn hóa productType trước khi lọc ảnh.
- Mở rộng `productScopeTerms()` và `productNegativeScopeTerms()` cho: quạt, bồn cầu, tủ chậu/gương, sen vòi, lavabo, bồn tắm, bếp, gạch, đèn.
- `filterProductItemsByScope()` không còn trả nguyên list khi không match scope. Nếu ảnh/folder không chứng minh đúng nhóm sản phẩm thì không gửi slide.
- `collectImagesFromDriveFolder()` gắn `source_folder/drive_folder` vào từng ảnh để engine có thể kiểm tra folder nguồn.
- Áp dụng scope guard cho:
  - Product item folder.
  - Group welcome slide.
  - Mixed folder slide.
  - Ad Mapping drive_folder/drive_folders.
  - Ad Mapping image_urls fallback.
  - Static fallback.

## Kỳ vọng
Nếu khách hỏi sen vòi mà folder/ad mapping trả ảnh tủ chậu/gương/lavabo sai scope, bot sẽ không gửi slide sai nữa và log cảnh báo `[SLIDE_SCOPE_GUARD]`.
