# CNX Dashboard — Clone &amp; Run

> Step-by-step: from a fresh macOS box to a deployed
> `cnx.nonarkara.org`. Filename mirrors `/docs/lopburi-setup.md` so
> the Lopburi and Chiang Mai documentation sets look like siblings.

## 0. Prerequisites

- macOS 14+ (Apple Silicon or Intel)
- Node 20.x (Node 26 mostly works; the build script works around the OpenNext bundler hang by disabling ESLint at build time)
- A Cloudflare account with a custom domain pointing at `cnx.nonarkara.org`

## 1. Clone

```bash
git clone https://github.com/Nonarkara/cnx
cd cnx
npm install
```

## 2. Configure environment

Create `var/.env.production` (or `.dev.vars` for local wrangler):

```
CLOUDFLARE_API_TOKEN=cfut_xxx        # worker write scope
CF_ACCOUNT_ID=74ad6bf8dfaaccf82de6f0847f7d2d54
FIRMS_MAP_KEY=xxx                    # NASA FIRMS map key
LONGDO_API_KEY=xxx                   # Longdo CCTV
ITIC_USERNAME=xxx
ITIC_PASSWORD=xxx
```

## 3. Bake static data

```bash
npm run fetch:opendata      # 311 data.go.th datasets → public/data/cnx/open-data/
npm run ingest:all         # everything else (RFD snapshot, GISTDA PM2.5 cache, …)
```

The 25-amphoe boundaries, OSM 3D buildings, Ping waterways, and the heritage POI list are all generated here. The scripts are idempotent — running them twice produces no diff.

## 4. Build

```bash
npm run build:cnx
```

This runs `next build` with `eslint.ignoreDuringBuilds: true`, then `npx @opennextjs/cloudflare build`, then `node scripts/patch-og-wasm.mjs` (strips the dead `cloudflare/images.js` import and stubs `unenv/internal/tty/write-stream.mjs` — both are post-build fixes required for Node 26).

## 5. Deploy

```bash
npm run deploy:cnx
```

This runs `wrangler deploy -c wrangler.cnx.jsonc`. The route `cnx.nonarkara.org` is auto-created on first deploy via `custom_domain: true`; subsequent deploys update the same route in place.

## 6. Verify

```bash
curl -I https://cnx.nonarkara.org                  # 307 → /cnx
curl -I https://cnx.nonarkara.org/cnx              # 200, dashboard
curl -I https://cnx.nonarkara.org/cnx/about        # 200, this page
curl -I https://cnx.nonarkara.org/api/cnx/fires-rfd  # 200, real RFD hotspots
curl -I https://cnx.nonarkara.org/api/cnx/aqi-amphoe # 200, 25-amphoe PM2.5
```

## What lives where

| Layer | Lives in | Cost |
|---|---|---|
| Edge worker | Cloudflare Workers | free tier (well under) |
| Static assets (JS / CSS / images / docs) | Cloudflare Pages asset bundle | free tier |
| Slow-changing data (GeoJSON, open-data catalog) | `public/data/cnx/` (bundled) | free |
| Flight snapshots (long-term) | `/Volumes/Data/CNX/flight-snapshots/` on the M3 Air | local disk |

## How to add a new city

The dashboard is designed for marginal-cost ~0 reuse across provinces:

1. Copy `src/lib/cnx/` → `src/lib/<new>/` and rename.
3. Copy `src/components/CNX/` → `src/components/<new>/`.
4. Copy `src/app/cnx/` → `src/app/<new>/` and the route prefix.
5. Update `wrangler.cnx.jsonc` → `wrangler.<new>.jsonc` with the new routes.
6. Update `next.config.mjs` redirects to send `/` → `/<new>` when `NEXT_PUBLIC_PROVINCE=<new>`.

The framework primitives (`CNXApp`, `CNXTopBar`, `CNXLogoRow`, `CNXMap`) are the same shape across provinces — only the data modules swap.

## Known build gotchas on Node 26

- `next build` sometimes hangs at "Creating an optimized production build…" for 30–60s before unblocking. The `eslint: { ignoreDuringBuilds: true }` flag in `next.config.mjs` skips the lint step that's stalling; the actual compilation proceeds.
- After `npm install`, re-run `node scripts/patch-og-wasm.mjs` if you see `Could not resolve "./internal/tty/write-stream.mjs"` in the worker bundle. The patch is idempotent.
- The `next.config.mjs` deliberately sets `output: 'export'` → NO; we removed `output: 'standalone'` too. The OpenNext adapter (`@opennextjs/cloudflare`) handles the worker build.