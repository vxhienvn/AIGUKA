# PATCH NOTES V6.0.16 - Restore ad-mapping.html as Sale Schedule

## Fixed
- Restored `public/ad-mapping.html` as the Sale Schedule / Bot Working Mode page as requested.
- Moved the new Ad ID → Product / Slide mapping UI to `public/slide-mapping.html`.
- Added `/slide-mapping-admin` route.
- Updated Dashboard and Production Admin links to open the new slide mapping page.
- Kept `/sale-center-admin` and `public/sale-center.html` as compatibility routes/pages.

## Rule
- `ad-mapping.html` belongs to Sale working schedule / bot mode.
- Slide recognition / Ad ID mapping must live in a separate admin page.
