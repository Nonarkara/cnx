# Governor operational showcase audit — 30 October 2026, Bangkok

Operator task: locate the current concern, check the official channel and observation time, inspect supporting evidence, and carry a dated brief into an operational discussion without losing the map.

**Release status: shipped.** Production serves `5800a16258fe100cffff1852e51ad10a5088aace`, committed and pushed. Local OpenNext packaging and Cloudflare deployment succeeded (Worker version `ed4a6943-950e-482f-99c3-3723bcf35aa1`). The public release gate passed all **51 routes**, published/clean-tree identity, protected ingest denials and critical no-store checks. HEAD differs from the deployed source only by this engineering audit document. Public Thai desktop and phone map/brief captures confirm the deployed UI; browser error capture was empty for these checks. This is a scoped operational showcase pass, subject to the limits below.

## Scope and lineage

The entry tree was clean at `b39fbf5`, matching production. Published commit `4054c7e`, a one-line test lint correction, was inspected and fast-forwarded before editing. No unresolved local patch was present. The initial route probe found the API inventory healthy; its identity check caught the local/published difference rather than a feed outage.

This pass covered the actual map, governor brief, Thai handoff preview, evidence navigation, official-warning states, observation-age labels, responsive geometry, relay health, camera limits, provider backoff and release checks. It is a scoped engineering and usability audit, not certification of complete regional coverage, predictive accuracy or operational staffing.

## Found and changed

1. **Official warnings were missing from the forwardable brief.** The brief now uses the watch board's shared TMD CAP hook and warning selection/freshness policy. Official status leads dashboard analysis. Active-warning headlines, effective windows, instructions, agency, check time and safe source links are retained on screen and in copied Thai text. Unavailable, stale and no-warning states stay distinct; an expired check cannot become an all-clear. No new warning thresholds or polling service were added.
2. **The phone brief delayed the next decision.** At 390×844, its original title/control group occupied 204 px and next checks began at y=2313.625. Large controls, four equal-weight tiles and contextual notes pushed actions below several screens. A compact opening now leads into official status and next checks, followed by current air/fire/water evidence and district comparison. Historical aviation is separate, retaining its date, estimate assumptions, observed-coverage caveat and evidence action. Full contextual notes remain later in the document. Readable type, usable targets and visible focus remain.
3. **A calm composite label overstated the conclusion.** “No elevated signal” appeared while air/hotspot watch items and modelled smoke paths were visible elsewhere. The masthead now explicitly describes the composite as below escalation. Scores, source thresholds and the exclusion of smoke paths from measured hazard scoring are unchanged. A model path is not evidence that smoke reached the city or the ground.
4. **A generic age label falsely marked valid source clocks stale.** The watch board now uses the displayed clock's declared policy, including FIRMS's 24-hour detection window and registry budgets for daily references and forecast issuance. Retrieval recency never replaces capture or measurement time. Genuine stale states, original timestamps, and existing river, rain, flight, camera and official-warning expiry remain protected by regressions.
5. **Provider-directed rest could be shortened.** Existing exponential backoff and tick-overlap protection were already active. Retry-After handling now accepts integer seconds and HTTP dates, and an explicit longer instruction is not shortened to 15 minutes. The default exponential cap remains. Cooldowns are process-local and reset on reload; this does not claim persistent provider state or header support on every upstream path.
6. **The English air summary could hide a higher district behind the mean.** The summary now keeps the highest reporting district beside the mean, with location and measurement context. In the inspected evidence, a mean around 18 µg/m³ did not erase a Fang reading of 63 µg/m³. These are different aggregates, not conflicting province-wide measurements. District comparison also now precedes lengthy operational context, so the next place to investigate does not require reading the background first. The bilingual regression preserves that distinction; the figures remain dated evidence rather than fixed showcase values.

The desktop evidence layout was also recomposed: long water evidence no longer stretches a three-column row and leaves unused space beneath shorter air/fire evidence. Water spans the two short reading rows at wide widths and becomes a full-width row at the intermediate breakpoint. No measurements, limitations or historical evidence were removed.

## Verified

