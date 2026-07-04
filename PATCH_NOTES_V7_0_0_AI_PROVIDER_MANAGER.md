# AIGUKA V7.0.0 - AI Provider Manager / Operations Center

## Mục tiêu
- Thêm DeepSeek/Gemini/OpenAI theo kiến trúc provider-agnostic.
- Thêm AI Operations Center để chọn ACTIVE / MONITOR / OFF.
- Các model MONITOR không trả lời khách, chỉ đánh giá và tạo báo cáo.
- Giữ nguyên webhook, dashboard, sale center, lead check, slide engine và các luồng ổn định.

## File mới
- `src/ai/providerManager.js`
- `src/routes/aiOperationsRoutes.js`
- `public/ai-operations.html`

## URL mới
- `/ai-operations`
- `/api/ai-ops/settings`
- `/api/ai-ops/compare`
- `/api/ai-ops/reports`

## ENV mới
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL` mặc định `deepseek-chat`
- `DEEPSEEK_BASE_URL` mặc định `https://api.deepseek.com`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` mặc định `gemini-1.5-flash`
- `OPENAI_MODEL` mặc định `gpt-4.1-mini`

## Cách dùng
1. Deploy bản này.
2. Thêm `DEEPSEEK_API_KEY` vào Render.
3. Mở `/ai-operations`.
4. Chọn model ACTIVE trả lời khách, model MONITOR giám sát.

## Lưu ý an toàn
- Bản đầu không để monitor tự chặn live reply, chỉ log cảnh báo để tránh làm hỏng luồng đang ổn định.
- Muốn nâng lên AI Fusion/chặn lỗi trực tiếp sẽ bật dần sau khi kiểm tra báo cáo.
