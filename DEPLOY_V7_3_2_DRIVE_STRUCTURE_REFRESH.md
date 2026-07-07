# AIGUKA V7.3.2 — Drive Structure Refresh

Updated Product Center mapping to the manually restructured Google Drive verified on 2026-07-07.

## Changes
- New roots: PHÒNG TẮM, PHÒNG BẾP, QUẠT TRẦN- ĐÈN TRÙM, GẠCH NGÓI.
- Split `LAVABO`, `GƯƠNG`, and `GƯƠNG TỦ` into distinct Product IDs for slide safety.
- Added BỒN TẮM to Product Center.
- Refreshed source folder IDs and live folder names.
- Updated sen-vòi and bệt folder labels used by static mixed-folder slide routing.

## Run after deploy
```bash
npm run drive:index
npm run drive:validate
```

This release does not mutate Google Drive.
