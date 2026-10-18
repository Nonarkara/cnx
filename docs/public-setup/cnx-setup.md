# CNX Dashboard — Clone and Run

## Local development

Use the pinned Node version in `.nvmrc` (supported engines: Node 20.19+ or 22.12+ within 22.x).

```bash
git clone https://github.com/Nonarkara/cnx
cd cnx
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:3000/cnx`. Next.js reads `.env.local`; Wrangler local development reads `.dev.vars`. Both local credential files are ignored. Optional keyed feeds require their documented credentials; never commit keys. The example uses project-relative `.data/cnx/` directories for local snapshots.

## Static data

Tracked files under `public/data/cnx/` support the first run. Refresh only when needed:

```bash
npm run fetch:opendata
node scripts/fetch-cnx-buildings-3d.mjs
node scripts/fetch-cnx-waterways.mjs
node scripts/fetch-cnx-bus-routes.mjs
```

Refreshes query upstream services and can change dated snapshots. `ingest:all` currently aliases `fetch:opendata`; it does not refresh every source.

## Check, build, deploy

```bash
npm test
npm run type-check
npm run lint
npm run build:cnx
npx wrangler deploy -c wrangler.cnx.jsonc
node scripts/verify-deploy.mjs --expect rain --expect river-level
```

Deployment requires an authorized Cloudflare account and the appropriate Worker bindings/secrets. `build:cnx` creates the OpenNext bundle, copies MapLibre workers, stamps build provenance, and applies the adapter patch. Do not deploy a dirty tree or assume a commit string proves tree equivalence. The verification script also checks repository cleanliness and live route health.

## Runtime responsibilities

- Cloudflare Workers serve the application and bundled assets; KV stores relay copies.
- The existing launchd relay on the primary Mac collects feeds whose upstreams cannot reliably serve Cloudflare, plus camera processing. See `docs/CCTV-PIPELINE.md` and the relay scripts.
- GitHub Actions provides best-effort rain/river standby. Scheduled jobs may be delayed; it is not a guaranteed recovery timer. Other relay functions still depend on the Mac.
- Missing or stale readings are evidence gaps, never proof of safety. A fresh collection timestamp does not make an old observation current.

Use the supported Node version when diagnosing a build. Preserve other projects’ running services. Inspect logs and stop only the failed build you started if necessary.

See the repository README and current Wrangler configuration for deployment details. Do not reuse the CNX custom hostname when setting up another city.
