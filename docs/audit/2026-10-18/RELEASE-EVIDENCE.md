# Release evidence · 18 October 2026

Application release: `fd059c19a8f0bcaa3203f19abaf12e611f0dfc53`.

- `335d1e2`: coordinated safety, camera, traceability, credits and portable setup integration.
- `1a3eecb`: targeted dependency remediation.
- `1a2f4a7`: partial river-threshold coverage stays unknown without hiding genuine warnings.
- `fd059c1`: bounded tablet map/news row and content-width phone tabs.

## Checks executed

[Final fresh-clone CI run](https://github.com/Nonarkara/cnx/actions/runs/39142435539): all three jobs successful.

- Node 22.12.0: 113 test files, 1,117 tests passed.
- Node 20.19.0: 113 files, 1,116 passed, one expected runtime-dependent skip.
- Typecheck, ESLint, plain Node relay imports and Cloudflare Worker build passed.
- Local production build and Wrangler deployment dry run passed on Node 22.22.2.
- Production dependency audit: zero reported vulnerabilities. Full audit: five high affected development packages in one unpatched ESLint/braces advisory chain; zero critical. No compatible patched braces version was published. This does not prove absence of undisclosed vulnerabilities.
- Installed graph and lockfile: Sharp 0.35.5 throughout, PostCSS 8.5.30 throughout, Next 15.5.27, Wrangler retained at 4.147.0. `npm ls sharp postcss --all` exits 0.

Earlier local runs interrupted during source/dependency integration are not passing evidence. One collection encountered a transient empty package.json during an edit. The clean-clone final CI run supersedes those partial runs.

## Browser verification

Built application checked in Thai and English at 1440×900, 1024×768 and 390×844. Independent frontend reviewer approved the final tablet and phone fixes.

- Map remains the landing view; header is a single compact row. Secondary actions collapse into the menu.
- Tablet mobile-panel top moved from y=2,570 to y=599.8; news stays within the map row and scrolls internally. No page-wide horizontal overflow.
- Phone tabs fit their labels: measured widths 58–131 px, 44 px minimum height. Navigation scrolls within 390 px rather than bleeding labels.
- Open legend stays inside the phone map; measured bottom 550 px within map bottom 656 px. Wind arrows and rain marks are distinguishable.
- Desktop English and phone Thai brief → water evidence handoff closes the dialog and focuses the relevant evidence region.
- Thai and English credits are readable; 47 historical references, with adoption states and limits made explicit. No comparative-accuracy or AI-construction claim.
- Production light theme checked; no browser errors observed during the deployed map and camera-modal inspection. Existing public-origin browser zoom was preserved.

Local PNG evidence: `/Volumes/Data/CNX/audit-artifacts/2026-10-18/` (`desktop-{th,en}-1440.png`, `tablet-{th,en}-1024.png`, `phone-{th,en}-390.png`, `desktop-en-credits.png`, `live-th-desktop.png`, `live-camera-check.png`). The earlier phone legend/Thai credits captures predate only the final two CSS lines. Temporary preview server stopped after verification. Development React Refresh was blocked by the strict CSP; visual verification used the built Worker, without weakening CSP.

## Deployment and operational evidence

Wrangler deployed version `517a3c56-0eeb-43a0-b9b5-5da2fd1acddf` to the existing CNX custom domains. At deployment the working tree was clean; local main, origin/main and live build commit all matched `fd059c1`.

`node scripts/verify-deploy.mjs --expect rain --expect river-level`: PASS, 49 routes and release identity. Authenticated ingest routes rejected unauthenticated requests.

Only the existing CNX launchd relay was restarted after deployment, from PID 65973 to PID 62248. Other projects' managed services were preserved.

At 16:03:36 UTC:

- River: live, 45 gauges; relay collection 16:03:06 UTC. Raw push: 48 rows, catalogue 128.
- Rain: live, 350 current gauges; collection 16:03:06 UTC. Raw push: 351 rows; maximum 26.8 mm at Omkoi.
- Haze vision: live push 16:03:10 UTC, one monochrome camera, null score, zero qualified baseline samples, zero version-3 agreement pairs, eventStations=0. The new robust-range metric is present. This confirms the running process loaded the upgraded scorer. Legacy fingerprints remain available for deduplication; unqualified calibration does not survive the upgrade.
- Camera modal: dash, 0 assessable / 1 unassessable. No inferred clear scene and no claimed accuracy improvement.
- Manifest: relay online; 22/24 feeds within cadence. Remaining stale entries: JAXA AOT scene and dated open-data catalogue. Critical rain/river collection remained fresh.

## PR disposition

[PR #2](https://github.com/Nonarkara/cnx/pull/2) and [PR #4](https://github.com/Nonarkara/cnx/pull/4) were closed as selectively superseded, not blanket merged. Branches were retained. Integration decisions and discarded regressions are documented in `INTEGRATION.md`. No other open PR was present at the closing inventory.

## Remaining limits

The GitHub Actions standby does not meet a dependable recovery bound: observed scheduled runs were hours apart despite the ten-minute cron. An independently scheduled always-on collector is still needed for dependable off-Mac recovery. Other relay functions still depend on this Mac.

Public camera coverage remains sparse, and this session observed zero usable scored views. The pipeline is conservative haze screening, not validated citywide flood detection, water-depth measurement, route-safety verification or trained-model accuracy. See `docs/CCTV-PIPELINE.md` and `docs/SIC-47-APP-REVIEW.md`.

This evidence file is a private engineering record added after the application deployment; it does not change bundled application source. The release verifier permits such documentation-only drift explicitly.
