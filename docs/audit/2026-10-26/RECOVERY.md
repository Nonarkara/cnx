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
- Deterministic local bakes produced 59,344 city roofs and 1,913 temple roofs;
  no provider calls were used. City table is about 975KB gzip; temple table
  about 28KB gzip. City roofs load only with the 3D city.
- Updated Happy DOM to 21.0.4, body-parser to 2.4.0, ip-address to 10.7.5 and
  Miniflare's nested Undici to 7.30.1. Both full and production npm audits
  returned zero vulnerabilities. Next 16.4.2/OpenNext 1.20.12 remained fixed.

## Verification in progress

The original cold full-data contact scan exceeded its 60-second budget on this
loaded Mac; it did not report personal-contact hits. Its allowance is now 180s
with every assertion and file retained. A first typecheck also raced Next dev's
generated route files; final checking runs without that writer. Initial partial
runs are not reported as passing. Focused roof/temple/fixture tests (65) and
water-scope/freshness tests (52) passed before the final release gate.

Before screenshots are in `/Volumes/Data/CNX/audit-artifacts/2026-10-26/`.
Final screenshots, measured chrome/map geometry, interaction checks, independent
review, CI and release identity will be recorded after completion.

## Remaining operational limits

Restore or replace stale camera sources through their operators; do not relax
capture-age checks or turn empty nighttime vision into an all-clear. Current
Longdo index coverage had no cameras inside this application's corridor. A
running relay does not guarantee an upstream publisher is updating. No new
paid model workload, training claim, or service restart was introduced.
