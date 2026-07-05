# AIGUKA V7.2.6 – Brain Summary + Price Policy + OCR Guard + Conversation Evaluate Fix

## Mục tiêu
Gộp các lỗi đang phát hiện trong V7.2.x vào một bản sửa lõi, chưa làm UI mới.

## Đã sửa

### 1. Brain Summary / Dynamic Product Groups
- Product Brain đọc `brain_summary` từ Supabase (`ai_learning_settings.setting_key = brain_summary`).
- Product Group Resolver nhận diện nhóm theo alias động: quạt, quạt vàng, 10 cánh, Fudeer, hút mùi, sen, bồn tắm, tủ chậu, đèn...
- Có fallback category tree nếu Supabase chưa có `brain_summary`.

### 2. Manual Product Objects
- Hỗ trợ `learning_segments.attributes.products[]` để các thông tin nhập tay như quạt mạ vàng 5/6/8/10 cánh trở thành Product Object thật.
- Không bắt buộc phải có catalog mới học được sản phẩm.

### 3. Price Policy toàn hệ thống
- Giá trong Product Brain được coi là `reference`, không phải giá chốt.
- Product Brain và bot chỉ báo khoảng giá, không báo giá cụ thể cứng.
- Response Validator làm mềm các câu trả lời có giá cụ thể thành khoảng giá.

### 4. Build AI Brain không timeout
- `/learning/brain/build` mặc định chạy background job, trả JSON ngay.
- UI không còn chờ một request dài gây 502/timeout.
- Có trạng thái job trong `/learning/brain/status`.

### 5. PDF/image OCR Guard
- File PDF/image không có text layer được đánh dấu `Cần OCR/Parser`, không cho hiểu nhầm là đã học đủ.
- Tránh tình trạng catalog ảnh báo approved nhưng AI không đọc được nội dung.

### 6. Nút “3 AI đánh giá”
- Sửa nút đánh giá hội thoại gửi trực tiếp timeline đang chọn lên backend.
- Nếu backend không tìm được conversation theo ID, vẫn dùng payload timeline từ UI để đánh giá.
- Có loading/error rõ, không bấm im lặng nữa.

## Test sau deploy
1. AI Compare: `quạt vàng 10 cánh giá bao nhiêu`
2. AI Compare: `có quạt dưới 3 triệu không`
3. AI Compare: `Fudeer T8 giá khoảng bao nhiêu`
4. Upload catalog PDF ảnh: phải hiện `Cần OCR/Parser`, không được báo đã học đủ nếu chưa OCR.
5. Hội thoại học tập: chọn hội thoại → bấm `3 AI đánh giá`.
