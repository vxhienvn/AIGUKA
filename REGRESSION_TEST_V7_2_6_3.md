# Regression Test Report v7.2.6.3

## Static checks

- `node --check src/app.js`: PASS

## Code paths reviewed

- `getAdScopeFromEventAndState()`
- `decideBotActionV726()`
- `executeBotActionV726()`
- `sendProductMediaByRule()`
- `sendWelcomeProductShowcase()`
- `applyHumanAddressPolicy()` integration

## Simulated conflict assumptions

### Case 1: New ad scope overrides old conversation

Input:
- Old state: `currentTopic = kitchen`, `productItemKey = range_hood`
- Current event: ad scope = faucet/sen tắm
- Customer: “Giá bao nhiêu vậy cháu”

Expected:
- Decision product = faucet/current ad scope
- Old `range_hood` is ignored because product item group does not match faucet/bathroom scope.
- Reply goes through address policy: `cháu - chú`.

### Case 2: Current ad has ad signal but no mapping

Input:
- Old state: kitchen
- Current event has new ad_id but mapping product is empty
- Customer asks price

Expected:
- Decision Engine does not fallback to old kitchen.
- It should not send wrong slide.

### Case 3: Duplicate showcase

Input:
- Same customer, same ad/product/item asks price again within 10 minutes.

Expected:
- No new carousel.
- A short already-sent message + phone/Zalo ask.

### Case 4: Explicit customer product wins

Input:
- Current ad scope = sen tắm
- Customer says: “Máy hút mùi bao nhiêu?”

Expected:
- Explicit product wins over ad scope.
- Product item must match kitchen/range hood before reuse.

## Notes

This report is static/simulated. Production behavior still depends on live Meta/Pancake payloads, Supabase ad mapping rows, and public image URLs.
