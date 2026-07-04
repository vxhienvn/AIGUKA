# PATCH NOTES V6.0.23

## Sale Center Route Restore

- Restored `public/sale-center.html` so `/admin/sale-center.html` works through the existing `/admin` static route.
- Added quick redirect routes:
  - `/sale-center-admin`
  - `/admin-sale-center`
- Kept V6.0.22 bot reply switch persistence fixes.
- Did not replace or remove `ad-mapping.html`; slide mapping remains separate.

## Verification

- `node --check src/app.js` passed.
