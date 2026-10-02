# Public setup verification

Checked 2026-10-02 on Linux x64, Node 22.23.3 and npm 11.9.0, against baseline
`bbdd53bbfe345a09e87f92d8b48358b794efd085` plus this local readiness change.

## Passed

- Locked dependency installation with `npm ci --ignore-scripts --no-audit --no-fund`
  and a writable local npm cache; no dependency versions changed
- `npm run type-check`: exit 0
- `npm run lint`: exit 0, with four pre-existing unused-variable warnings
- `CNX_SKIP_DISK_LOAD=1 npm test`: 28 test files, 360 tests passed
- `NEXT_TELEMETRY_DISABLED=1 npm run build`: standard Next.js production build
- `npm run build:cnx`: OpenNext Worker build and checked-in adapter patch;
  `.open-next/worker.js` was produced; no upload/deployment
- Local production-server HTTP smoke: `/cnx`, `/cnx/about`, committed waterways
  GeoJSON and `/api/cnx/build` returned 200; `/` redirected to `/cnx`
- Build endpoint confirmed the local site URL used for that test build
- README relative-link existence, SVG XML, rendered diagram inspection,
  package/lockfile engine consistency, ignored local configuration/snapshots,
  and `git diff --check`

An initial Node 22.12 installation reported an engine mismatch. Reviewing the
whole lockfile, rather than Vite alone, revealed Node-22-only Wrangler/MapLibre
packages and Linux compression tooling requiring Node 22.20+. The supported
range and CI now reflect that. Final checks above used Node 22.23.3.

Only root engine metadata changed in the lockfile. Installation emitted
upstream deprecation notices; this pass did not upgrade dependencies or run a
full vulnerability audit.

## Not established by these checks

- Browser/WebGL rendering, map interaction, keyboard/screen-reader operation,
  responsive layout or full accessibility compliance
- Live upstream feed availability, credentials, provider quotas or data accuracy
- Cloudflare runtime behavior, account/KV setup, custom domains, a public
  deployment, durable edge storage or production security acceptance
- Cross-platform execution of macOS-only operator scripts or Windows support
- A new license grant: project prose says MIT, but no root LICENSE is present

The local source build and documented HTTP entry points are verified. A live
municipal operations service needs the separate source, runtime, security and
human review described in README.
