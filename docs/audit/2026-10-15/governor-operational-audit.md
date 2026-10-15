# CNX operational audit — 15 October 2026

Scope: decision evidence, public warning interpretation, briefing consistency, camera capture age, aviation estimates/history, retained forecasts, relay trust boundaries and public-data privacy. This is an engineering audit, not certification of forecast accuracy or citywide coverage.

## Corrected findings

| Risk | Before | Corrected behaviour |
|---|---|---|
| Stale official warning check | A retained empty CAP response could keep saying no warning | Retrieval older than its declared 40-minute SLO is unknown; original official document links are available |
| Historical evidence ranked as current | Stale metrics and old daily reference products could remain current warnings or normal | Current metric flag and declared AERONET/JAXA SLOs govern ranking; historical evidence remains identified |
| Unusable camera all-clear | A nonempty collection containing night/unknown/unusable frames could be graded normal | Only usable, current frames support a vision verdict; missing evidence is unknown |
| Retained model outlook | Old peaks and totals could remain under the next-48-hours heading | Client re-ages every minute, expires six-hour-old cache, recomputes future peaks/totals and rejects incomplete first-day rainfall evidence |
| Partial CAMS evidence | A low reading amid missing model cells could imply clean air | Incomplete future PM2.5 coverage is unknown; valid rainfall evidence remains available |
| CAP export consistency | Exported model warnings could bypass the client freshness protection | Server CAP output uses the same forecast filter; unavailable model data cannot establish warning cancellation |
| Shelter directions | Largest listed capacity described as nearest | Listed shelter wording; opening, access and remaining capacity require district confirmation |
| Arrivals identity and dates | Seat estimates described as foreign visitors; retained days labeled by array position | International-arrival passenger estimates, actual Bangkok dates, refresh failures and retry |
| Camera evidence presentation | Refresh cadence could imply a current image without its capture time | Capture time, unknown/stale status and visible image failure/retry; player/stream/snapshot distinctions retained |
| Briefing disagreement | Forecast actions appeared in copied LINE text but not screen/print | Same modeled actions in all three outputs |
| Future relay timestamp poisoning | A future push could prevent normal current pushes until expiry | Reject excessive future skew before storage; allow current payload to repair unreadable future copies while retaining replay checks |
| Aircraft outage recorded as zero | Degraded snapshot could enter trend history as zero traffic | Explicit unavailable response, no outage history write; panel distinguishes unavailable from genuine measured zero |
| Metadata rebake privacy | CSV redaction did not cover metadata display fields | Redact notes, names, publisher, tags and resource labels on new and cached metadata; preserve resource IDs/URLs |
| Ambiguous wind glyph | Slow animated trails resembled raindrops | Open-headed moving arrows, with direction visible at low speed and in reduced-motion mode; rain keeps droplets |

## Checks and evidence

Focused regressions cover stale/future CAP retrieval, original-document links, metric ranking, daily reference expiry, unusable/old vision frames, midnight arrivals, failed camera images, printed forecast actions, forecast expiry/past peaks/missing grid samples, poisoned relay recovery, failed versus genuinely empty flight snapshots, and metadata redaction. Whole-suite verification: 1,053 tests passed across108files; TypeScript and ESLint passed. Code was cross-reviewed across decision logic, frontend evidence and relay/security boundaries. Production build and live release gates follow this committed source; their results are recorded in the release handover.

Baseline live checks returned HTTP200 for build, rain, river, air quality, official warnings, manifest, forecast, haze vision, CCTV, flights and social. HTTP200 alone is not a freshness or correctness test.

## Material limits retained

- Public CCTV coverage is sparse. The checked camera list had one responding source of nine; it is not a citywide visual safety assessment.
- Vision agreement has not spanned a severe haze event. No claim of validated PM2.5 inference or model training is made.
- News feeds support investigation, not representative public sentiment or comprehensive social listening. Individual upstream failures stay visible.
- Flight telemetry is receiver coverage, not complete airport operations. Passenger estimates do not establish nationality, tourist status or actual headcounts.
- A successful replay check is not atomic deduplication: Cloudflare KV remains eventually consistent.
- Prior false-zero historical aviation rows cannot be reliably reconstructed from aggregates; the fix prevents new contamination.
- Modeled warnings are screening signals. Official instructions and current field observations remain the operational authority.
- Relay-backed feeds still depend on this Mac and its network. No uptime or independent failover guarantee is implied by a passing audit.

## Follow-up: warning lifecycle on an unattended screen

Priority: keep official-warning evidence consistent while an operations screen remains open. The map formerly filtered expiry only when a CAP response changed and did not apply the board's retrieval-age guard. The watch board also memoized time-dependent decisions without its own clock.

Map outlines and watch-board rows now share one selection function. An expired warning loses its current outline; an unavailable, stale or unverifiable CAP check cannot supply a current outline. A current empty check remains distinct from an unknown check. Existing source links and the board's explicit unavailable state remain available. Selection is re-evaluated every minute, and immediately on window focus or visibility changes, without adding requests or layout chrome. Missing outlines do not establish safety.

Regressions reproduce retained-alert expiry, stale retrieval, invalid/future retrieval timestamps, and returning to the screen after timers have paused. These are lifecycle checks; they do not validate the completeness of TMD's feed or predict hazards.

Follow-up validation: all 1,062 tests passed across 109 files; scoped ESLint, TypeScript and whitespace checks passed. Release identity and live route checks are recorded after deployment.