- Final candidate `5800a16` passed **1,365 tests in 134 files**, TypeScript, lint, native relay imports, Cloudflare bundle build and actual Worker startup in [CI 40935994494](https://github.com/Nonarkara/cnx/actions/runs/40935994494).
- Focused tests cover active official instructions and source links, stale empty CAP checks, next-check ordering, separation of historical aviation, bilingual district context, clipboard-denial manual fallback, source-age policies and provider delay/expiry. The backoff change passed five fake-clock tests and native Node import checks without external provider probes.
- Final CI supersedes incomplete local runs: slow filesystem reads prevented one local component worker from starting and stalled a local lint invocation. Those local attempts are not reported as passes.
- Full dependency advisory audit returned zero known vulnerabilities at inspection. No dependency versions, credentials, network access controls or production CSP were relaxed.
- An independent reviewer accepted the actual final light/dark screenshots at **390, 768, 1024 and 1440 px**. Sampled visible text had no contrast failures: minimum **7.97:1 dark**, **6.75:1 light**, against the required 4.5:1. These samples do not certify every hidden, hover or error combination.
- The clipboard-denial regression preserves manual handoff. The browser showed a successful copy state and a Thai preview retaining official status, sources, dates and the public URL; its separate clipboard inspection returned an empty list. **OS clipboard transfer and native print-preview pagination remain unverified.** No LINE message or physical print was sent.

## MSH evidence

Artifacts: `/Volumes/Data/CNX/audit-artifacts/2026-10-30/showcase/`. Each final screenshot has a paired JSON geometry record. Filenames were checked against actual viewport dimensions.

| Phone brief, Thai dark, 390×844 | Before | Final |
| --- | ---: | ---: |
| Dialog width | 358 px | 374 px |
| Official status starts | Absent from brief | y=149.25 |
| Next checks start | y=2313.625 | y=267.75 |
| Current evidence starts | Within the old tile block | y=411.75 |
| District evidence starts | y=2480.625 | y=1263.875 |

Official status and next actions now appear together on the first phone screen. Current evidence, district comparison and detailed context earn normal document scrolling; they are not clipped or placed in new nested scroll regions to force a one-screen claim. Historical aviation follows current evidence and operational context. On desktop, official status starts at y=122.75, next checks at y=221.75 and current evidence at y=289.5.

The landing-page geometry remains map-led and unchanged by this repair. The following captures include real status text; changing observations and language can change the height of the evidence bands.

| Map view | Header | Combined top chrome | Map bounds |
| --- | ---: | ---: | --- |
| 390×844, Thai dark / English light | 41 px | 277.625 px; 32.89% | 390×464.20 at y=278.625 |
| 768×900, Thai dark | 41 px | 211.75 px; 23.53% | 768×540 at y=212.75 |
| 1024×900, English light | 41 px | 192.625 px; 21.40% | 804×540 at x=220, y=193.625 |
| 1440×900, Thai dark | 41 px | 139 px; 15.44% | 920×723 at x=220, y=140 |

The 1440 px composition retains its 37 px bottom ticker (4.11% of viewport height). Document widths match the tested viewports. No blocking clipping, unintended horizontal scrolling, close-control collision or unexplained card stretching was found in the final independent review. The brief's title, copy/print actions and close control use intrinsic tracks on wider screens and a deliberate second control row on phones. Focus remains visible.

Reading order is **map → current provincial evidence → desk**; within the brief it is **official channel → next checks → current evidence → district comparison → context/history**. Sources, observation times, methods, evidence actions, touch targets and keyboard navigation remain available. No demonstration-only scenario values or fabricated live observations were introduced.

## Operational evidence and limits

The following are dated snapshots, not a prediction of conditions later on 30 October:

- Around **00:53 Bangkok**, the running relay had activated the October 27 backoff changes; logs showed 60/120/240-second rests and continuing merged updates. Critical public feeds retained `private, no-store`. The river response held 44 gauges, but only 19 were within 45 minutes and 21 within three hours. Rain had 356 observations within six hours, with a 29.6 mm maximum at San Sai. A fresh envelope does not make every retained observation current.
- **P.1 was stale.** The interface explicitly stated that city river conditions could not be confirmed from it. CHM004 at Chiang Dao is not a substitute city gauge. Measured rolling rainfall does not establish combined runoff volume, water-arrival time or imminent flooding.
- At **02:08 Bangkok after one controlled relay reload**, flight observations were current and merged. River collection was 01:59 with newest observation 01:30; 19/44 gauges were within 45 minutes. One DWR capture at 01:15 had become stale; the other two at 01:30 remained inspectable. A recent monochrome haze frame was excluded, leaving **no usable haze assessment**. Transient push/upstream timeouts occurred before updates resumed; a running PID alone was not accepted as health proof. See `relay-post-reload.json`.
- Camera metrics support image readability and scene-change inspection, not calibrated water depth, overtopping, inundation extent or road safety. Haze agreement contained 87 clean-air pairs at PM2.5 3–9 and zero event readings; it does not validate severe-haze detection accuracy. Current relay output is not current usable provincial vision coverage.
- The previous day's OpenSky arrivals showed one detected flight versus 105 the preceding day. These are network observations, not a complete airport arrival count. Passenger totals remain capacity/load-factor estimates, not actual passenger or tourist counts.
- Water coverage remains predominantly the Ping basin, not comprehensive Salween/Kok/Burmese-border flood monitoring. Historical flood-prone geography and smoke-transport models provide context for corroboration, not current inundation or confirmed cross-border smoke arrival. TMD CAP status does not replace daily/seven-day forecasts; no warning in that feed is not proof of safety.

Operational handover still requires named system ownership, a technical operator, duty escalation and data stewardship. The Mac remains a primary relay for several feeds; independent rain/river standby scheduling is best effort, not an uptime or recovery SLA. The dashboard supports decisions and does not issue official evacuation orders or public alerts.

Local packaging and test startup were unusually slow in filesystem reads. The Mac was on AC power; `/Volumes/Data` had 5.5 TiB free, while the internal SSD had about 4.6 GiB free at inspection. Scratch stayed on the data volume. No unrelated files or processes were removed. Producing deployable artifacts in CI remains a release-maintenance improvement, outside this candidate.

## Suggested live demonstration

1. Open the map. Identify a concern, its district/station, source and observation time; distinguish local evidence from province-wide conclusions.
2. Open the governor brief. Read official status and next checks first, then inspect one current-evidence link.
3. Show the P.1 evidence gap rather than substituting an upstream station for the city reading.
4. Show that a monochrome camera frame stays unassessable rather than producing a false clear haze score.
5. Inspect the dated Thai handoff preview and its source links. Use the manual fallback if clipboard access fails; native clipboard/print limits above still apply.
6. Return to the operational map. Use layers and the credited data library for detail; keep the overview secondary to the map.
