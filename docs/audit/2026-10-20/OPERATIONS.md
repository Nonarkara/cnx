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
