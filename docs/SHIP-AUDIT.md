# CNX release audit — 2 October 2026

> **READ THIS FIRST — which paragraph below is current.**
>
> This file is a **chronological record**, appended across several runs on
> 2 October 2026. The first section describes the audit *baseline*; later
> sections describe follow-ups. **The current, verified release state is the
> top of the final "Follow-up" section: version 1.3.4 at `ebf8146`.**
> Everything above it is history and is kept because the audit's reasoning
> and its explicit limits still apply.
>
> An earlier revision of this file was written at 22:26:29 ICT, **28 seconds
> before** the release it was describing, so its header still named the
> pre-release commit. That was a real defect in this document: a reader
> arriving today would have drawn wrong conclusions about what is deployed.
> The header now states the current release and points here.

## Verdict (audit baseline — historical)

Audit complete: **29 defect groups repaired**, integrated tests and final
production packaging passed. This is a validated release candidate with
the explicit limits below, not an unconditional security/accuracy certification.
At the audit baseline, and again before the authorized release follow-up, live served
`5606843`, built `2026-10-02T11:00:57Z`. Production had already advanced beyond
`35c902c`; no deployment occurred **during this audit**. The earlier statement
"Production remains unchanged" referred only to audit actions and was too broad.
This audit covers the working tree, including the preceding camera-vision changes.
A matching deployed commit did not include the local fixes. No production deployment,
relay restart, authenticated ingest, or dependency upgrade was performed during the audit.

Before release, `origin/main` was `bbdd53b`, three commits behind local/live
`5606843`. The live commit existed in local Git but was not pushed; the audit fixes
were still uncommitted. The authorized follow-up commits and pushes the complete
candidate before building/deploying. The release gate now additionally requires
the actual published `origin/main` HEAD to match local and deployed HEAD.
The release is version **1.3.2**. Three published-HEAD regressions bring the
follow-up suite to **453 tests in 43 files**, all passing. Dependency advisory
limits and the absence of comparative/vision accuracy measurements are unchanged.

The competitive goal is a target, not an audit result. No named comparison apps,
matched operator tasks, or comparative measurements were supplied during this run.
CNX cannot honestly claim to outperform every alternative on this evidence.

## What was inspected

API routes and input boundaries; relay authentication, image processing and KV
freshness; data adapters, provenance, forecasts, story/RAG and risk composition;
flight/arrival/seat summaries; browser layout and keyboard flows; map source loading;
mobile install metadata; Workers configuration, CI and release verification;
dependency advisories and the historical reserve Worker.

## Defects repaired

| Priority | Failure before the audit | Result in the candidate |
|---|---|---|
| High | Missing PM defaulted to 18; one CAMS value became seven invented station values; future forecast presented as current | Actual current UTC model hour at one labeled grid point; genuine ground readings take precedence; missing values remain unknown |
| High | Stories invented agency announcements, response deployments, school closures, crowds and arrival counts | Source-attributed observations, measured Ping gauge and suggested actions; no invented official activity |
| High | Failed aerosol feed produced AOD 0.18 and a made-up range | Nullable unavailable state; column aerosol separated from surface PM and health claims |
| High | Missing air could support a safe verdict | Unknown-air caveat and watch floor |
| High | Stale, future or undated measured gauges could drive current risk and narratives | Verdict, story and twin share a three-hour freshness limit and five-minute future skew allowance |
| High | Wind in km/h multiplied by 3.6; daily rain mislabeled next 24 h; invalid forecast variable | Explicit units, UTC forecast windows, next 24 hourly rain intervals; duplicate PM call removed |
| High | Expired/undated Flood Hub forecasts treated as current | Recent issue time and active forecast interval required |
| High | Phone map 1,022 px wide inside 390 px screen | Width constrained to viewport |
| High | Desktop desk 4,575 px content clipped to 371 px, no scrolling; tablet desk absent | Scrollable desk; panel navigation available through tablet widths |
| High | Desktop verdict overlay covered map controls | Full reasoning placed above the news rail; map controls remain exposed |
| High | Dark theme used pale text on fixed white camera/map surfaces | Theme-aware camera and control surfaces; attribution retains explicit dark text on its light background |
| High | Arrival/outbound panels below a full-height map were inaccessible | Panels moved into the desk and mobile seat/arrival tab |
| High | Seven dialogs allowed keyboard focus behind the dialog | Initial focus, Tab/Shift+Tab containment, Escape, opener restoration and scroll lock |
| High | “1 MB limit” checked after unbounded buffering | Auth checked first; streaming byte cap and cancellation on every ingest path |
| High | Camera exposure changes created haze; repeated/frozen pictures padded calibration | Exposure-normalized features, known capture times, pixel fingerprints and six-hour expiry |
| Medium | Infrared decode, large images and repeated sensor comparisons distorted camera evidence | sRGB decode, infrared exclusion, 12 MiB/24 Mpx limits, time-matched non-suspect readings counted once per station/timestamp |
| Medium | Future/invalid relay times and rounded DustBoy age could appear fresh | Explicit future skew and actual elapsed-time limits |
| Medium | Repeated aircraft polls accumulated the same seats as new visitors | Point-in-time seat history replaces prior polls; Bangkok day/hour; visible carrier/registration labeling, including clock-strip seat estimates |
| Medium | Empty RFD/blank AERONET data appeared as measured zero | Source failure separated from a successful empty detection window; blank measurements omitted |
| Medium | Multilingual requests reused another selection's cache | Separate bounded caches keyed by canonical configured-country subsets |
| Medium | Caller abort ignored; Ask requests overlapped; HLS errors not subscribed | Cancellation forwarded, one active Ask request, actual fatal-error subscription |
| Medium | Emergency dial link concatenated two phone numbers | Number selected before punctuation is removed |
| Medium | CSS-hidden rails still mounted and polled on phones | Only active layout rails mount; measured river refreshes with core poll |
| Medium | Both large building meshes eagerly downloaded at every size | Phone starts in 2D; desktop loads active zoom mesh; optional mesh loads on demand |
| Medium | Release script missed routes, accepted a modified tree and skipped an imaginary graph route | Tree-derived inventory, all ingest denial probes, dirty-tree failure, complete river timestamp checks |
| Medium | CI did not check plain Node relay imports; build pipe could conceal failure | Node 22 relay-import step; explicit bash pipefail |
| Medium | Manual and Ask copy promised fixed camera/dataset counts and conflated river thresholds | Descriptions follow available catalogues and distinguish official critical levels from bank geometry |
| Medium | Reserve Worker reflected unescaped request/environment strings into HTML | Reflected values escaped; malicious-input regression |
| Medium | Observability had logs but no traces | Sampled traces enabled in both config sources; query strings redacted |

