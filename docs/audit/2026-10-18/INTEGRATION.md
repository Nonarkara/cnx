# Coordinated release audit · 18 October 2026

Baseline: `0010b27` on local main, origin/main and production. Initial dirty work was limited to the symbol legend and its tests; retained and integrated. No unrelated project service was stopped.

## Reconciliation

- PR #2 (`86f71e5`): select portable setup and secret/snapshot ignore improvements. Preserve current dependency versions, MapLibre worker-copy hooks and relay import checks. The old PR’s test/build report is historical evidence only. Blanket merge would regress newer changes.
- PR #4 (`1978fdc`): retain clear wind/rain wording and compatible legend fixes. Preserve newer open wind arrowheads and lower particle count; do not restore ambiguous dense trails.
- The only commits reachable outside main were those two PR heads. No hidden local ahead branch was found by that inventory. The two PRs are superseded selectively, not represented as blanket merged.

## Verified defects addressed

- Unknown river thresholds count as missing evidence; cannot yield an all-clear aggregate.
- Retained dam and Flood Hub rows re-age at the current decision time. Expired records cannot sustain calm or elevated summaries.
- Flat camera scenes cannot classify as clear or calibrate the visual baseline. They remain unassessable; no causal claim about fog versus obstruction is inferred.
- Haze agreement requires three independent station IDs within three hours for a corroborated varied-event window. Scorer version 3 rebuilds agreement evidence; this is not detection validation.
- Credentialed camera ingest rejects redirects.
- No assessable camera views produces a dash with an explicit unassessable count.
- Brief tiles open the correct evidence desk and close the brief first, preserving focus handoff on desktop and mobile.
- Closed symbol legend fits its text; Thai and English distinguish wind arrows from the model rain wash.

## SIC

See `docs/SIC-47-APP-REVIEW.md` and the compact About credits. 47 dated references, 46 historically inspected, one unopened. Three patterns have concrete improvements in this audit. Other entries are existing alignment or references, not invented adoption. The corpus includes official/research services and community apps; AI construction and comparative superiority were not established. No third-party code or data copied.

## Operational limits

At 14:57 UTC the primary relay and critical rain/river feeds were fresh. Camera audit found nine catalogued cameras, one reachable fresh monochrome scene and zero usable scored views. Haze association covered low PM2.5 only and was not a detection-accuracy result. Public camera coverage remains inadequate for citywide flood detection.

The off-Mac GitHub Actions standby has a ten-minute schedule, but observed runs on 18 October were about four hours apart (00:49, 05:12, 09:35, 13:30 UTC). Creation and start times matched; delays occurred before jobs existed. A successful manual drill and green skipped runs do not prove scheduled recovery. Provider cause is not established. Rain’s one-hour and river’s 45-minute collection budgets can be exceeded before scheduled takeover. An independently scheduled always-on collector remains a release limitation; do not claim a guaranteed 20-minute recovery or full Mac independence.

## Validation

Focused regressions were reproduced before fixes. Full release, browser and deployed gates are recorded in `RELEASE-EVIDENCE.md` after execution.

## Dependency boundary found during release review

The initial production dependency audit reported five affected dependency nodes (four high, one moderate). This count is not five demonstrated exploits. The active Mac relay decodes upstream image bytes with Sharp; its vulnerable librsvg dependency therefore cannot be dismissed as development-only. Sharp is patched from 0.35.4 to 0.35.5 and classified as a runtime dependency. Next.js is patched from 15.5.25 to 15.5.27. Overrides use patched PostCSS for Next and the patched Sharp line throughout the tree, retaining Wrangler 4.147 rather than broadly upgrading the toolchain. Final installed versions, audit results and build/import verification belong in the release evidence.

The remaining full-audit findings are the ESLint → fast-glob/micromatch → braces development-tool chain (deep-pattern stack exhaustion). Registry latest braces 3.0.3 remains within the advisory range; no compatible released patch exists. Repository-controlled lint globs are not an inspected public request path. This is a scoped risk assessment, not a clean bill for all tooling.

Final cross-review also closed partial river-threshold coverage: a calm gradable subset cannot clear other current gauges that lack thresholds. The line names graded/current counts, the aggregate retains the evidence gap, and genuine known watch/critical signals still lead. Published critical thresholds are described as thresholds rather than assumed bank levels.
