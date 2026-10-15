# Off-Mac relay standby

The Mac remains the primary collector. The one-shot standby in `scripts/relay-standby.mjs` covers measured rainfall and river gauges; it uses the same public ThaiWater sources and existing authenticated ingest validators. Banding, observation-time filtering and verdicts remain on the Worker.

## Safety contract

- `probe`: fetch the public sources, print row counts, never read a secret or write production data.
- `standby`: read the existing public manifest. Check each feed's **collection** timestamp, not gauge observation time or the newest unrelated flight push. Skip feeds collected within 20 minutes. Refuse an unverifiable or more than ten-minute-old manifest.
- `drill`: manually exercise the takeover path with real current readings even while the primary runs. No invented measurements or historical re-stamping.
- Fixed HTTPS ingest destinations, redirects rejected, bounded response sizes and 20-second request timeouts. No dependency install or retry loops. A newer primary copy seen by the existing replay guard produces a harmless 409. KV is eventually consistent; this is not an atomic cross-runner lock.
- Scheduled runner has repository read permission only. Actions are pinned; checkout credentials are not persisted. Credentialed execution is restricted to `main`, with the ingest secret scoped to the push step.

## Operating limits

This is **best-effort standby**, not guaranteed high availability. GitHub schedules can be delayed or dropped, and scheduled workflows in public repositories are disabled after 60 days without repository activity. A nominal ten-minute schedule and a 20-minute takeover threshold do not guarantee a 30-minute recovery bound. Failed runs must be investigated; no successful process exit proves that upstream observations themselves are current.

Flights, arrivals, news, citizen reports, dam collection and local camera inference are outside this initial standby scope. Their existing unavailable/stale states still apply. The Mac's watchdog and launchd collectors remain in place.

Reference: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

## Validation

Local regressions cover per-feed health selection, invalid/future/missing stamps, refusal of stale manifests, healthy-primary skipping, missing credentials, read-only probing, real payload construction, redirect protection, HTTP failure without retries, empty results, bounded bodies and replay races. Hosted-run evidence is recorded after the independent probe and takeover drill.

Hosted connectivity probe, 15 October 2026: [run 38768626362](https://github.com/Nonarkara/cnx/actions/runs/38768626362) succeeded from a GitHub-hosted Ubuntu runner, reading 350 rainfall rows and 48 raw river rows without credentials or writes. This verifies that this independent network could reach ThaiWater at the time of the probe.

The scheduled workflow checks at UTC minutes 7, 17, 27, 37, 47 and 57. Manual modes are available from the workflow's Run workflow menu on `main`. `probe` is the default and is read-only; `drill` writes genuine current source readings and should be used deliberately. The existing ingest credential is held as an encrypted Actions secret, never in the checkout. [Run history](https://github.com/Nonarkara/cnx/actions/workflows/relay-standby.yml) contains skip, push and failure evidence. Disabling that workflow stops the standby without affecting the Mac collector.