## Production observations before release (baseline — historical)

On 2 October 2026, all **38** discovered routes returned their intended status:
31 ordinary GET routes answered JSON; `aircraft` and `ask` answered 400 without
required parameters; five POST-only ingest routes answered 405 to GET and 401 to
unauthenticated POST. The measured river returned 43 gauges and catalogue context
128; every returned gauge carried a parseable observation time. These are
availability and authorization-denial probes, not full accuracy proofs.

A single bounded four-concurrent-probe run measured endpoint elapsed times from
23 ms to 12.3 s. Social was the slowest at 12.3 s; twin was 6.0 s. These are
one-run observations, not percentiles or a service-level objective. GDELT now has
a four-second timeout; whole-request cold-path latency still needs monitoring.

Browser inspection reproduced the desktop clipping and phone map overflow above.
The only captured browser warning was the shared terrain/hillshade source advisory.
No trace-capable DevTools tool was available: LCP, INP, CLS, memory, GPU and
battery claims are **not measured**. Responsive simulation is not a physical
Android or iPhone test.

Raw map assets: core buildings 11,878,961 bytes; wide buildings 11,166,715;
waterways 8,876,771. Production serves these with Brotli. Phone default now avoids
23,045,676 raw bytes of building geometry. This is avoided source data, not a
claim of equal wire-byte savings. Waterway geometry remains a material startup
cost. Font/chunk/terrain costs and device interaction still need a performance budget.

## Current verified state — re-checked 23:30 ICT, 2 October 2026

Everything in this block was measured directly against production after the
1.3.4 release, not copied from the audit's own claims.

| Property | Verified value |
| --- | --- |
| Deployed commit | `ebf8146872d48dcd18f43bd6ef14279c2ed36107`, built `2026-10-02T15:26:57Z` |
| Local `HEAD` / `origin/main` | Both identical to the deployed commit |
| Working tree | Clean — zero uncommitted, zero untracked files |
| Release gate | `verify-deploy.mjs --expect river-level` → **PASS, 38 routes** |
| Integrated suite | **487 tests in 51 files**, all passing |
| Types / lint | `tsc --noEmit` exit 0; eslint reports no errors and no warnings |
| `package.json` version | **1.3.4** |
| Dependency advisories | **9 nodes** (2 critical, 2 high, 5 moderate) — re-run, unchanged |
| Measured river | `provenance: live`, **43** Ping-basin gauges, 8 on the mainstem |
| Published river thresholds | **4** stations: P.1, BBU01, BBU02, BBU04 |
| Relay process | Running since 21:16:38; all five modules it imports are unmodified vs `HEAD` |

Two of these deserve emphasis because they close earlier risk rather than
merely restate a build number:

- **The "deployed but never committed" hazard is closed.** Production ran
  `5606843` while `origin/main` sat three commits behind and 67 `src/` files
  were uncommitted. Live, `HEAD` and `origin/main` are now the same commit
  with a clean tree, so a fresh clone reproduces what is running.
- **The relay is not stale.** It started at 21:16, before the 22:26 release
  commit, which would normally mean stale modules. Checking each module it
  actually imports (`haze-vision-core.ts`, `dustboy.ts`, `citizen-core.ts`,
  `haze-vision.mjs`, `citizen-reports.mjs`) shows all five unmodified against
  `HEAD`, so the running process holds current code. This was verified
  rather than assumed from a timestamp.

The river feed's provenance is `live` and its upstream rate-limit workaround
is holding; the edge throttle that forced a 30-minute failure cache earlier
is now routed through the relay's KV copy, so the board reads gauges without
requesting ThaiWater from shared edge IPs.

## Explicit release limits

- Vision and composite risk scores remain heuristics; no labeled-event accuracy,
  street-level flood detection, trained traffic detection or forecasting skill is established.
