# Operational readiness audit — 20 October 2026, Bangkok

## Situation checked, not assumed

At approximately 20:51 Bangkok:

- TMD daily forecast issued 20 October, valid 18:00–18:00: northern
  thunderstorms over 10% of the region, mainly Phitsanulok/Phetchabun/Phichit;
  easterly winds. The monsoon trough was over the Gulf and central South.
  This does not establish a Chiang Mai depression or imminent overflow tonight.
- TMD seven-day forecast describes a southern low-pressure development later
  in its window. It must not be reworded as a current local storm.
- Measured rain: maximum 22 mm/24 h in Saraphi at 19:00. This is a point
  accumulation, not a current rain rate or basin-wide rainfall total.
- Model district maximum: approximately 2.4 mm/24 h at Mae On on a ~30 km grid.
  Local convective cells can be missed; absence of a model alert is not safety.
- River feed: 36 of 45 returned Ping-basin gauges were within the three-hour
  decision window. P.1's 18:00 reading was 2.55 m below its published critical
  level; that observation expires at 21:00 unless refreshed. Do not copy it
  forward as a current reassuring reading.
- Regional smoke: 85 FIRMS detections, 79 complete paths and six incomplete
  paths in the captured run. Source country and agricultural land use cannot
  be established from these fields alone. Regional screening includes Shan
  State/northern Laos; national borders are not transport boundaries.

Official sources:
- TMD daily: https://www.tmd.go.th/forecast/daily
- TMD seven-day: https://tmd.go.th/en/forecast/sevenday
- RID upstream Ping context, 9 August 2026:
  https://www.rid.go.th/th/rid_news/28483
- Chiang Mai PRD Saraphi lowland event, 1 October 2024:
  https://chiangmai.prd.go.th/th/content/category/detail/id/9/iid/328801
- ASEAN regional hotspot context: https://asmc.asean.org/asmc-haze-hotspot-daily/

## Geography and decision limits

RID documents upper-Ping inputs around Chiang Dao, Mae Taeng and Wiang Haeng,
with city drainage controls and downstream discharge management. District rain
screens are not delineated catchment totals. No rainfall volumes, gauge levels
or travel times are summed to manufacture an arrival estimate.

The 2024 PRD record documents city overflow accumulating in Saraphi lowlands,
including Chom Phu and Nong Faek–San Sai. It is historical evidence for repeat
checks, not a current inundation polygon or a recurrence probability. Flood and
haze exposure can overlap in the valley without being identical hazards.

The operational handoff now names upstream/city/lowland checks, regional smoke
coverage, and district confirmation of drains, pumps, open shelters and routes.
It carries into the governor brief's visible, printed and LINE-copy output.

## Computer vision and sibling reuse

Three public DWR still views were decoded and visually inspected during the audit:
Prachanimit Bridge on the Ping (Mae Rim), Ban Tha Duea on Mae Khan (San Pa Tong),
and Ban Pong on Mae Hat (Pong Thung, Doi Tao). The southern two are not upstream
city warning cameras. Each has explicit location context in the UI.

Reuse credits: DWR owns the public images; FloodDash supplies its fixed-ID snapshot
proxy and evidence-handling approach. Its `x-taken-at` header exposes source
capture time parsed from the DWR snapshot path, checked against on-image clocks.
Only three fixed IDs are sampled every 15 minutes through the existing local
FloodDash service. No arbitrary URLs, new paid providers, model downloads or
person tracking were introduced. Only metrics and fingerprints are retained.

The computer vision checks image readability, source capture age and repeated
scene pixels. It does not infer flood depth, flow, passable roads or trained water
segmentation. A working mutable preview may differ from the analyzed capture.
The existing five-second/three-sample FloodDash candidate algorithm was not
misapplied to ten-minute DWR stills. AirDash's weaker fetch-time haze clock and
clock-overlay fingerprint were not transplanted into CNX.

The wider vision service was healthy but its running 1.18.0 differed from its
1.19.0 checkout; no unrelated deployment or restart was attempted. FloodDash
4.164.1 and AirDash 2.4.101 were healthy. Other codebases' work was preserved.

## Defects repaired

- Official warnings and current concerns precede long model forecasts.
- Narrow forecast rows no longer squeeze their prose between chips and actions;
  actions and shelter targets retain 44 px minimum touch size.
- Missing first rain response is an honest unavailable state, not endless Loading.
- Native mobile topics and ticker no longer use decorative emoji icons.
- Shared FloodHub issue/window checks reject expired/future evidence, keep partial
  calm forecasts unknown, and retain known positive warnings with coverage gaps.
