# Operational text contrast repair — 19 October 2026

User report: important text shared nearly the same color as its background.

Confirmed defects in the deployed interface and source:

- Dark action fill with white ticker/building labels: 2.32:1.
- White emergency label on its dark-theme hover fill: 2.78:1.
- Selected map gold/cyan/red controls: 3.25–4.23:1 at 13px.
- Offline camera labels and inherited quiet source text faded to 70% opacity: light-theme contrast 3.48:1.
- Empty camera message inherited quiet light-theme text on fixed black: 2.91:1.
- Verdict prose compounded severity text, tint and opacity.

Repair: paired adaptive foregrounds, darker fixed selected fills, full-opacity operational metadata, a matching empty-camera surface, untinted verdict surfaces, and native color schemes aligned with the selected theme. Layout dimensions remain unchanged.

Source ages remain based on observation time. Valid stamps additionally expose the exact Bangkok time, UTC+7, through semantic `time`, an accessible label and a tooltip; invalid/missing stamps do not manufacture a date.

Regression coverage measures the real filled-control pairs in both themes, alongside existing palette checks. Clock tests verify absolute timestamp semantics and invalid/future behavior. This does not substitute for browser checks of inheritance and compositing.

Initial checks: 57 focused tests passed; typecheck and lint passed. Independent source review found no blockers. Release and visual results are recorded below after verification.

## Release candidate 04a870b

- CI run 39202094365: all jobs green. Node 22: 1,120 tests in 113 files; Node 20: 1,119 passed and one expected native-TypeScript import skip. Typecheck, lint, plain Node relay imports and Worker build passed.
- Timestamp precision is retained from the upstream string; numeric epochs use ISO. Existing camera regression and the new clock test both pass.
- Local production Worker build and Wrangler deployment dry run passed.
- Built-browser checks: map rendered, layer menu and unavailable CCTV strip checked in light/dark; no detected sub-4.5:1 visible text in these targeted states. Native selectors follow the selected theme. No browser errors observed in these checks.
- Local KV is separate from production: unavailable local feeds were not represented as live production coverage.

CI: https://github.com/Nonarkara/cnx/actions/runs/39202094365

## Production contrast verification and camera follow-up

Release 04a870b passed the live gate: 49 routes, live rain (347 current gauges at that check) and river data (45 gauges). Browser matrix: Thai/English × light/dark × 390/1024/1440 CSS px; no page overflow and no detected visible text below 4.5:1 in the checked landing states. Expanded layer controls, CCTV strip, camera metadata and water-evidence handoff were also checked. These are targeted checks, not a guarantee about every possible state or third-party iframe.

Independent review approved the app-owned surfaces, but found the known-offline Windy player still rendered a dark link on black inside cross-origin content. Parent CSS cannot repair that content. The follow-up renders a content-fit, themed offline message instead of the known-dead player, retains the last capture time, and links to the attribution page (or player URL when attribution is absent). Reachable players remain available. Regression tests cover the offline-to-reachable transition and source-link fallback; 21 focused checks passed.

Artifacts: `/Volumes/Data/CNX/audit-artifacts/2026-10-19/` (12 viewport/theme/language screenshots, expanded states and contrast-matrix.json). The 12-screen matrix records 04a870b; the later camera-only change requires a fresh modal check, not a claim that the earlier captures show its fallback.

### Camera follow-up candidate 5fa9579

CI 39203288651 is green: Node 22 passed 1,121 tests in 113 files; Node 20 passed 1,120 with the expected native-TypeScript import skip. Typecheck, lint and Worker build passed. Local production build also passed. The known-offline external player is not mounted; a reachable player still mounts normally. The source link prefers `upstreamUrl` and falls back to `playerUrl`, covered by a regression with the optional attribution URL absent.

CI: https://github.com/Nonarkara/cnx/actions/runs/39203288651

## Final deployed camera follow-up

- Deployed code: `5fa95793880b2d5aa4a03da6bfc01e42691e7c71`.
- Cloudflare version: `7840691f-77e5-4741-b6d3-d92d495d5fb6`.
- Live fallback verified in Thai/English, light/dark at 390 and 1440 CSS px (eight checks): no detected low-contrast visible text. The offline player iframe is absent, with the source link, last capture time and close control visible. Browser error log was empty during these checks.
- Independent source and final screenshot reviews approved the fallback. No app-owned contrast/layout blocker was found in the reviewed captures; reachable third-party players are not certified by parent-page contrast scans.
- Final screenshot: `/Volumes/Data/CNX/audit-artifacts/2026-10-19/final-live-map-th-dark-1440.png`. Modal captures use `final-camera-*.png`; machine-readable results are `final-camera-checks.json`.
- Final release gate transcript is generated after committing this evidence at `/Volumes/Data/CNX/audit-artifacts/2026-10-19/final-release-gate.txt`.

The map remains the landing workspace. Header dimensions and content-fit controls were preserved. The public tab was restored to Thai dark mode and the temporary viewport override was cleared. The temporary local preview was stopped; no relay restart was needed for these frontend-only changes.
