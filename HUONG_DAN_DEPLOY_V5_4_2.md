# Hướng dẫn deploy AIGUKA 5.4.2

```bash
npm install
node --check src/app.js
node --check src/prompts/salesPrompt.js
git add .
git commit -m "AIGUKA 5.4.2 debug stale skip reason"
git push origin main
```

Sau deploy, mở Render logs và tìm:

```text
[SUPABASE_STALE_UNANSWERED_SCAN]
[SUPABASE_STALE_UNANSWERED_SKIP_SAMPLES]
[STALE_UNANSWERED_SCAN]
```