- Governor brief refresh failure clears stale forecasts; English contains forecast
  scope and aviation dates. No daily date is fabricated into an observation instant.
- Smoke proximity screens origin and hourly samples across a complete six-hour
  path, fixing paths that crossed near the city before exiting at six hours.
  Hourly samples can still miss crossings between samples. Internal edge keys
  version this changed assessment so cached endpoint-only flags are not relabeled.
- Three pinned river views have independent batch/capture aging, neutral quality
  states, failed-preview recovery, source credits and persistent freeze checks.

## Verification

Release, checks, visual evidence and remaining maintenance findings are recorded
below after execution. No claim of validated flood/haze detector accuracy is made.

### Shipped and independently checked

- Production code: `4b925dc7b842ce63f778cbafa66e01a128544fc8`, pushed to
  `origin/main`. Cloudflare version `a9184412-bcdf-4d11-86e6-8310c4961a68`.
- CI: https://github.com/Nonarkara/cnx/actions/runs/39441025772 — Node 20.19
  and 22.12 type checks, lint, **1,225 tests in 123 files**, and Worker build pass.
- Local production Worker build passes. Read-only release verification passes
  **51 routes**, matching deployed/published source and a clean tree, including
  rejection of unauthenticated water/haze ingest. Full gate:
  `/tmp/cnx-oct20-release-gate.log`.
- `npm audit --omit=dev`: zero reported production dependency vulnerabilities.
  This is the package advisories result, not a certification of the whole system.
- No open PRs awaited incorporation. Other codebases' changes were preserved.
- Mac on AC, Data mounted with approximately 5.6 TiB free. Only the existing CNX
  relay was restarted; launchd reports running, PID 1868. The final frontend/text
  release did not require another restart of unchanged relay code.

The final review also repaired retained RFD query aging (a successful empty query
expires after the declared two-hour window), the situation rail's stale
straight-line/endpoint-only wording, and unsupported agricultural/forest-burning
or spread claims inferred from VIIRS counts. Scores were preserved; attribution
now requires field verification. The actual transport method is passed through
the twin aggregation and covered by an integration regression.

Serial camera collection now finalizes every image status at the shared ingest
clock. A RED test crossing the 45-minute boundary reproduced rejection of an
otherwise valid batch; recomputing at `generatedAt` closes it. Source capture
times and persistent fingerprints are preserved.

### Real camera cycles, not just test fixtures

The production collector completed its first cycle at 21:33:49 Bangkok with all
three decoded views captured at 21:30. Its next ordinary 15-minute cycle completed
at 21:48:52: all three source captures advanced to **21:45**, all were readable,
and all had changed scene pixels. No extra restart or forced source sweep was
needed. Changed pixels do not establish rising water. The API and visible panel
both retained the capture clock separately from collection/batch time.

The haze screen was checked against actual data: two PCD reference stations,
114 usable Chiang Mai DustBoy points across 21 districts, separate CAMS PM2.5
and column AOD context, and one unassessable nighttime camera. The camera was
not promoted into a clear-air verdict. Sparse camera coverage remains explicit.

At the 21:34 release snapshot, the rain API returned 357 current gauges, maximum
3.5 mm/24 h at Doi Tao (21:00 observation). The handoff separately showed upstream
Mae Taeng 0.2 mm/24 h and Saraphi 3 mm/24 h with their own clocks. These later
point observations do not retroactively change the dated 20:51 audit snapshot
above. The river response contained 45 gauges; P.1 still carried its 18:00 reading
and was excluded from the current handoff. A fresh CHM004 reading is not a
substitute for P.1 or basin-wide assurance.

The smoke response used the 850 hPa hourly forecast field: 85 detections,
79 complete paths, three paths with sampled positions inside the province,
one within 50 km of the city, and six incomplete paths. This is model screening
over 0–6 h, not observed ground-level smoke or an arrival forecast. Detections
were described as east of Chiang Mai; no Myanmar/agricultural attribution was
manufactured from that direction.

### Visual and human review

Final production was checked in Thai and English at 1440, 1024 and 390 px, with
light/dark checks on desktop and phone. DOM width matched the viewport, normal
visual scale was 1, and sampled visible operational text had no contrast failures
below 4.5:1. This is a sampled composited-text check, not a blanket accessibility
certification. Selected water controls, river captions, haze evidence, source
times and briefing content were included. No new browser console errors were
captured after the final public reload.

