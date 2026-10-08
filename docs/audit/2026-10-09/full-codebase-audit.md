# CNX full codebase audit — 9 October 2026

> Prepared ahead of the governor demonstration on Saturday 10 October.
> All audit actions were read-only: no code modified, no deployment, no
> relay restart, no dependency upgrade, no KV writes.

## Audited state

| Item | Value |
|---|---|
| Branch | `codex/governor-frontend-audit` |
| Local HEAD | `7135f43` (v1.8.2, working tree clean) |
| `origin/main` | `0a2ed91` — also the **deployed** commit |
| Local vs published | 2 commits ahead, unpushed (`9b229b9`, `7135f43`) |
| Live site | https://cnx.nonarkara.org — all 27 public routes 200 JSON |

## Verification results (run today)

| Gate | Result |
|---|---|
| `npm run type-check` (`next typegen && tsc --noEmit`) | **PASS** |
| `npm test` (vitest) | **PASS — 635 tests, 68 files, 61s** |
| `npm run test:relay` (relay import graph) | **PASS** |
| `npx eslint src` (scoped) | **PASS — 0 errors, 0 warnings** |
| `npm run lint` (as scripted) | **FAIL — ~977 errors, all from a stale worktree, none from src** (see L1) |
| `node scripts/verify-deploy.mjs` (live production) | 27/27 routes OK; every ingest endpoint denies unauthenticated writes (401/405). **2 identity FAILs**: deployed `0a2ed91` ≠ local HEAD `7135f43` |
| `npm audit` | 14 advisories (2 critical — both dev-only); assessment below |

The two verify-deploy failures are release-identity checks, not functional
defects: production is healthy, but the two newest governor-frontend
commits (`9b229b9` evidence paths, `7135f43` fire-evidence alignment) exist
only locally. The project's own release gate (SHIP-AUDIT.md) requires
`origin/main` == local == deployed before a release is claimed.

## Security verdict

**Zero critical, zero high code findings.**

- **Secrets**: no secrets in git — current or historical. `git log --all -S`
  for both live relay values across all 134 commits: zero hits. Live
  credentials live only in `scripts/relay-flights.env` (mode 0600,
  gitignored). No `.pem`/`.key`/`.dev.vars` anywhere.
- **Ingest surface**: all 7 POST ingest routes (flights, arrivals, citizen,
  haze-vision, rain, river-level, social) check `x-relay-secret` against
  server-only `CNX_FLIGHTS_RELAY_SECRET` in constant time
  (`relay-kv.ts:15-27`), 503 when unset, 401 on mismatch; payloads are
  capped at 1 MB (`relay-kv.ts:38-69`) and shape-validated with 422 on
  bad payloads. Verified against production today: every ingest route
  returns 401/405 unauthenticated.
- **XSS**: zero sinks — no `dangerouslySetInnerHTML`/`innerHTML`/`eval` in
  non-test code; external text renders only through React text nodes; all
  `<a href>` paths protocol-gated (`safeLink`, `isHttpsUrl`, `^https?://`).
- **SSRF**: none — the only request-derived fetches are icao24 hex-validated
  against a fixed host (`aircraft/route.ts:33-37`), burnscar tiles bound to
  a fixed host with integer/zoom/layer whitelists (`burnscar.ts:25-32`),
  and social countries intersected with a fixed 8-feed allowlist.
- **Client exposure**: `NEXT_PUBLIC_*` only carries public build metadata;
  server secrets (`FIRMS_MAP_KEY`, OpenSky OAuth, `CNX_FLOODHUB_KEY`,
  `ASMC_API_KEY`) appear only in server modules; all component imports of
  those modules are `import type`. Neither live secret value appears in
  `.open-next`, `.next`, or `public` build output.
- **Headers**: HSTS preload, `nosniff`, `X-Frame-Options: DENY`,
  Referrer-Policy, Permissions-Policy (`middleware.ts:10-15`, `public/_headers`).
- **Ask chatbot**: no LLM, no upstream keys — pure TF-IDF retrieval over a
  local corpus (`rag.ts:283-301`); query validated 2–500 chars, `no-store`.
- **Upstream quotas**: every external-fetch route has edge `s-maxage` cache
  (fires 300, fires-rfd 600, air-quality 240, social 120, river-level 600,
  aeronet 3600, dustboy 600, jaxa-aot 1800, asmc 1800, …) plus in-process
  TTL caches; failures cached longer than successes.

### Security findings (medium/low)

