# AIGUKA 4.3.0 schema compat stable + explicit product priority hotfix

Bản này giữ các sửa lỗi của 4.3.0 và bổ sung hotfix chọn đúng slide theo tin khách:

- Khách hỏi rõ sản phẩm trong tin nhắn sẽ được ưu tiên cao hơn ad mapping/quảng cáo tổng hợp.
- Case đã sửa: khách vào QC showroom tổng hợp nhưng nhắn “tư vấn bộ sen cây” => khóa nhóm `faucet/sen vòi`, không gửi slide tủ gương.
- Bổ sung keyword/alias: `sen cây`, `bộ sen cây`, `cây sen`, `sen vòi`, `sen tắm`.
- Khi nhận diện được product item rõ ràng, bot lưu `productItemKey` và dùng đúng folder/nhóm sản phẩm.
- Vẫn giữ compatibility mode cho Supabase schema cũ.

Deploy như bản 4.3.0 trước đó.
