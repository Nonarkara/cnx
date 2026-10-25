# CNX recovery audit — 26 October 2026 (Bangkok)

Task: let an operator identify the current hazard, its location and evidence,
then act without losing the operational map.

## Found

- At entry the public application returned HTTP 200, serving `7dac90e`.
  Local main was `15e3106`, with unfinished roof work in the working tree.
  There were no open pull requests to recover. This audit does not establish
  the exact cause or duration of the reported earlier outage.
- The relay was running after the Mac boot. Its historical exit 78 did not
  describe the current process. AC power, disabled AC sleep, mounted data volume
  and 5.5TiB free were verified. No relay restart was justified or performed.
- All nine Windy haze camera captures were old: the newest was about 36 hours
  old, others 23–29 days. HTTP 200 does not make an old capture live. Haze vision
  correctly excluded them; the fresh empty result is not evidence of clear air.
  DWR water-camera captures were recent and independently inspectable. The old
  haze/DustBoy pairs cover low pollution only, not detection accuracy in events.
- A fresh Chiang Dao gauge was displayed as generic “Water”; its station was
  only in the tooltip. P.1 was historical, correctly excluded by the existing
  three-hour freshness guard, but the summary could be mistaken for a city-gauge
  reading. River availability varied by station; an API's gauge count does not
  establish that all readings are current.
- Unfinished roofs had displaced centres, mirrored north/south orientation,
  visibility with both toggles off, and inconsistent height accounting. GPU
  errors could leave shortened walls without roofs. The render path also
  leaked shared GL state/resources and allocated palette data each frame.
- At 390×844, the situation band occupied 141px and the map began at y=280.
  Status, a long headline and its evidence action were three separate groups
  stacked vertically. At 1440×900 the band cost 61px and the map was 920×715px.
  The building card also reserved four boxes for unconnected survey/utility
  fields, making the actual source and model caveats harder to reach.
- Newly published dependency advisories affected test/runtime-tooling paths.
  No demonstrated public Worker exploit was found; dependencies still needed
  patching. Next/OpenNext were deliberately kept on the working versions.

## Changed

- The water summary visibly names its selected station, location and clock,
  and discloses historical P.1 when another gauge is selected. Rain-led summaries
  name the rain district instead. Freshness rules were preserved.
- Situation status and the evidence action share one row on phones, with the
  complete headline below. Desktop uses one coherent row. No headline or
  limitation was clipped or hidden to manufacture a fit.
- Removed four empty building-card placeholder boxes. Roof form/height
  limitations remain visible; long names wrap, the close target is usable, and
  long detail overlays are bounded to the map rather than clipping their close
  control above it. This is a detail overlay, not an extra scrolling page rail.
- Corrected roof geometry, height conservation, group visibility, projection
  precision and GL lifecycle/state handling. Modelled roofs reuse existing
  totals; those totals can come from OSM tags, floors×3m or a 9m default. Roof
  shape/material are not a field survey. Temple roofs follow the wall zoom
  threshold. Renderer/table failure preserves full-height building totals and
  displays an unavailable state. Forecast and native map controls no longer
  trigger selection of a building behind them.
- Menu stacking now keeps header actions above the live pulse. Building/key/forecast inspectors claim one shared slot, so expanded inspectors do not obscure each other. At tablet width the four metrics use deliberate columns instead of leaving Aviation alone on a wrapped row.
- Deterministic local bakes produced 59,344 city roofs and 1,913 temple roofs;
  no provider calls were used. City table is about 975KB gzip; temple table
  about 28KB gzip. City roofs load only with the 3D city.
- Updated Happy DOM to 21.0.4, body-parser to 2.4.0, ip-address to 10.7.5 and
  Miniflare's nested Undici to 7.30.1. Both full and production npm audits
  returned zero vulnerabilities. Next 16.4.2/OpenNext 1.20.12 remained fixed.

## Verified