| Sev | Finding | Location | Note |
|---|---|---|---|
| Med | No CSP — deliberate, documented 2026-09-28 | `middleware.ts:7-9` | Zero XSS sinks today, so defense-in-depth only; a real CSP needs per-request nonces |
| Med | Single shared relay secret in one local env file | `scripts/relay-flights.env` | Not a git problem; machine-compromise couples ingest surface + OpenSky account |
| Med | `/api/cnx/aircraft` cache-key-per-query could burn OpenSky credits | `aircraft/route.ts:36-41` | Currently defused — OpenSky unreachable from Cloudflare egress; route fails soft to `{aircraft: []}` |
| Low | `X-XSS-Protection` obsolete header | `middleware.ts:15` | No-op in modern browsers |
| Low | Social/ask outbound links allow `http:` (downgrade only) | `social.ts:64,242` | `javascript:` and other schemes blocked |
| Low | Unauthenticated `visitors` GET appends KV rows | `visitors/route.ts:61` | Bounded: edge cache 30s, 200 rows/bucket, 7-day TTL — nuisance only |
| Low | Relay log world-readable at `/tmp` | `...plist:21-23` | Logs contain status codes only, never secrets |
| Low | No per-client rate limiting | all routes | Edge `s-maxage` is the only throttle; acceptable on Workers |

## Dependency advisories (deployment-context assessment)

`npm audit`: 14 total — 2 critical, 10 high, 2 moderate. **None is a
runtime-critical exposure for this deployment:**

| Advisory | Sev | Chain | Context here |
|---|---|---|---|
| tinypool prototype-pollution RCE (×2) | critical | vitest (dev) | Dev tooling only; fix = vitest 5 (breaking) |
| postcss (×4: XSS/`sourceMappingURL` file read) | high | nested in `next` | Build-time tool; fix via `npm audit fix` (non-breaking) |
| sharp / librsvg CVE-2026-96889 | high | miniflare→wrangler, devDep | Dev/emulator only |
| source-map-js event-loop DoS | high | dev chain | Dev tooling |
| braces stack exhaustion | high | eslint chain (dev) | Dev tooling |
| **next SSG/ISR cache poisoning (×2)** | moderate | `next ^15.1.6` | **Mitigated here**: all 42 routes are `force-dynamic`, no SSG/ISR pages, deployed via OpenNext on Workers. Patched 15.x available via `npm audit fix` |
| @vitest/mocker path traversal | moderate | vitest (dev) | Dev only |

Recommended before Saturday: `npm audit fix` (non-breaking: next/postcss/
sharp/source-map-js). The vitest→5 upgrade is breaking and can wait.

## Architecture & code quality

**Strengths (verified, not claimed):**

- **Honesty discipline enforced end-to-end** — provenance labels
  ("live"/"scenario"/"unavailable"/"mixed") flow from types
  (`types/cnx.ts:68-91`) through the verdict engine (`verdict.ts:617-624`
  refuses to certify "safe" on blind axes) to pixels (AirQualityPanel
  provenance notes, DataAge "no observation" not "0m", GovernorBrief
  "ไม่มีข้อมูล" tiles, scenario fires excluded from hotspots
  `CNXApp.tsx:409`).
- **Zero lint debt**: 0 TODO/FIXME/HACK, 0 `console.log`, 0 explicit
  `any`, 0 `@ts-ignore` in ~157 non-test files.
- **Accessibility above average**: focus-trapped modals via shared lib,
  44px targets, `aria-pressed` toggles, alt text on all images,
  keyboard-shortcut guards.
- **Route consistency**: 41/42 GET routes share identical
  `force-dynamic` + `revalidate = 0` + tuned `Cache-Control`; ingest fully
  centralized through `ingestRelayJson` with uniform 400/401/413/422/500/503.
- **Tests target the right things** (635): honesty regressions
  (`verdict-measured`, `social-truth`, `flood-provenance`, `dustboy-suspect`),
  relay import graph, deploy checks, baked-GeoJSON fixtures.

**Major code findings:**

