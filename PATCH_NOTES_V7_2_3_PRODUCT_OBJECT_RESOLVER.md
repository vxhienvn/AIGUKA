# AIGUKA V7.2.3 - Product Object Resolver / Context Builder

## Mục tiêu
Hoàn thiện phần còn thiếu của V7.2: không chỉ build AI Brain theo `learning_segments`, mà phải biến dữ liệu sản phẩm trong Knowledge thành Product Object để AI Compare và Bot truy vấn được theo model, giá, kích thước, nhóm sản phẩm.

## Sửa chính

### 1. Thêm Product Object Resolver
File mới:

```text
src/ai/productObjectService.js
```

Resolver tự đọc `learning_segments` đã approved trong Supabase và trích xuất Product Object từ các dòng dạng bảng/Excel, ví dụ:

```text
[bsx-ngam] 17 | AR4162 | 1600*780*600 | 7575000
```

Thành object:

```json
{
  "type": "product",
  "category": "Bồn tắm",
  "brand": "ARES",
  "model": "AR4162",
  "size": "1600*780*600",
  "price": 7575000,
  "source_file": "...xlsx",
  "source_row": 17
}
```

### 2. AI Compare dùng Product Object Context
Khi hỏi:

```text
Có bồn tắm dưới 10 triệu không?
```

hệ thống không còn chỉ tìm text chứa “dưới 10 triệu”, mà sẽ parse điều kiện:

```text
category = Bồn tắm
price < 10000000
```

rồi đưa các Product Object phù hợp vào AI Compare.

### 3. Bot Messenger dùng Product Object Context
`buildBrainContextForMessage()` đã được nối thêm Product Object Context trước phần raw AI Brain Context.

Khi khách hỏi sản phẩm/model/giá/kích thước, Bot sẽ có context cụ thể trước khi gọi OpenAI/Gemini.

### 4. Log debug mới
Thêm log:

```text
[PRODUCT_OBJECT_RESOLVER]
[AI_EXPLAIN_PRODUCT_OBJECT_CONTEXT]
[AI_COMPARE_CONTEXT_BUILDER]
```

Dùng để kiểm tra:

- Query của khách được hiểu thế nào.
- Có bao nhiêu Product Object được tìm thấy.
- Context nào được đưa vào AI.

### 5. Endpoint kiểm tra nhanh
Thêm endpoint:

```text
POST /learning/product-objects/resolve
```

Body ví dụ:

```json
{
  "query": "có bồn tắm dưới 10 triệu không",
  "limit": 20
}
```

## Lưu ý
Bản này chưa đổi UI lớn. Mục tiêu là sửa lõi trước: Product Object → Context Builder → AI Compare/Bot.

Sau deploy, test ngay trong AI Compare:

```text
cho tôi vài mẫu bồn tắm 1,7m
có bồn tắm dưới 10 triệu không?
AR4162 giá bao nhiêu?
```
