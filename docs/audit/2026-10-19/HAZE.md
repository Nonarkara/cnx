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
