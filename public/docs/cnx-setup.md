# CNX Dashboard — Clone & Run

A portable local-development guide for this public repository. The existing
production Worker/domain belongs to the maintainer; cloning the source does
not grant access to those resources.

The [repository README](https://github.com/Nonarkara/cnx#readme) is the canonical
setup and architecture guide. This downloadable copy follows the same contract.

## 1. Start locally

Use a current Node **22.x** release, **at least 22.20.0**, npm, and Git. The full
locked toolchain includes Node-22-only packages and Linux compression tooling
that requires 22.20+. `.nvmrc` and `.node-version` select the current 22 line.
Node 20 and Node 26 are outside the repository’s supported range.

```bash
git clone https://github.com/Nonarkara/cnx.git
cd cnx
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:3000/cnx**. A Cloudflare account, custom domain, API key,
external drive and data refresh are not required to start the local UI.
Individual live feeds need network access and may require credentials or fail.
This is not a complete offline-data mode.

## 2. Know which configuration is read

- Next.js local development reads `.env.local`
- Wrangler’s local Worker runtime reads `.dev.vars`
- A deployed Worker needs its own account variables/secrets
- `NEXT_PUBLIC_*` values are public build-time metadata, never secrets

The committed example uses the local site URL, so server-side asset reads use
this checkout’s `public/data/cnx/`. Local snapshot paths stay in the gitignored
`.data/cnx/` directory. Both `.env.local` and `.dev.vars` are ignored by Git.
Restart the process after changing values.

Leave optional keys empty for the first run. Add only your own credentials if
you later enable that provider. Without `FIRMS_MAP_KEY`, the FIRMS/smoke path
cannot supply a live VIIRS pass. Treat missing, scenario, modelled and live
values as different states.

## 3. Verify and build

```bash
npm run type-check
npm run lint
CNX_SKIP_DISK_LOAD=1 npm test
npm run build
```

The ordinary build is a Next.js build. `npm start` serves it. Separately,
`npm run build:cnx` builds the OpenNext Worker and applies the checked-in
adapter patch. The deployment script’s public URL metadata must be adapted
before building a fork for a different site.

While the development server is running:

```bash
curl -I http://127.0.0.1:3000/cnx
curl -I http://127.0.0.1:3000/cnx/about
curl -I http://127.0.0.1:3000/data/cnx/waterways.geojson
curl http://127.0.0.1:3000/api/cnx/build
```

HTTP checks do not establish live-data availability, browser usability or
production deployment readiness. Check those separately.

## 4. Refresh only what you need

Baked geography and catalogues already exist in `public/data/cnx/`. Read the
relevant script and upstream terms before refreshing: refresh commands make
external requests and rewrite generated files. `ingest:all` currently delegates
to `fetch:opendata`; it does not regenerate every map layer.

The optional `run-arnis-chiangmai.sh` is an operator-specific Bash/macOS job
with an existing Arnis binary and `/Volumes/Data` assumption. It is not needed
for the web app and should not be passed to Node.

## 5. Deploy only to your own target

The tracked Wrangler files contain the maintainer’s Worker name, routes and
KV namespace. Do not run `deploy:cnx` unchanged for a fork.

Create your own account resources and reviewed configuration, update the
Worker/domain/KV/public-URL identifiers, configure your own secrets, build and
verify the Worker bundle, then deliberately deploy to your own target. Check
provider service limits, billing and data terms before doing so. No account,
DNS or deployment setup occurs in the local quickstart.

Adapting to another city also requires checking geography, source coverage,
route assumptions, attribution and provenance rules. Renaming folders alone
does not create a verified municipal dashboard.