- Model/scenario/measurement distinctions are visible. The scenario flood API remains
  for illustrative use; its values cannot become measured evidence in story/verdict/RAG.
- ADS-B heading and carrier/registration country do not prove arrival, destination,
  passenger count or nationality. Seat-capacity estimates are labeled accordingly.
- Edge flight/arrival/seat history is bounded process memory, not a durable archive.
  Historic visitor files use UTC date keys; a Bangkok-day history migration is not included.
- ASMC remains unconfigured; upstream outages and unverified model gauges remain visible.
  A feed returning 200 can still be unavailable. Missing data does not mean no hazard.
- The relay remains a local process and single operational dependency. Camera URLs and
  redirects are trusted upstream inputs; byte/pixel limits do not enforce network egress.
- Fleet-wide WAF/rate-limit rules were not verified. Per-process caches and Cache-Control
  headers do not establish protection against distributed quota abuse.
- Enforced CSP remains disabled by the existing operator decision. Other security
  headers remain; this audit does not claim CSP protection.
- Dependency audit reports **9 vulnerable dependency nodes** (2 critical, 2 high,
  5 moderate). MapLibre's vulnerable popup sanitizer has no call site in reviewed app
  code; Happy DOM/Vitest are trusted test tooling; PostCSS and Miniflare/Undici paths
  are build/dev concerns. No exercised deployed exploit was identified. This is a
  scoped applicability assessment, not a clean dependency bill. Major upgrades were
  deferred to a tested compatibility migration.

## Verification and release procedure

Integrated suite: **450 tests passed in 43 files**. This includes ingest byte limits,
camera frame/sensor sampling, unknown-air handling, current-gauge boundaries,
forecast units/windows, cache isolation and dialog keyboard behavior. Plain Node
relay imports and a separate full TypeScript check passed. Full lint passed;
the final UI and label changes also passed focused lint. The final
`npm run build:cnx` passed compilation, lint, types, static generation and OpenNext
Worker packaging. `wrangler deploy --dry-run -c wrangler.cnx.jsonc` exited 0:
5,398.00 KiB uncompressed / 1,034.13 KiB gzip, 1,120 static asset files.
No Worker was uploaded; this does not prove remote binding values or deployed behavior.

Browser checks at 390 × 844, 1024 × 768 and 1280 × 720 confirmed phone map width
390 px, tablet panel navigation, measured gauges and public cameras on the Flood
tab, successful source-backed Ask results, and desktop desk scrolling to Ask.
The manual dialog trapped Tab, Escape closed it, focus returned to Manual and
body scrolling was restored. Mobile starts in 2D; a fresh desktop mount enables
3D. The relocated desktop verdict was verified inside the 280 px news rail,
with exposed map controls; clicking the 3D toggle changed its pressed state.
Corrected manual, Ask and carrier-clock copy were visible in the final rebuilt app.
Dark camera and inactive map-control surfaces computed as RGB(22,27,34) with
RGB(230,237,243) text; the light theme restored white surfaces and dark text.
No browser errors were captured; the shared terrain/hillshade source warning remains.
Final phone check again measured a 390 px map/document without horizontal overflow
and the 2D default. Evidence: [desktop light](audit/2026-10-02/desktop-light.jpg),
[desktop dark](audit/2026-10-02/desktop-dark.jpg),
[phone](audit/2026-10-02/phone.jpg).

Before the authorized release, `node scripts/verify-deploy.mjs --expect river-level`
failed on the modified working tree, as intended, despite matching production HEAD
and healthy route probes. It must pass after a committed release is pushed,
built and deployed: working tree clean, published `origin/main` equal to HEAD,
deployed build equal to HEAD, complete route probes and live measured river data.

After deploying, run the spatial gate as well:
`node scripts/cnx-spatial-check.mjs --theme dark --lang th` and again with
`--theme light --lang en`. It measures the live board at 390 × 844, 768 × 1024,
1024 × 900, 1366 × 640 and 1440 × 900, in the resting state and with the
evidence disclosure expanded, and exits 1 on a spatial defect. See the spatial
repair section below for what it checks and for the proof that it fires.

Use `npm test`, `npm run type-check`, `npm run lint`, `npm run test:relay`, and
`npm run build:cnx`. Review and commit the candidate before deployment. Build from
that clean commit, deploy the existing CNX Worker target, restart the launchd relay
so the imported vision code changes, then run the verification gate and observe a
new relay push. The restart is mandatory: changing relay source does not replace
modules already loaded by its running Node process. Deployment/relay changes were
not implied by the audit itself; the follow-up user request explicitly authorizes them.

## Comparative acceptance criteria

For each named alternative, use the same dates, locations, feeds and operator tasks:
find a current Ping measurement; distinguish unknown from calm; trace a PM value to
its source/time; identify an actionable hotspot; find a camera and its capture age;
retrieve a public dataset; complete each task on desktop and phone. Record time to
correct answer, error rate, provenance coverage, freshness, transferred bytes and
accessibility failures. Compare quality and operator outcomes before calling CNX
better, cleaner, more efficient or more effective.

## References used