Independent review inspected seven operational screenshots and both final
briefing captures: no material visual blockers. The map remains the landing
hero; the desktop header stays on one row. New briefing prose uses two readable
columns on desktop and one on phones, bounded to 65ch. Short summary tiles no
longer stretch to match their neighbours. Native disclosures keep secondary
evidence available without adding permanent map chrome.

Evidence directory: `/Volumes/Data/CNX/audit-artifacts/2026-10-20/`:

- `final-operations-{th,en}-dark-{1440,1024,390}.jpg`
- `final-operations-{th,en}-light-{1440,390}.jpg`
- `final-river-th-dark-1440.jpg`, `river-th-light-390.jpg`
- `haze-en-light-1440.jpg`, `haze-th-light-390.jpg`
- `final-brief-th-light-top-1440.jpg`, `final-brief-th-light-1440.jpg`

The visible Thai copy text included RID, ASMC, historical PRD and TMD URLs and
reference times. The copy control reported success; the browser connector's
clipboard readback was empty, so an OS-level paste was not independently proven.
The visible copy text and UI regressions verify the handoff contents. Final
browser state was restored to the Thai dark operations map with normal viewport.

### Operational limits and next confirmation

- Obtain a fresh P.1 reading directly from RID before a threshold decision.
  Historical gauge observations remain inspectable with timestamps; use the
  age-filtered Watch/Water/briefing decisions rather than interpreting every
  map point as a current condition.
- River analysis depends on this Mac's relay and the existing FloodDash snapshot
  service. Missing/stale batches become unavailable; public mutable previews do
  not refresh analyzed capture times. The three views do not cover the province.
- No calibrated waterline/depth/flow detector or validated camera haze accuracy
  is claimed. Such a capability needs matched gauge/image labels across daylight,
  night, glare, muddy water and obstruction before operational thresholds.
- Hourly modeled path samples can miss crossings between samples; incomplete
  paths and unresolved dispersion/deposition preclude an all-clear or smoke ETA.
- GDELT/news may recirculate old warnings; treat the news rail as leads, not
  current official applicability. ADS-B provider throttling remained intermittent;
  the relay continued serving OpenSky/merged observations through its existing
  fallback. No claim of complete aircraft or social-platform coverage is made.
- Historical Saraphi lowlands and seasonal burn areas are context, not a current
  flood extent or proof that flood and haze affect identical locations. District
  staff must confirm drains, pumps, open shelters and passable routes.

## Map-space correction, 20 October 23:10 Bangkok

Shipped `e997437` (with `095c735` and `76f5a6e`), Cloudflare version
`9944083f-e25e-499d-a98a-e06ca8064d0a`. The earlier design review missed
unnecessary layout tracks identified in the user's three screenshots.

- Removed the separate CCTV status band. Desktop access shares the compact
  measured-conditions line; below 1024px it stays in the Water panel. Opening
  the gallery does not displace the map. Camera source and capture clocks remain
  visible in the gallery. Selected camera dialogs render into the document body
  so a responsive hidden gallery cannot hide an active, focus-trapping dialog.
- Measured-condition controls use content width on desktop. Normal repeated
  monitoring labels remain accessible; warning and missing-data states remain
  visibly explicit. Desktop desk navigation flows around its labels instead of
  filling a boxed grid. News and desk rails now occupy 220px and 300px.
- Official-warning and watch-item text use the whole rail width below compact
  status/title lines. Removed permanent badge gutters and repeated card frames;
  kept source times, model/measurement distinctions, limits and evidence actions.
- Forecast details fold behind a 44px control. Play, current model time, active
  wind level and a keyboard-operable slider remain visible. Expanded controls
  retain layer choices, source/age, values and Back to now. Active rain/PM2.5
  legends remain visible when details are closed. No model math or feed changed.

Measured at 1440×900, before `4b925dc` versus live `e997437`:

| Element | Before | After |
| --- | --- | --- |
| Map | 900×731px, y=132 | 920×776px, y=87 |
| Collapsed forecast | 640×140px | 322×46px |
| Desk navigation including Province watch | 133px tall | 89px tall |

The map gains 8.5% area and starts 45px higher; the collapsed forecast covers
83.5% less map area. At 768px the conditions line is 45px tall with no isolated
CCTV row. At 390px Thai the map starts at y=139 rather than y=192; the two-column
metrics retain readable units and visible warning states. A 44px touch target
remains intentional space, not a reason to stretch a whole row or card.