- Final source: `679fd44` (pushed main). CI [40223403159](https://github.com/Nonarkara/cnx/actions/runs/40223403159) — **success**: 1,319 tests on Node22; 1,318 passed plus one intentional skip on Node20; lint/types/Worker build and actual Worker startup passed. The preceding exact functional candidate `68d9141` passed all 1,319 tests in 131 files on Node 22; Node 20 passed 1,318 with one intentional native TypeScript compatibility skip. Lint, types, Worker build and Worker startup passed. The final delta is tablet CSS composition only.
- The original cold full-data contact scan exceeded 60 seconds on this loaded Mac. Its budget is now 180 seconds; all assertions/files remain, and CI passed. The initial partial run and its failures are not counted as a pass. Final type checking ran without the dev server racing generated route files.
- Actual built Worker browser checks used a read-only localhost proxy for production API reads, preserving public payload timestamps. Street → Satellite → Street was exercised: Satellite retains native full-height buildings; Street roofs render again. No browser errors; the existing shared hillshade/terrain-source warning remains.
- Phone menu first actions are visible above the pulse. A picked building card ended at y=646.82, while the collapsed forecast began at y=664.82: 18px clearance. Opening forecast closed the card; opening the key collapsed forecast; reopening forecast closed the key. The expanded key also cleared the compact forecast. Evidence keyboard focus was visible with a 2px outline in the candidate check. Forced GPU failure was regression-tested, not visually injected into the final application.
- Essential pulse text was sampled on actual composited surfaces in English light and Thai dark. Light secondary 7.23:1, watch 5.70:1; dark secondary 8.79:1, main 14.53:1, watch 10.76:1. This is evidence for the changed surfaces, not a claim that every historical state in the platform was exhaustively checked.
- Independent six-image review found no additional release blocker. A 768px aviation orphan was found in the final browser check and corrected with an intentional four-column tablet composition. Independent final review accepted Thai-dark768, English-light768 and English-light1024; no remaining release-blocking visual issue was found in reviewed states.
- Deployment source `679fd44a1b42bc47ee421556f713fdaede706d30`, Cloudflare version `52562577-c596-40b3-8887-5bac39e3a9f6`. Public gate **PASS — 51 routes and release identity verified**; tree was clean, published main matched HEAD and the live build. Unauthenticated ingest returned401. Rain returned live351current gauges, maximum19.2mm; river returned live45gauges with observation times (not all are current). Direct public1440/390 browser checks rendered the map, compact header and reachable phone menu; no browser errors. Public evidence: `live-1440-th-dark.jpg`, `live-390-th-dark.jpg`.

### MSH evidence

Screenshots are in `/Volumes/Data/CNX/audit-artifacts/2026-10-26/`.
`before-*` files show entry production; `preview-*` files show intermediate defects and are not final proof. `final-*` files show the reviewed functional candidate68d9141; `ship-*` files show the exact final679fd44 bundle. Source/build IDs are recorded in the screenshot headers where that breakpoint displays them.

| Viewport | Top chrome (header + pulse + situation) | Map bounds | Task visibility and preservation |
| --- | --- | --- | --- |
| 1440×900 | 41+45+53 =139px (15.44%); bottom ticker37px (4.11%) | x220,y140,920×723; entry920×715 at y148 | Map first, province watch second, news third. Complete evidence/action visible; rail reading earns its scroll. |
| 1024×900 | 139px (15.44%); no fixed bottom ticker | x220,y140,804×540 | Map and controls together; desk below map earns further reading. No horizontal overflow. |
| 390×844 (Thai) | 41+130+106.625 =277.625px (32.89%); no fixed bottom ticker | x0,y278.625,390×464.195 | Map and live status together. Explicit gauge scope adds33px to pulse; regrouping the band saves34.375px. Map begins about1.4px earlier than entry, not a dramatic phone-area gain. Desk tabs remain below map. |
| 768×900 | 41+82+88.75=211.75px (23.53%); no fixed bottom ticker | x0,y212.75,768×540 | All four metrics remain peers; no aviation orphan. Thai pulse saves11px against the intermediate93px wrap. |

Removed geometry: four unconnected building fields, redundant ready badge, stacked evidence/status grouping; corrected menu stacking and overlay clearances. Necessary 44px targets, full warning prose, map layers, forecast, sources and model caveats remain. No overflow hiding or unreadable type was used to force a fit.

## Remaining operational limits

The real style-switch check exposed a DEM mismatch: native terrain buildings
follow ground elevation while the custom roof meshes only carried height above
ground. Schematic roofs are therefore supported on Street only. Satellite and
Terrain retain full-height native buildings, with the limitation in Layers and
the key. No unsurveyed ground offsets were invented to make the picture fit.

Restore or replace stale camera sources through their operators; do not relax
capture-age checks or turn empty nighttime vision into an all-clear. Current
Longdo index coverage had no cameras inside this application's corridor. A
running relay does not guarantee an upstream publisher is updating. No new
paid model workload, training claim, or service restart was introduced.

The host was heavily contended (16GB RAM, high load and swap, many unrelated Node, indexing, analysis and model processes). This explained slow local builds. No unrelated process was killed and no OS/indexing/model-service configuration was changed. Keep future CNX builds single-flight; broader host tuning needs a separate measured change. The existing ten-minute relay standby workflow succeeded and reported fresh primary copies with no upstream reads/writes.

English phone status prose occupies an additional17.875px (topchrome295.5px,35.01%;mapy296.5,390×464.195). This is complete translated hazard context, not an empty spacer; it remains visible instead of clipped. Final screenshots cover both phone languages, both themes and the required390/768/1024/1440 widths.
