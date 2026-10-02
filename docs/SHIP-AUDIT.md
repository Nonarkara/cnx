# CNX release audit — 2 October 2026

## Verdict

Audit complete: **29 defect groups repaired**, integrated tests and final
production packaging passed. This is a validated local release candidate with
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

## Production observations before release

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