Validation: CI run `39452716858` passed typechecking, lint and the Worker build;
Node 22 passed 1,228 tests, Node 20 passed 1,227 with the native-TypeScript
import check intentionally skipped. The new modal regression also passed
locally. Its first local attempt failed to start a test worker; the completed
retry ran all seven evidence regressions successfully. The production build and
deployment completed. `verify-deploy.mjs` passed 51 routes, clean/pushed/deployed
identity and ingest protections; rain had 355 current gauges and river-level
had 45 timestamped gauges at verification. These are feed checks, not flood
safety conclusions.

Actual browser checks covered 390, 768, 1024 and 1440px, Thai/English and both
themes. Sampled visible text contrast checks found no failures; this is not a
claim of complete accessibility certification. Verified keyboard forecast time,
Back to now, gallery access and an open camera's 1024→768px resize followed by
Escape. Independent screenshot review found no blockers. Added the geometry
and intermediate-width requirement to `AGENTS.md`.

Evidence: `/Volumes/Data/CNX/audit-artifacts/2026-10-20/space/`, including
`before-1440.jpg`, `before-390.jpg`, `final-preview-1024-cctv.jpg`,
`final-preview-768-th-dark-top.jpg`, `final-preview-390-th-light.jpg`,
`final-preview-1440-en-light.jpg`, `live-1440-th-dark.jpg`,
`live-390-th-dark.jpg`, `live-390-en-light.jpg` and `live-768-en-light.jpg`.
No relay restart or data-source/AI changes were required.

## 21 October — directional smoke symbols and release runtime gate

Released source `28b39dad3ca155a4027343a82fbe8da8158554c9` as Worker version
`8afcd877-da21-4c02-a627-0dc23c8e2fc0`. Replaced continuous red modeled-smoke
paths with fixed-size, sparse teal chevrons at model-leg midpoints. Street and
satellite use contrasting halos. Marks retain original segment identity for
picking; stationary, invalid and backward-time legs do not invent direction.
The bilingual key distinguishes smoke transport from wind and visibly states
that modeled movement is not measured wind or confirmed smoke arrival.
No forecast physics, providers, alert thresholds or relay services changed.

Actual browser checks covered 390, 768, 1024 and 1440px, Thai/English, dark/light,
Street/Satellite and 3D switches. At 1440×900 the map remains 920×776px at y=87;
the collapsed forecast remains 322×46px. Phone document width remained 390px.
The light-theme key's sampled essential text exceeded 7:1 contrast. Independent
review found no visual release blockers. Tooltip identity passed source/helper
review; live hover picking was not verified by the available browser controls.

Local direct FIRMS access timed out. Renderer QA therefore used an isolated
loopback proxy serving an unchanged public smoke response generated at
2026-10-21T13:26:47.854Z (80 segments, forecast-field); all other reads reached
the actual built Worker. This was not a production data modification. The final
public screenshot uses the public application directly, with its newer live
response. Temporary preview processes and the local-only forecast lock were
cleaned up. Evidence: `/Volumes/Data/CNX/audit-artifacts/2026-10-21/wind/`, notably
`before-regional-1440.jpg`, `preview-regional-chevrons-1440.jpg`,
`preview-satellite-3d-1440.jpg`, `preview-390-en-light-key.jpg`,
`preview-768-en-light.jpg` and `live-regional-1440-th-dark.jpg`.

The release build exposed an expired Next 15 support window. Upgraded to
Next/eslint-config-next 16.4.2, retaining webpack for the MapLibre worker alias
and the required Next TypeScript settings. A subsequent local runtime check
caught HTTP 500 from the adapter's missing preview-props manifest handling;
upgrading OpenNext Cloudflare to 1.20.12 resolved it. Added a CI gate that boots
the built Worker, verifies its build SHA, and requires `/cnx` HTTP 200, so build
success alone cannot mask this failure again. Existing security middleware was
preserved; its Next 16 deprecation warning remains a maintenance follow-up.

Pinned the inherited minifier glob to 10.5.0. `npm audit --omit=dev` reports zero
vulnerabilities; the full development graph still reports the braces advisory
GHSA-vfj7-8cjw-p6xm through lint tooling. This is not a whole-graph clean bill.
CI run `39606775334` passed: 1,234 Node 22 tests; 1,233 Node 20 tests plus the
intentional native-TypeScript skip; lint, types, bundle and Worker HTTP startup
gate. Node 22 runs the current Wrangler build/runtime tools.

Production verification passed all 51 routes, clean/pushed/deployed identity and
unauthenticated ingest denial. Rain returned 358 current gauges (maximum 4.4mm)
and river-level returned 45 timestamped gauges. Public map rendered the new
symbols with no captured browser errors. These are release/feed checks, not a
claim of flood safety, smoke arrival or camera accuracy.
