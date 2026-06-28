# AIGUKA 4.0.5 - Hard Product Lock + Wrong Product Recovery

## Source base
Built from user-uploaded running source: `AIGUKA-4.0.4-Carousel-Admin-Image-Fix (1)(1).zip`.

## Fixes included

### 1. Messenger carousel `sku` API error
- Removed unsupported `sku` / product metadata keys from Messenger `generic` template elements.
- SKU/product code is now embedded in `title` and `subtitle` only.
- Added `sanitizeMessengerElements()` before every Graph API template send.

### 2. Hard Product Lock / Wrong Product Recovery
- Added detection for customer complaints such as “đang hỏi quạt mà”, “gửi sai rồi”, “không phải cái này”.
- Bot now apologizes, locks the corrected product group, and asks for SĐT/Zalo to avoid further confusion.

### 3. Instant Sample Slide
- If customer asks for sample/photo/more models/catalogue, bot sends product-scoped slide immediately.
- This bypasses the normal admin-wait rule for the slide only.
- If admin is active, bot sends slide once and returns control to admin.
- If admin is not active, durable pending reply still schedules follow-up care.

### 4. Duplicate instant sample guard
- If the same customer turn has already received an instant sample slide, delayed workflow will not resend the same slide; it sends a light follow-up asking for SĐT/Zalo instead.

### 5. Admin / echo logging improvements
- `echo_unknown` is now logged to Supabase for audit/replay when echo cannot be confidently classified.
- `startHumanTakeover()` also logs admin takeover into Supabase.

### 6. Version endpoints
- `/healthz` and `/reply-engine-health` now report 4.0.5.

## Notes
- This build preserves 4.0.4 features and only patches currently observed production issues.
- Still requires live testing with real Messenger/Pancake flows.