| # | Location | Finding |
|---|---|---|
| 1 | `CNXMap.tsx` (1,521 lines) | 3× the 500-line threshold: 15 deck.gl layer builders, 3D-city setup, weather overlays, tooltips in one component. Extract layer builders + building card |
| 2 | `CNXApp.tsx:255,283` vs `flood/route.ts:8`, `social/route.ts:9-10` | Client sends `?scenario=` to flood and social; neither route reads it (only `story/route.ts:9` does) — silently dropped on 2 of 3 endpoints |
| 3 | `config.ts:47-221` | ~170 dead lines: `CNX_CORRIDORS`, `findCnxCorridor`, `buildSatelliteLayerCatalog`, `CNX_SCENARIO_IDS` — zero callers in src/ or scripts/ |
| 4 | `FlightPanel.tsx` | Entire component unused — no imports anywhere |
| 5 | `open-data-format.ts` | Zero importers despite existing "so client components can import" it |
| 6 | `CNXApp.tsx:448`, `CNXOperationalPulse.tsx:33` | `buildExecutiveBrief` recomputed unmemoized 2–3× per render while two other components memoize the same brief |
| 7 | `snapshot-store.ts:25`, `arrivals-store.ts:18`, `visitors-store.ts` | Machine-specific `/Volumes/Data/...` absolute paths baked into the Worker bundle; every edge write first attempts a local-disk write that throws and is caught. Gate behind `CNX_*_SNAPSHOT_DIR` env only |

**Minor findings** (full list held in session log; highlights): ICT timezone
handled two ways (Intl `Asia/Bangkok` ×31 vs manual `+7h` epoch shifts ×10 —
can drift); `/api/cnx/outbound` fetch outside abort/cleanup block
(`CNXApp.tsx:265-267`); `window.__cnxMap` debug handle installed every
render in production (`CNXMap.tsx:485-488`); `burnscar/route.ts:6` is the
only route missing `revalidate = 0`; `aircraft/route.ts:56-58` returns 200
on upstream failure (fail-soft, invisible to status monitoring); ~28
near-identical module-level TTL caches (a shared `cachedFetch` would drop
~15-20 lines each); hardcoded `https://cnx.nonarkara.org` in 10 src
locations despite `NEXT_PUBLIC_SITE_URL`; ~40 lines of aggregation logic
in `visitors/route.ts:96-131` instead of a lib module.

## Test coverage gaps

- 19 lib modules with no direct test importer, highest value: `flood.ts`
  (the scenario builder the honesty rules guard against), `rag.ts`,
  KV wrappers (`flights-kv`, `arrivals-store`, `visitors-store`).
- All 4 hooks in `src/hooks/` untested (happy-dom already configured).
- Only 2 of 42 routes have route tests (`aircraft`, `snapshot-trend`).

## Environment/infrastructure findings

| # | Finding | Fix |
|---|---|---|
| L1 | `npm run lint` (bare `eslint`) walks a stale Claude worktree at `.claude/worktrees/dreamy-chandrasekhar-a7c01c/` containing its own `.next/` output — eslint ignores are root-relative (`.next/**`) so the worktree's bundles are linted: ~977 false errors that hide real findings and make the local lint step meaningless. CI is unaffected (clean checkout) | Remove the stale worktree, or add `.claude/**` and/or `**/.next/**` to `eslint.config.mjs` ignores, and scope the script to `eslint src` |
| L2 | Local HEAD is 2 commits ahead of `origin/main`/production — violates the project's own published-HEAD release gate | Before Saturday: push `9b229b9`+`7135f43` and deploy through normal gates, or explicitly demo from production `0a2ed91` |

## Release gate for Saturday (recommended order)

1. **Decide the demo target**: the governor-frontend fixes (`9b229b9`,
   `7135f43`) are exactly what Saturday's demo shows — push + deploy via
   `npm run deploy:cnx`, then re-run `node scripts/verify-deploy.mjs` until
   identity is green. Otherwise demo production `0a2ed91` and note the
   pending fixes.
2. `npm audit fix` — non-breaking patches (next/postcss/sharp).
3. Remove the stale worktree / fix eslint ignores so `npm run lint` is
   meaningful.
4. Optional quick wins (each ≤1h, low risk): delete `FlightPanel.tsx`;
   delete dead `config.ts:47-221` block; wire-or-drop the `?scenario=`
   param; remove `window.__cnxMap`.
5. Re-run: `npm run type-check && npx eslint src && npm test`.

## Explicit limits of this audit

- No browser visual pass today — the last visual walk is
  `docs/audit/2026-10-07/governor-frontend-followup.md` (desktop/phone/
  dark/brief screenshots).
- No production build executed in this run (last isolated build: 7 Oct).
- No KV content, upstream account, or DNS/zone configuration inspected.
- Dependency severity assessed for *this* deployment context (Workers,
  all-dynamic routes, dev-only exposure), not as generic CVSS ranking.
- Two concurrent deep-dive passes (architecture/quality, security) plus
  full local verification and live read-only probes; ~70 files read in
  full, all 225 source files grepped for debt/security patterns.
