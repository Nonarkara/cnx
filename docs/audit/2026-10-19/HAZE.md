# Haze watch and computer-vision audit — 2026-10-19

Scope: relay capture, calibration and ingest; ground PM2.5; aerosol context;
smoke transport; watch actions; camera/map presentation and accessible haze panel.

## Observed production evidence

Sampled at approximately 14:11 UTC (21:11 Bangkok), before this release:

- PCD: two Chiang Mai stations, observations at 14:00 UTC, 20.9 and 17.8 µg/m³.
- DustBoy: 260 northern stations, 109 in Chiang Mai; Chiang Mai mean 16.9,
  p95 maximum 27 µg/m³. These are sensor readings, separate from CAMS estimates.
- Camera catalogue: nine entries, only one reachable viewpoint. Its monochrome
  night frame was correctly `no-colour`, with no haze score.
- Validation history: seven distinct matched ground observations spanning only
  6–8 µg/m³. This does not establish haze detection accuracy, sensitivity or
  performance during a haze event.
- CAMS aerosol AOD: 0.168. The previous response exposed assembly time but not
  the underlying model hour. AERONET daily AOD500: 0.266, provisional Level 1.5.
  Neither quantity is ground PM2.5 or a health threshold.
- Smoke transport: 76 detections, 74 displayed paths; hourly 850 hPa forecast
  field. The accompanying surface wind is not the wind driving those paths.
- ASMC integration reports `needs-key`; no data or coverage is invented.

## Repairs

- Persist fingerprints of rejected as well as usable decoded camera frames.
  A frozen monochrome/dark image cannot gain a new capture time when CDN headers
  advance. Duplicate capture times and future history cannot establish calibration.
- Validate camera score/verdict/metrics/baseline coherence, geographical bounds,
  capture age and proximity/time matching of the paired PM sensor at ingest.
- Share decision-time checks across panel, watch list and map: current ground
  observations, current camera frames and relay batches, current smoke runs, and
  the actual aerosol model observation hour. A new collection does not rejuvenate
  old observations; clocks continue aging retained responses.
- Exclude suspect or expired ground sensor rows and use Chiang Mai rows for the
  Chiang Mai watch. Keep measured PM2.5, modeled PM2.5 and column AOD separate.
- Require full six-hour smoke paths for six-hour classifications. Expose omitted
  paths, preserve unavailable provenance when wind/coverage is missing, and retain
  genuine empty detection feeds as a distinct state. Label the actual wind method.
- Rework haze evidence into readable bilingual ground, model, camera, transport
  and public-report sections. Add AERONET failure/retry and refresh lifecycle;
  label mutable source previews honestly; suppress expired scores and verdicts.
- Include disclosure summaries in modal keyboard traversal and omit controls
  hidden inside closed disclosures.

## Operational limits that remain

Only one reachable public viewpoint is insufficient for citywide visual coverage.
Nighttime refusal is correct behavior, not a camera outage or a clear-air finding.
The visual method measures relative image detail against a per-camera baseline;
fog, cloud, changing light, obstructions, replacement images and camera movement
remain confounders. Persistent haze can contaminate a relative baseline. No new
model was trained and no detection-accuracy claim is made.

Source image URLs are mutable and do not provide authenticated capture evidence.
A source preview may differ from the frame analyzed at the recorded time. Public
reports are keyword matches, not verified incidents or a complete social census.
Smoke advection omits dispersion/deposition and is not an air-quality forecast.

No new data providers, paid workloads or forced forecast-grid refreshes were added.
The existing Mac relay remains required for camera analysis. Source access and
representative event-labelled evaluation are the next evidence gaps.

## Release verification

Final checks and deployment evidence are appended after execution.

Verified release: `3a55dbde8affb7bcdd703b3dae20743c8ce5f93f`, pushed to main.
Cloudflare version: `c6243a39-2517-4260-acc9-eef4c0d80aaa`.

- CI run 39270329938: full workflow green. Node 22.12.0: 1,167 tests in
  117 files; Node 20.19.0: 1,166 passed, one expected skip. Typecheck/lint
  pass on both. Plain Node relay imports and Worker build pass.
- Local typecheck, lint, relay imports and production build pass. The first
  local whole-suite run predated the final test-clock correction; it found two
  inconsistent mocked-Date cases. Focused relay/contract rerun passed 45 tests;
  the exact pushed commit then passed the full CI matrix above. The redundant
  older local run was stopped rather than reported as green.
- Independent code reviews covered relay/state contracts, smoke engine/feed,
  modal lifecycle/focus and watch routing. Independent visual review covered
  desktop/tablet/phone, English/dark, expanded stations and lower camera/smoke
  evidence. No blocking findings remained.
- `verify-deploy.mjs --expect haze-vision --expect rain --expect river-level`:
  PASS, 49 routes, clean/pushed release identity; rain 346 current gauges,
  river 45 current gauges; unauthorized ingestion denied.
- Only `org.nonarkara.cnx-flights-relay` was restarted (new PID 90949).
  Production haze batch 14:47:55 UTC is live; its frame remains dated 14:23:05
  UTC and `no-colour`, score null. Persisted dedup-only history is present.
  Separate computer-vision services were not changed.
- Production ground panel: PCD mean 19.4 µg/m³ from two stations; 109 usable
  DustBoy points across 21 Chiang Mai districts. CAMS AOD now explicitly carries
  model observation time 14:00 UTC, separate from assembly time 14:47:44 UTC.
  Smoke response identifies forecast-field method and two omitted paths.
- Live browser: Thai/English × light/dark × 1440/1024/390 px (12 states), no
  horizontal overflow or sub-4.5 contrast among 66 rendered essential text
  nodes per state. Expanded station disclosure: 399 checked text nodes pass.
  Real Shift-Tab from Close wraps to the last disclosure summary, not hidden
  controls. No browser console errors recorded in the verification tab.
- Evidence files: `/Volumes/Data/CNX/audit-artifacts/2026-10-19/haze/`, including
  twelve labeled live screenshots, lower/station screenshots, contrast matrix
  and sampled API JSON. These are local audit evidence, not bundled assets.
- Production tab restored to Thai dark operations map; temporary local preview
  stopped and viewport override reset.
