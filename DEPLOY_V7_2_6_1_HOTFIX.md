# AIGUKA v7.2.6.1 Decision Engine Hotfix - Hướng dẫn deploy

## Nội dung bản sửa

Bản này sửa thêm lỗi có thể phát sinh sau NOTE 02:

- Khi khách xin mẫu / xem mẫu / catalogue / hỏi giá / hỏi thông tin, Decision Engine gửi slide + xin SĐT/Zalo bằng rule cứng.
- Sau khi rule đã gửi slide + xin SĐT, hệ thống đặt `suppressAiUntil` trong 90 giây.
- Trong 90 giây này, V5/AI không được gửi thêm tin tư vấn hoặc xin số lần 2.
- Mục tiêu: một tin khách chỉ sinh một cụm phản hồi nghiệp vụ, tránh lặp nội dung.

File chính đã sửa:

```txt
src/app.js
```

## Cách deploy qua GitHub + Render

### 1. Giải nén file ZIP

Giải nén bản này vào thư mục project local của anh.

### 2. Mở terminal tại thư mục project

Ví dụ:

```bash
cd AIGUKA-main
```

### 3. Kiểm tra cú pháp trước khi push

```bash
node --check src/app.js
```

Nếu không hiện lỗi gì là qua bước cú pháp.

### 4. Commit lên GitHub

```bash
git add .
git commit -m "AIGUKA v7.2.6.1 suppress AI after rule action"
git push origin main
```

Nếu project của anh dùng nhánh khác, thay `main` bằng tên nhánh đang deploy.

### 5. Chờ Render auto deploy

Vào Render dashboard, mở service AIGUKA và xem log build/runtime.

Log cần thấy sau khi khách trigger slide:

```txt
[V726] V5/AI suppressed after rule action
```

hoặc:

```txt
[V726] Pipeline stopped by suppressAiUntil after rule action
```

## Test nhanh sau deploy

### Case 1 - QC tổng hợp, khách hỏi địa chỉ

Khách:

```txt
cho xin địa chỉ
```

Kỳ vọng:

- Bot chỉ trả địa chỉ.
- Không tự nhảy sang bồn cầu/lavabo/quạt.
- Không gửi slide.

### Case 2 - QC tổng hợp, khách xin mẫu lavabo

Khách:

```txt
xin mẫu lavabo
```

Kỳ vọng:

- Bot gửi intro mẫu lavabo.
- Bot gửi slide/carousel lavabo nếu có dữ liệu.
- Bot xin SĐT/Zalo.
- Bot không gửi thêm tin tư vấn hoặc xin số lần 2 ngay sau đó.

### Case 3 - QC bồn cầu, khách hỏi mẫu nhưng chưa nói rõ sản phẩm

Khách:

```txt
có mẫu không
```

Kỳ vọng:

- Bot dùng Ads Mapping làm scope nhóm bồn cầu.
- Gửi slide nhóm bồn cầu.
- Xin SĐT/Zalo.
- Không gọi AI tư vấn thêm ngay sau đó.

### Case 4 - Bot OFF

Khách:

```txt
xin catalogue lavabo
```

Kỳ vọng:

- Nếu không có admin hold, rule auto slide vẫn chạy.
- Không gọi AI/V5 sau khi rule đã xử lý.

### Case 5 - Admin đang trả lời

Nếu admin vừa trả lời thủ công, khách nhắn tiếp:

```txt
xin mẫu lavabo
```

Kỳ vọng:

- Bot không chen ngang nếu còn trong thời gian admin hold.

## Rollback

Nếu có lỗi runtime sau deploy, rollback về commit trước:

```bash
git log --oneline
```

Copy mã commit trước bản này rồi chạy:

```bash
git reset --hard <commit_id_truoc_do>
git push origin main --force
```

Hoặc rollback trực tiếp bằng Render nếu service có lưu deploy history.
