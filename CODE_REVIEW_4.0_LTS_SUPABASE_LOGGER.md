# AIGUKA 4.0 LTS - Supabase Logger

Base source: user-uploaded `AIGUKA-main (1)(1).zip`.

## Added
- `SUPABASE_ENABLED`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` env support.
- Supabase REST logger using native `fetch` (no new npm dependency).
- `/healthz` endpoint for keep-alive monitors.
- `/supabase-health` endpoint to test Supabase connection.
- Customer message logging to `customers`, `conversations`, `messages`.
- Bot text/template logging after Facebook send succeeds.
- Admin echo logging when human takeover is detected.

## Preserved
- Existing JSON local history/state still works as fallback.
- Existing AIGUKA 4.0 workflow, admin timer, welcome carousel logic is not removed.
- Existing dashboard/Pancake/Meta/payment modules are not removed.

## Notes
- Supabase failure is logged but does not stop webhook handling.
- This version only adds durable conversation logging. It does not yet replace state JSON with Supabase.
