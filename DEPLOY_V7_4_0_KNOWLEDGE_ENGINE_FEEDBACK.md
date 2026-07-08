# AIGUKA V7.4.0 - Knowledge Engine + Feedback Memory

## Mục tiêu
Biến AI Learning/AI Comparison từ tầng UI/kho lưu thành nguồn dữ liệu thật được bot truy xuất trước khi trả lời.

## Đã cập nhật

### 1. Knowledge Engine
File mới:

```txt
src/ai/knowledgeEngine.js
```

Chức năng:
- Nhận diện `Product ID` từ Product Center.
- Nhận diện loại kiến thức: `price`, `warranty`, `installation`, `catalog`, `spec`, `policy`, `business_rule`, `sales_experience`.
- Tìm knowledge trong `learning_segments` theo hybrid keyword + metadata scoring.
- Lọc theo product/intention trước khi đưa vào prompt.
- Ghi trace `[KNOWLEDGE_ENGINE_LOOKUP]` để biết bot đã dùng tài liệu nào.

### 2. Nối Knowledge Engine vào bot reply pipeline
File cập nhật:

```txt
src/ai/brainContextService.js
```

Bot giờ sẽ lấy thêm `KNOWLEDGE ENGINE CONTEXT V7.4` trước khi gọi OpenAI.

### 3. Tắt mặc định Product Brain Direct Reply
File cập nhật:

```txt
src/app.js
src/services/openaiService.js
```

Mặc định:

```env
PRODUCT_BRAIN_DIRECT_REPLY=false
```

Lý do: tránh Product Brain trả lời trực tiếp quá sớm và bỏ qua prompt bán hàng/context/knowledge.

Nếu cần bật lại:

```env
PRODUCT_BRAIN_DIRECT_REPLY=true
```

### 4. API kiểm tra Knowledge Engine
File cập nhật:

```txt
src/routes/aiOperationsRoutes.js
```

Endpoint mới:

```http
GET /api/ai-ops/learning/knowledge/search?q=sen%20cây&limit=10
```

Có thể truyền thêm:

```http
productId=SEN_CAY
knowledgeType=price
```

### 5. Feedback Memory cho AI Comparison
Endpoint mới:

```http
POST /api/ai-ops/learning/feedback
POST /api/ai-ops/learning/feedback/:id/approve
```

Cơ chế:
- Feedback mặc định lưu `pending`, chưa áp dụng ngay.
- Khi approve mới đẩy vào Supabase/Knowledge Engine.
- Tránh bot tự học sai nếu sale nhập nhầm.

## Kiểm tra sau deploy

```bash
node --check server.js
node --check src/app.js
node --check src/ai/knowledgeEngine.js
node --check src/ai/brainContextService.js
node --check src/routes/aiOperationsRoutes.js
```

Test API:

```bash
curl "https://<render-url>/api/ai-ops/learning/knowledge/search?q=sen%20cay&limit=5"
curl "https://<render-url>/api/ai-ops/learning/knowledge/search?q=bon%20tam%20bao%20hanh&limit=5"
curl "https://<render-url>/api/ai-ops/learning/knowledge/search?q=quat%2010%20canh%20gia&limit=5"
```

## Ghi chú
Bản này chưa thêm pgvector/embedding để tránh phá production. Đây là bản nối Knowledge vào luồng trả lời thật trước. Bản sau có thể nâng `knowledgeEngine.js` lên semantic/vector search mà không đổi luồng bot.