- [Workers runtime / Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Workers traces](https://developers.cloudflare.com/workers/observability/traces/)
- [Web Vitals measurement guidance](https://web.dev/articles/vitals)
- [Dark-channel prior, He/Sun/Tang 2009](https://people.csail.mit.edu/kaiming/publications/cvpr09.pdf)
- Dependency advisory details are provided by `npm audit`; applicability above comes
  from local imports, call sites and runtime configuration, not package severity alone.


## Shipability, professional presentation and human use — follow-up

The follow-up starts from published and deployed `69125e9` (1.3.2), not the
unpushed baseline described above. Candidate version: **1.3.3**. This section
records the additional defects; the earlier audit remains a historical record.

| Priority | Reproduced issue | Candidate behavior |
| --- | --- | --- |
| High | Failed GISTDA request manufactured 11 µg/m³, AQI 49 and two freshly dated districts | Null readings, unknown severity, explicit unavailable provenance; no invented coverage; source observation time only when its timezone is known |
| High | Normal news padded actual results with 19 invented headlines and authoritative homepage links | Retrieved news only; empty list on failure; missing, malformed and future article dates excluded |
| High | Air-only alerts offered flood evacuation, power and pump tasks | Flood-specific checks require an active flood contribution; other states show verification, duty contact and location/time communication checks |
| Medium | Tourism led the desk; scenario water figures preceded measured gauges on phones | River measurements lead the desk and flood tab; mobile measurement shortcut; air tab opens first |
| Medium | Dense bilingual columns, SAFE label and raw score/evidence dominated the narrow summary | Stacked readable headline, no elevated signal wording, bilingual next step, explicit limitations, real expandable checklist and heuristic details |
| Medium | Signed bank deltas and negative headroom obscured threshold meaning; stale gauges looked current | Above/below bank and official critical levels stated separately; historical rows neutral and excluded from current grading; current actionable gauges first |
| Medium | Failed air/data refreshes stayed loading or silently retained results; no-match search displayed everything | Explicit failure/previous-reading states, retry, named search inputs and real no-match results |
| Medium | Ticker metrics were clipped by an undefined animation class, duplicated and inaccessible | One copy of each metric, keyboard-focusable horizontal scrolling; reachable snapshots labeled separately from live video |
| Medium | Missing focus indicators, small modal close targets and motion preferences | Visible keyboard focus, 44 px close controls and global reduced-motion support |
| Medium | Relay guard guessed missing extensions and did not actually syntax-check the relay entry | Exact native-Node import paths, syntax checks without execution, fixture regressions for nested/static/dynamic imports and distinct timeout errors |

Acceptance requires passing the integrated suite, lint, types, plain-Node relay
graph, production packaging and release identity gate. Browser checks cover
1280 px desktop and 390 px phone layouts, source/failure wording and reachable
controls. Physical Android/iPhone, assistive-technology user studies, Thai copy
review by local operators, labeled vision accuracy and measured interaction
performance remain unverified. The dependency and operational limits above
still apply. This is a scoped, improved release; no competitor superiority or
unconditional safety certification is claimed.

Follow-up local verification: **485 tests in 51 files passed**; full TypeScript,
full lint, diff whitespace check and plain-Node relay imports passed.

Live-browser follow-up found that an API cache could retain 1.3.2 payloads even
while the UI and origin API served 1.3.3. Version **1.3.4** isolates dashboard API
cache keys by the embedded release commit, preserving normal within-release
cache reuse and query filters. It also gives the desktop gauge list more room
and places expandable methodology after observations.

Cache-isolation follow-up: **487 tests in 51 files passed**, full lint and
TypeScript passed. Empty news now explicitly distinguishes missing coverage
from an absence of events.

## A second audit pass was started and lost

After 1.3.4 shipped, a further code audit was begun. It ran out of context
before it produced any output, and **its findings were not written to disk**.

Checked and confirmed, so this is not carried as a suspicion:

- `git status --porcelain --untracked-files=all` returns **zero** entries. The
  pass left no partial edits, no untracked scratch files, and no half-applied
  change. Nothing in this repository was lost.
- The session log for that run stops at 22:39; newer entries sit in an
  uncheckpointed SQLite write-ahead log, and the timeline table is empty. The
  findings existed only in the model's context window, which is gone.
- `docs/SHIP-AUDIT.md` — this file — was **not** updated by that pass. Its
  last write predates the 1.3.4 release, which is how the stale header
  described above went unnoticed.

Consequence to carry forward: **an audit that is never written down did not
happen.** The current-state table above was reconstructed from direct
measurement of production, not from that pass, so it should not be read as
its output. A rerun is required for any assurance the lost pass was going to
provide.

The one piece of residue that looked alarming was a recently-modified
`src/lib/cnx/verdict.ts`. It was not the audit's: it was a deliberate mutation
test that broke the air-quality floor, watched a test fail, and restored the
file. Verified byte-identical to `HEAD` by SHA-256. Recorded here because a
future reader running `find -mmin` will see the same timestamp and start the
same investigation.

## Spatial repair — 22–23 October 2026 (MSH)

The board's news rail had been reduced to a window onto its own headlines. The
verdict strip was a tall column living in a 220 px rail, and the headline
wrapped to seven lines at that width.

Measured on production (commit `eec7c02`, 22 October 2026), headless Chrome over
CDP, one screenshot and one box measurement per viewport so the picture and the
numbers cannot disagree:

| viewport | rail | verdict strip | fixed chrome | **news list** | articles |
|---|---|---|---|---|---|
| 1024 × 900 | 539 px | 273 px | 237 px | **30 px** (scrollHeight 2152) | 24 |
| 1366 × 640 | 516 px | 273 px | 237 px | **7 px** | 24 |
| 1440 × 900 | 776 px | 273 px | 237 px | **269 px** | 24 |
| 390 × 844 | no rail; the verdict sat inside a *closed* `<details>`, so the situation statement needed a tap to read | | | | |

The footer still counted 24 items. A 30 px window onto 2 152 px of headlines,
next to a count of 24, is a number right and a sentence wrong — a defect by
this board's own doctrine. At 640 px of window height the list was 7 px.

Two repairs were built and **rejected by an independent reviewer**, and the
rejections are recorded because they are the design:

1. Moving the verdict out of the rail at tablet width — hid earned content,
   added an unearned band, left the identical defect at ≥1280, and made the
   rail a second news home.
2. Floating the verdict as a card on the map — this reinstates the High
   defect in the table above ("Desktop verdict overlay covered map controls"),
   which this board has already paid for once. Measured, it covered ~15 % of
   the map and collided with CNXMap's own layer control.

What shipped (commits `63d4486`, `c8d73bf`, `e3abc3b`, `af9fa20`):

- The province verdict is a **full-width band above the board**, not a column
  and not an overlay: the level, the provenance and the headline are always
  visible, and the headline is one or two lines wide instead of seven.
- The **news rail carries only the news it is named for**, and its list keeps a
  200 px floor, so the column cannot be squeezed back into a window.
- The reasoning (observations, evidence gaps, next step, the province and the
  DDPM/EMS line) is **one click away** in a panel that opens on screen and
  covers none of the map's controls. The panel is anchored to the band, not to
  the disclosure: at 390 px the summary wraps to a second line, and a panel
  anchored to it opened at x = −180 — half of every line off-screen.

An independent review of the first shipped version returned **DO NOT SHIP** with
six named defects: D1 the panel half off-screen at 390 px; D2 the panel covering
the map's own controls; D3 the 390 px band squeezing the headline into a
75 × 125 px ribbon; D4 the new `<summary>` missing the app's focus ring;
D5 a test that could no longer prove the reasoning was visible and asserted
nothing about the band appearing once; D6 (accepted) the map losing 61 px at
≥1280 px. D1–D5 were repaired against the reviewer's measurements, not against
opinion.

Measured on production after the repair (both themes, Thai and English):

| viewport | band | headline | news list | evidence panel | panel on map controls |
|---|---|---|---|---|---|
| 390 × 844 | 390 × 142 @ (0,137) | 362 × 54 | rail not mounted | 358 × 189 @ (32,362) — fully on screen | 0 |
| 768 × 1024 | 768 × 89 @ (0,86) | 270 × 72 | rail not mounted | 544 × 135 @ (224,258) — fully on screen | 0 |
| 1024 × 900 | 1024 × 61 @ (0,86) | 526 × 36 | **303 px** (24 items) | 544 × 135 @ (480,230) — fully on screen | 0 |
| 1366 × 640 | 1366 × 61 @ (0,86) | 868 × 36 | **219 px** (24 items) | 544 × 135 @ (822,230) — fully on screen | 0 |
| 1440 × 900 | 1440 × 61 @ (0,86) | 942 × 36 | **479 px** (24 items) | 544 × 135 @ (896,230) — fully on screen | 0 |

The band appears exactly once at every viewport. The map's loss is 61 px at
≥1280 px and nothing below it: at 1024 px the map keeps its `60dvh` height
either way.

The panel's clearance from the map's control row is declared once, as
`--cnx-map-control-clear` in `src/app/globals.css`, with its derivation: the
map's flight badge sits at `top-2` (26 px) and the symbol key at `top-10`
(38 px), so the control row ends 78 px below the map's top edge, and the panel
keeps 16 px from it. The first version of this repair cleared the symbol key
by 4 px — non-overlapping, but only by arithmetic; one taller key or one
wrapped label would have put the panel back on top of a map control.

### The gate

`scripts/cnx-spatial-check.mjs` is the board's spatial gate. It loads the
board once and resizes it, measures the resting board and the board with the
evidence disclosure expanded, and fails on: the band appearing more than once
or not above the board, the panel opening off-screen, the panel covering any
map control (told apart from the map canvas by z-index), the news list losing
its 200 px window, and text that exists but cannot be read.

The gate ships with the proof that it fires:

- `--inject-fault d1` re-creates the panel anchored to the summary. It opens at
  x = −180 … 178 — exactly as it did — and the gate exits 1.
- `--inject-fault d2` removes the clearance. The panel covers the flight badge
  (78 × 26) and the symbol key (150 × 38), and the gate exits 1.

Two false positives were withdrawn after being measured rather than assumed:
screen-reader-only `.sr-only` spans, and the phone tab strip, which is itself
a horizontal scroller and does scroll to its end. A gate that reports a defect
that is not there is a gate nobody trusts.

The gate is part of the release procedure below: run it after deploying and
before calling a layout change done.

### Second review round — 23 October 2026

An independent review of the shipped board returned **DO NOT SHIP**, with one
blocking defect and four smaller ones. All five were repaired against the
reviewer's measurements.

**F1 (High) — the open evidence panel covered the map's Layers control.**
The clearance token encoded the **closed** control row (78 px), but the
map's Layers `<details>` opens to 264 px wide over the map's left column.
With the panel open and Layers open, the panel covered **95.4 % of the
basemap `<select>`** at 390 × 844 and 14.7 % at 768 × 1024 — the same defect
class this board already paid for once, reached through a different door.

The two are now **exclusive overlays**: opening one closes the other, so the
map's controls are never under the panel whichever one the reader opens
first. The agreement lives in `src/lib/cnx/exclusive-overlay.ts` and is made
on the document, because the band's `<details>` and the dynamically loaded map
are in different trees.

**F2 (Medium) — the 768 px English headline was a ribbon.** 212 × 107 px,
six lines, while the chip and provenance took 360 px of the band. The band
now stacks below `lg` rather than below `sm`, so 640–1279 gets a full-width
headline: 732 × 36 px at 768, one line.

**F3 (Low) — the Thai level chip was set in a Latin-only face.** The chip is
`font-mono`, and IBM Plex Mono carries no Thai, so the Thai level fell
through to the platform fallback (Ayuthaya on macOS) instead of the board's
IBM Plex Sans Thai. The mono stack now names the Thai face: Latin stays in
Plex Mono, Thai moves to the board's own face.

**F4 (Low) — the gate could not see F1.** It collected the map's controls but
never opened the Layers control, and `panelHits.length === 0` would have
passed on an empty control list. It now opens the Layers control in both
orders, asserts the control list was non-empty, counts the headline's
wrapped lines, and compares the count the rail states with the items it
holds.

**F5 (Info) — the clearance arithmetic was 2 px optimistic.** The band and the
map each carry a 1 px border, so a 96 px offset measures as a 16 px gap.

#### The measurement trap behind F4

While proving the gate could see F1, the gate reported the overlap on a board
that had already been fixed — and the numbers were exactly the old F1
numbers, down to the pixel.

The cause: **a closed `<details>` hides its content through
`::details-content` with `content-visibility: hidden`, which implies paint
containment.** The panel still has a layout box, and while the disclosure is
closed that box is laid out against the disclosure's own content box — x =
−180 at a 390 px viewport — not against the band. None of it is painted.

`getBoundingClientRect()` reports **layout, not painting**. The gate was
comparing a box nothing can see against a `<select>` a reader can see, and
calling that an overlap. The gate now hit-tests the panel's centre with
`elementFromPoint` and only counts an overlap against something that is
actually painted.

This is the same class as the withdrawn false positives earlier in this
repair: the screen-reader-only spans, the phone tab strip that scrolls, the
map attribution that is fully legible. **A defect class that has been
"measured" is not a defect until the measurement is shown to be of the thing
that was claimed.**

---

## Temple compounds — 23 October 2026

### What was wrong

The 3D city layer extruded every `amenity=place_of_worship` polygon as one
gold block. For a shrine that is right. For Wat Chedi Luang it was not: the
mapped boundary is **49,525 m²** and OSM maps **41 separate buildings**
inside it — the stupa (3,354 m²), the Pra Wihan Luang (1,446 m²), the
monastic cells, the school. One slab crushed all of that into a rectangle.

The block said nothing. A block has no wall, no gate, no courtyard, no tower,
no order. It asserted a mass of gold where a compound stands, and the
operator was asked to read a wat from it.

### What the data actually holds

Measured across all **474** mapped places of worship in the urban bbox:

| | count |
|---|---|
| Compound-scale boundaries (≥ 1,200 m²) | 292 |
| …of those, with real OSM building footprints inside | 175 |
| Single buildings (a shrine, not a compound) | 182 |
| Mapped buildings inside compounds, in total | 1,000+ |

So most compounds *do* have real interiors. The defect was that the layer
never used them.

### The grammar

A walled temple compound is not a set of buildings, it is an order — and the
order a Lanna wat and a **northern Chinese** Buddhist temple share is the
same one, which is why the Chinese form is a usable reference for a Thai
one:

- a walled enclosure, with one gate on the central axis;
- the gate on the **south** end, so the compound faces its approach;
- a **courtyard** on the axis between gate and hall;
- the **main hall** at the north end of that axis — the widest, tallest thing
  in the compound;
- **flanking side halls** either side of it;
- a **tower** — a pagoda in the Chinese case, a chedi in the Lanna case —
  standing in the courtyard where the gate sees it.

That is the grammar in `src/lib/cnx/temple-compound.ts`, and the baked output
is `public/data/cnx/temple-compounds.geojson` (5,529 parts: 1,866 measured,
3,663 modelled).

Two places the grammar had to be given a judgement call, both recorded as
choices rather than facts:

- **Which end is the gate.** South, as both traditions agree — except on an
  east–west compound, where "south" is not an end of the axis at all and the
  axis direction's north component is noise. There the tie is broken by the
  city: the gate goes at the end nearest town.
- **Which tower.** A stupa goes only where a stupa belongs. A church or a
  mosque gets its mapped buildings and no tower, because the grammar must not
  assert a faith the site does not have. An **untagged** site does get one:
  an absent tag is not an absent religion.

### What is measured and what is modelled

Every part carries its own provenance, and the map styles the two apart so
the difference is visible without opening a panel:

| field | values | meaning |
|---|---|---|
| `origin` | `measured` / `model` | is the SHAPE an OSM footprint, or the grammar's placement? |
| `height_source` | `osm` / `fallback` / `grammar` | where did the HEIGHT come from? |
| `evidence` | `osm-footprints` / `osm-boundary-only` / `single-footprint` | how much of this compound is real? |

The third is the one that surprised the bake. Only **12** of 1,866 measured
parts carry a mapped height; the rest take the extract's 9 m default, because
OSM tags a footprint but rarely its height. That is a real limit of the data,
so it is declared rather than smoothed over.

A mapped stupa has its own trap: OSM often tags the **plinth** height
(Wat Chedi Luang's stupa carries `height=3` for a tower that stands sixty).
So a mapped chedi's footprint is measured and the mass above it is the
grammar's — the base is one colour, the tiers above it another.

### The four defects that only rendering could find

The grammar was unit-tested before it was drawn, and the unit tests passed.
Four defects were found only by rendering the compounds and **looking** at
them:

1. **Every temple became a compound.** The mean latitude was read as `p[1]`
   off an `{x, y}` object, so it was `NaN`, so the area was `NaN` — and
   `NaN < threshold` is **false**. All 474 temples passed the area test,
   including the 182 shrines that are single buildings. The fix is a
   `Number.isFinite` guard on the area: a measurement that is not a number is
   not a small measurement, it is no measurement.
2. **4,198 of 4,380 rings were malformed.** `closeRing` was handed lon/lat
   tuples where it expected `{x, y}` vectors, so every ring's last point
   serialised as `{}`. GeoJSON consumers must reject that, and the map would
   have silently dropped the layer.
3. **The wall was a slab.** It filled the very courtyard it was supposed to
   enclose. It is now a band — one polygon with a hole.
4. **The mapped interiors were dropped.** The grammar kept the hall and the
   two flanks and threw away the rest, so Wat Chedi Luang's 41 buildings
   became three gold boxes on a cream rectangle — the same spatial
   hallucination as the slab, smaller.

Each of the first three now has a test. The fourth is pinned by a test that
counts the mapped buildings the grammar must keep.

### Assets and licences

Nothing was downloaded. The compound is generated from OpenStreetMap
footprints under ODbL by code in this repository, so it carries no
third-party asset licence, no attribution obligation beyond the ODbL notice
the board already shows, and — the reason this route was taken rather than a
CC0 kit or a photogrammetry scan — no exposure to CC BY-NC or NoAI terms
that a commercial deployment could not accept.

A CC0 modular temple kit was the obvious alternative and remains the right
call if the layer ever moves from MapLibre's fill-extrusion to real 3D
geometry: it would need GLB conversion, instancing, and a texture budget the
current renderer has no place for. The grammar is the cheaper path to the
same reading, and it is honest about which parts are survey.

### A defect the temple compounds exposed: the map card was never reachable

The compound's provenance is only useful if an operator can open it, and
the card would not open — no card, on any layer, at any point of the map.

The cause is structural. deck.gl's event-root `<div>` sits **on top of** the
MapLibre canvas, so a click lands on deck.gl, which does its own picking and
stops there. MapLibre's `map.on("click", layerId, …)` never fires. The
measured evidence: `document.elementFromPoint` over the map returns
`DIV#view-default-view`, and a click on any of three points on the map left
the DOM with exactly two `aside[aria-label]` elements — the news rail and the
operations desk — and no building card.

This is **pre-existing**, and it is not specific to the compounds: the
"3D building details" card the board has carried for months was unreachable
too. It was found only because the compound layer made the card load-bearing.

The fix does not depend on which element received the click. The pick is
done with `map.queryRenderedFeatures` at the cursor's position in the map's
own canvas coordinates, on the map's root element, with a guard that ignores
clicks that did not land on a canvas. A geometry query is indifferent to the
event target, so the card opens whichever layer the click fell on.

### What was verified, and what was not

**Verified.**

- the grammar by unit test (14 cases) and the baked file by fixture test (no
  non-finite coordinate, every ring closed, every ring `[lon, lat]`, every
  one of the 474 mapped temples present, every part declaring its provenance);
- the compound geometry by rendering it in plan and isometric and **looking**
  at it — which is how all four grammar defects were found;
- the layer on the **live board**: the compounds render as gold halls with
  dark roof caps inside a pale courtyard, bounded by the wall, and they are
  distinguishable from the grey city at city zoom (screenshots taken from
  the deployed worker);
- the board's own gates on the deployed board: the spatial gate passes at
  **5 viewports / 86 checks** (dark, Thai) and **5 viewports / 81 checks**
  (light, English), and the release gate passes at **51 routes** with the
  release identity verified;
- the full suite (129 files / 1,278 tests), the type check, and the lint.

**Not verified.**

- the provenance card's appearance on the live board, at the moment of
  writing — the picking fix that makes it reachable had just been built;
- a real touch device, and the card's behaviour under a long-press;
- the seam where a mapped building exists in BOTH the compound layer and the
  generic city-block layer. The compound is lifted 0.3 m and drawn at 0.97
  opacity so the two faces are not coplanar, and the compound wins the
  depth test — but the bleed-through has not been measured at pixel level;
- the compound layer's read at every zoom between the city scale and the
  street scale. It has been looked at at city zoom and at the zoom where a
  single compound fills the frame, and at nothing in between.

## Roofs — 24–25 October 2026

### What was wrong

The 3D city was a field of boxes. MapLibre's `fill-extrusion` extrudes a
plan shape straight up, so every building in Chiang Mai was a rectangular
prism with a flat top — and from the air that reads exactly like the
satellite image the footprints came from. A box says "there is a building
of this size here" and nothing else. The temple compounds had the same
problem one level down: their halls were gold boxes with a thin slab on
top, not the steep gable of a Lanna ubosot.

### What the data actually holds

Measured over the Old City sample (18.78–18.80 N, 98.97–99.00 E) with
Overpass on 24 October 2026:

| tag | buildings | share |
|---|---|---|
| any building | 8,914 | — |
| `roof:shape` | 9 | 0.10 % |
| `roof:height` | 0 | 0 % |
| `roof:colour` | 5 | 0.06 % |
| `roof:material` | 1 | 0.01 % |
| any roof tag | 23 | 0.26 % |

So the roof **form** cannot be read off the map. It has to be modelled, and
the board says so wherever the roofs are drawn.

### The rule, and where it came from

The rule is borrowed from the QGIS **3D OSM Model** plugin, which moved
away from "a pyramid roof on every block" for exactly this reason —
house-like types get a pitched gable, everything else a flat roof, "which
reads far more like a real city". The rule here:

| the building is | its roof |
|---|---|
| house-like (`house`, `detached`, `terrace`, `dormitory`, `hut`, …) | gable |
| plainly not a house (`apartments`, `commercial`, `industrial`, `hotel`, …) | flat |
| untagged, small and low | gable |
| untagged, over 500 m² | flat |
| any type, more than 3 storeys | flat |

The result over the whole city: **61,257 roofs — 81.4 % gable, 18.6 %
flat.** The city is a tiled town with a few concrete blocks in it, which is
what Chiang Mai is.

### The height is not invented

OSM's `height` is the total, roof included. So the roof is carved **out**
of it: the wall is `height − roof_rise` and the roof's top lands back on
`height`. The number the board reports is the number the data gave. The
bake writes `roof_rise` onto each building feature and the map's
fill-extrusion subtracts it; nothing is added to a building's height that
the data did not say.

For the temple compounds the same rule applies to the mapped halls: a hall
whose OSM height is 9 m gets a 9 m building, wall and roof together.

### How it is drawn, and why a custom layer

A gable is a slope, and MapLibre's `fill-extrusion` cannot make a slope.
deck.gl can, but the board's deck.gl runs in its own canvas over the map:
its roofs would never depth-interleave with MapLibre's own extrusions, and
a roof behind a building would draw on top of it.

So the roofs are a **MapLibre custom layer** (`src/lib/cnx/roof-layer.ts`),
which draws into the map's own WebGL context and therefore shares its
depth buffer. The roof sits on the wall, and a wall in front of a roof
hides it. The layer instances two meshes — a gable prism (two slopes, two
gable ends) and a flat cap slab — over the whole city in two draw calls.

**No third-party asset is used.** The geometry is generated in-repo from
OpenStreetMap footprints (ODbL), so there is no asset licence to carry
and no CC BY-NC or NoAI exposure. The only borrowed thing is the *rule*
above, which is an idea, not a file.

### The shapes

Each roof is built on the **minimum-area rectangle** that contains the
footprint — the tightest rectangle that still covers it, which carries
both the ridge direction and the span in one pass. The ridge runs along
the long side, the way an ubosot's does. Measured over the Old City:
the median ratio of rectangle area to footprint area is **1.00**; 4 % of
buildings exceed 1.5× and 0.7 % exceed 2×. Those are the ones whose roof
visibly overhangs its walls, and they are the price of a rectangle.

Temple roofs are the grammar's: a steep gable over the hall, a shallower
one over each side hall, a small one over the gate, and for a hall with
no mapped footprint a second, receding tier — the stepped roof a Lanna
hall actually has.

### What was verified, and what was not

**Verified.**

- the roof grammar by unit test (18 cases: the rectangle, the bearings,
  the rule, the carving, and the refusals);
- the baked tables by fixture test (every row finite, every roof sized
  and placed, a roof for every building and every compound, both kinds
  present, the gable share between 70 % and 95 %);
- the renderer by **rendering it and looking at it** — in an isolated
  harness with the real data, at city scale and at close range, which is
  how the first three attempts were caught (a metres↔mercator scale that
  was out by 2π, a height that was not converted into mercator units, and
  derivative-based face normals that were numerically noise);
- the temple grammar by unit test (15 cases) and the baked compounds by
  fixture test.

**Not verified.**

- the roofs on the **live** board at the moment of writing — the layer is
  built and wired, and the first live capture was still to come;
- how the roofs read against the board's own dark and light themes; the
  roof palette is currently fixed rather than themed;
- performance with all 59,344 city roofs instanced at once. The city
  roofs are drawn in the same group split as the city blocks (core above
  zoom 13, fringe below), so at most one of the two is in the buffer at a
  time, but the worst case has not been measured on the software renderer
  the gates use;
- a real touch device, and the roofs under a long-press.
