# Governor-facing frontend follow-up — 7 October 2026

Browser access was restored. This pass checks the actual local operation room against deployed public data, rather than relying only on component tests. The landing page remains the map.

## Corrections from the visual walk

- The local Cloudflare storage emulator produced fatal SQLite lock errors and empty desks. An opt-in `CNX_PREVIEW_USE_LIVE_API=1` mode now proxies 29 exact public feed paths to the deployed API. It is disabled in production and does not proxy ingest, chat or build identity. The header explicitly says PREVIEW. This repairs presentation previews; it does not repair the underlying emulator lock issue.
- Bus, CMU shuttle and airport-bus overlays start off, leaving measured hazard evidence easier to read. Their controls remain available.
- The ticker and satellite desk now distinguish detections inside Chiang Mai from nearby detections outside the province. The satellite desk opens FIRMS first, rather than leading with an unavailable RFD feed. Its selectors expose selected state and have 44px targets.
- The executive summary and governor brief no longer attach an outside-province detection timestamp to a provincial zero. They do not invent a timestamp for an empty provincial detection set.
- Shorter phone labels keep the theme control in the same row, recovering roughly 50px for the map. The Android/iPhone web-app link remains visible.
- Non-English news items keep their actual language badges. English/Thai filter counts now count the items each filter actually displays.
- Historical aviation carries a historical-data label instead of a normal-condition label. The district table uses Thai column labels and avoids a hardcoded burn-season year.

## Verified in the browser

- Desktop 1280×720 and phone 390×844 render; neither checked landing view has horizontal page overflow.
- The overview's fire-evidence button selects the fire desk. The phone's water measurement selects the water panel and moves focus to `hazard-panels`.
- The governor brief opens and closes. LINE copy reports success; its visible text includes the public CNX URL, observation reference times and explicit estimates. The browser clipboard-inspection tool returned no matching text, so the copied contents were independently checked through the visible text fallback and component regression, not claimed as an OS clipboard inspection.
- Terrain, Satellite and Street render. Satellite with 3D enabled switches back to Street with buildings still visible. Defaults were restored to Street/2D.
- Light and dark shells render; no console errors were recorded in the final checked tab. This is a session check, not proof that all upstream feeds are available.
- Google News is available but GDELT remains partial/unavailable. CCTV shows 1/9 reachable in the observed sample; that is not city-wide camera coverage.

## Gates and remaining scope

The full regression suite passed 634 tests in 68 files. The subsequent language regression also passed, bringing the suite to 635 tests; the resulting governor-readiness suite has six passing tests. TypeScript, targeted lint and diff checks passed. An isolated Next.js production build passed, including compilation, lint, type validation and page generation. Build snapshot: `/Volumes/Data/Codex-build-archives/cnx-governor-audit-xgol9eit`; log: `/tmp/cnx-governor-production-build.log`. A Cloudflare release package and deployment were not performed.

The preview proxy follows Next.js [beforeFiles rewrite behavior](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites). Direct configuration checks confirm 29 exact preview routes and zero rewrites with production mode, even when the preview flag is set.

Print preview has not been visually checked. A local preview using deployed data does not validate the changed backend after deployment. Production remains on `0a2ed91`; these frontend changes belong to `codex/governor-frontend-audit` until a release is built and deployed through the normal gates.

Screenshots: [desktop](screenshots/desktop.jpg), [phone](screenshots/phone.jpg), [governor brief](screenshots/brief.jpg), [dark theme](screenshots/dark.jpg), [Street with 3D](screenshots/street-3d.jpg).
