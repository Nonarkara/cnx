# CNX War Room — Chiang Mai Operations Dashboard

Real-time operational dashboard for Chiang Mai province, deployed at
**[cnx.nonarkara.org](https://cnx.nonarkara.org)**. Sibling of the
[Lopburi](https://lopburi.nonarkara.org), [Phuket](https://phuket.nonarkara.org),
and [BKKx atlas](https://atlas.nonarkara.org) dashboards — same
founder, same war-room pattern, province-specific data and palette.

Live streams (per a 1- or 3-min poll): Ping river gauges, Mae Ngat dam
storage, GISTDA PM2.5 per district (25 amphoes), NASA FIRMS hotspots,
Royal Forest Department (จุดความร้อน) fire detections, real-time CNX
airport flights (OpenSky ADS-B), multilingual social listening
(Google News RSS, GDELT 2.0, 8 languages auto-driven by inbound
flight origins), and 311 data.go.th datasets with a Thai TF-IDF
chatbot.

A live 3D city shows every OSM building in the Old City + Doi Suthep
area as a fill-extrusion layer (template: warm beige residential,
Lanna-navy civic, Doi Suthep-gold temples), with the historic
city-wall gates (Suan Dok, Chaeng Siphum, Chaeng Ku Hueang, Chaeng
Hua Lin, Chaeng Katam) traced in gold.

> **Honesty rules**: every number on the dashboard is labelled
> `live / scenario / model`. Demo CCTV footage wears an amber DEMO
> badge. The social rail's 19 CNX-themed baseline items are clearly
> scenario placeholders (not invented news) until real feeds come
> online. Missing data reads as "ข้อมูลไม่พอ" — never as a false
> green.

---

## 1. Prerequisites

- macOS 14+ (Apple Silicon or Intel) or Linux x86_64
- **Node 20.18+ or 22.x** (`nvm use` reads `.nvmrc` — Node 26 hangs on
  the opennextjs bundler; Node 22 is the supported default)
- A Cloudflare account with the `cnx.nonarkara.org` zone on it
- 8 GB RAM minimum (16 GB recommended for `next build` parallelism)

```bash
brew install node@22
nvm use    # or: nvm install $(cat .nvmrc)
```

## 2. Clone & install

```bash
git clone https://github.com/Nonarkara/cnx
cd cnx
npm install
cp .env.example .dev.vars
# Edit .dev.vars — fill in FIRMS_MAP_KEY at minimum
```

`FIRMS_MAP_KEY` is required for the FIRMS fire-hotspot feed to work;
without it `/api/cnx/fires` returns an empty array (the API key is
free at <https://firms.modaps.eosdis.nasa.gov/api/>).

## 3. Bake the slow-changing data

The dashboard reads GeoJSON for buildings, temples, walls, waterways,
and bus routes at runtime — baked from OSM Overpass via the scripts
under `scripts/`. Run them once before the first build:

```bash
npm run fetch:opendata     # 311 data.go.th datasets → public/data/cnx/open-data/
node scripts/fetch-cnx-buildings-3d.mjs  # buildings + temples + walls
node scripts/fetch-cnx-waterways.mjs      # Ping basin rivers + streams
node scripts/fetch-cnx-bus-routes.mjs     # bus routes + stops
node scripts/fetch-cnx-ground-overlay.mjs # ground overlay if needed
```

These bake to `public/data/cnx/<feature>.geojson` — see
[`scripts/`](./scripts/) for one-off refresh recipes.

## 4. Build

```bash
npm run build:cnx
```

The build chain runs `next build` + `@opennextjs/cloudflare build` +
`scripts/patch-og-wasm.mjs` (which strips the dead `cloudflare/images`
import and stubs `unenv/internal/tty/write-stream` — both required for
the OpenNext adapter). Expected wall time: 2–4 min on Node 22.

> **If the build hangs at 0% CPU**: you've hit Node 26's `process.nextTick`
> stall on the opennextjs bundler (memory note `Node 26 + @opennextjs/cloudflare`).
> Switch to Node 22 via `nvm use`, kill any other heavy node processes
> (airdash / chula / n8n / freellmapi), and retry. If still hung after 5
> minutes, kill it and retry — the hang is intermittent and load-dependent.

## 5. Deploy

```bash
unset CLOUDFLARE_API_TOKEN    # the env var defaults to a placeholder;
                              # wrangler falls back to the OAuth token in
                              # ~/.wrangler/config/default.toml
npx wrangler deploy -c wrangler.cnx.jsonc
```

DNS for `cnx.nonarkara.org` and `www.cnx.nonarkara.org` is auto-created
via `custom_domain: true` on the route — first deploy creates the CNAMEs,
subsequent deploys update them in place.

Worker scripts to seed first:
```bash
node scripts/run-arnis-chiangmai.sh   # ~5 min — generates the Java
                                      # Minecraft world of Chiang Mai Old City
                                      # (~106 MB, 3,766 Overture buildings)
                                      # into /Volumes/Data/Projects/BKKx-worlds/
                                      # This is a desktop step, not part of
                                      # the web deploy.
```

## 6. Verify

```bash
curl -I https://cnx.nonarkara.org                  # 307 → /cnx
curl -I https://cnx.nonarkara.org/cnx              # 200, dashboard
curl -I https://cnx.nonarkara.org/cnx/about        # 200, methodology page
curl -I https://cnx.nonarkara.org/api/cnx/fires-rfd # 200, real RFD hotspots
curl https://cnx.nonarkara.org/api/cnx/open-data   # totalDatasets: 311
curl https://cnx.nonarkara.org/api/cnx/bus-routes  # 17 routes + 1,117 stops
curl https://cnx.nonarkara.org/api/cnx/waterways   # 5,323 streams + rivers
curl https://cnx.nonarkara.org/api/cnx/social      # items > 0
```

The full route table is at `src/app/api/cnx/<feature>/route.ts` —
17 endpoints in total.

## 7. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Cloudflare Worker (`cnx-dashboard`)                                     │
│   route: cnx.nonarkara.org / www.cnx.nonarkara.org                      │
│   bundle: .open-next/worker.js (built via @opennextjs/cloudflare)       │
│                                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│   │ /api/cnx/*   │  │ /data/cnx/*  │  │ Next.js SSR  │                    │
│   │ (live fetch) │  │ (ASSETS bind)│  │ (UI)         │                    │
│   └──────┬───────┘  └──────────────┘  └──────────────┘                    │
│          │                                                              │
│          ▼                                                              │
│   External APIs:                                                        │
│     GISTDA PM2.5 / ThaiWater v3 / RFD / NASA FIRMS+GIBS                 │
│     OpenSky / Google News / GDELT 2.0 / data.go.th                     │
└─────────────────────────────────────────────────────────────────────────┘

Browser (cnx.nonarkara.org/cnx):
  ┌────────────────────────────────────────────────────────────────────┐
  │  Header  •  CCTV strip  •  Map (deck.gl + MapLibre)  •  Panels   │
  │    RFD/Flood/Air/Open-Data/Ask  •  Ticker  •  Modals              │
  │                                                                    │
  │  3D layers: Buildings (Old City + urban fringe) / Temples / Walls │
  │  Live layers: Fires (FIRMS + RFD) / Air (25 amphoes) / Flights    │
  │  Toggles: 3D City / Temples / Walls / Rivers / Buses               │
  │  Side rail: Social (multilingual) • Open Data (311) • Ask Chat      │
  └────────────────────────────────────────────────────────────────────┘
```

Honesty layers (per data module):
- **Live**: `live/scenario/model` label on every number
- **Scenario**: placeholders in the social rail marked `tone: "demo"` with an amber DEMO badge in the UI
- **Honest miss**: any missing feed reads as "ข้อมูลไม่พอ", never as a fake success

## 8. Data sources

| Stream | Endpoint | Auth | Cadence |
|---|---|---|---|
| GISTDA PM2.5 | `map.longdo.com/ws/etc/gistda_pm25_by_location` | none | 5 min |
| Royal Forest Department | `wildfire.forest.go.th/firemap/getdb.php` | none | 30 min |
| NASA FIRMS | `firms.modaps.eosdis.nasa.gov` | map key | 30 min |
| ThaiWater v3 | `api-v3.thaiwater.net/api/v1/thaiwater30/` (province=50) | none | 30 min |
| OpenSky | `opensky-network.org/api/states/all` | optional creds | 30 s |
| Google News RSS | `news.google.com/rss/search?q=Chiang+Mai` | none | 3 min |
| GDELT 2.0 | `api.gdeltproject.org/api/v2/doc/doc` | none | 3 min |
| data.go.th | `data.go.th/api/3/action/package_search` | none | 1 h |
| OSM Overpass (baked) | `overpass-api.de/api/interpreter` | none | weekly |

Full source catalogue: [`public/docs/cnx-sources.md`](./public/docs/cnx-sources.md)

## 9. Development workflow

```bash
npm run dev            # next dev on 127.0.0.1 (M3 Air)
npm run type-check     # tsc --noEmit --skipLibCheck    (Node 22)
npm run lint           # eslint src
npm run build:cnx      # full Cloudflare build
npm run deploy:cnx     # build + wrangler deploy
```

The dashboard's locale is `th`. Layout is responsive:
- `< md` (smartphone): stacked panels, bottom tabbed drawer
- `md`–`lg` (tablet portrait): social rail + map + 3-tab drawer
- `xl+` (desktop): full war room — social rail + map + ops desk
- All tap targets are ≥ 44 px (Apple HIG)
- All themes ship both light (warm beige `#f4f1ea`) and dark (`#0d1117`)
  variants via `data-theme` on `<html>` (toggle in header)

## 10. Project structure

```
cnx/
├── .env.example                  ← every secret / build-time var
├── .nvmrc / .node-version        ← pin Node 22
├── AGENTS.md                     ← sister-project conventions
├── docs/
│   ├── WAR-ROOM-BIBLE.md         ← operator study guide
│   └── SOURCES.md                 ← full feed catalogue
├── public/
│   ├── data/cnx/                 ← baked GeoJSON (buildings, temples, walls, waterways, bus-routes, open-data/)
│   ├── docs/cnx-*.md             ← downloaded / about / sources / methodology .md
│   └── logos/                    ← partner logos (RCAD, depa, Smart City Thailand, Axiom)
├── scripts/
│   ├── fetch-cnx-buildings-3d.mjs ← OSM buildings + temples + walls → 4 GeoJSON
│   ├── fetch-cnx-waterways.mjs   ← OSM rivers + streams
│   ├── fetch-cnx-bus-routes.mjs  ← OSM bus routes + stops
│   ├── fetch-datagoth-cnx.mjs    ← data.go.th 311 datasets
│   ├── run-arnis-chiangmai.sh    ← Arnis Minecraft world generation
│   └── patch-og-wasm.mjs         ← post-build patches for OpenNext
├── src/
│   ├── app/
│   │   ├── cnx/                  ← dashboard routes (/cnx, /cnx/about)
│   │   └── api/cnx/<feature>/    ← 17 API endpoints
│   ├── components/CNX/           ← React shell + panels (CNXApp, CNXMap, CNXTopBar, …)
│   ├── lib/cnx/                  ← data modules (fetchCnxSocial, fetchCnxBus, …)
│   ├── services/                 ← basemap styles
│   └── types/                    ← API response + GeoJSON types
├── public/data/cnx/              ← baked GeoJSON output
├── wrangler.cnx.jsonc            ← Cloudflare Worker config
├── wrangler.jsonc                 ← mirror (Next.js default target)
├── next.config.mjs                ← redirect / → /cnx
├── package.json
└── tsconfig.json
```

## 11. Sister dashboards

The same architecture ships for every province:
- [lopburi.nonarkara.org](https://lopburi.nonarkara.org) — Lopburi (Pa Sak Jolasid dam, social)
- [chula.nonarkara.org](https://chula.nonarkara.org) — Chulalongkorn University digital twin (Arnis-generated Minecraft world)
- [atlas.nonarkara.org](https://atlas.nonarkara.org) — BKKx 3D Atlas (432,077 OSM buildings)

The 7-section layout, RCAD + Dr Non leadership cards, and `tone: "demo"`
badge convention are all mirrored from the Lopburi /atlas pattern so the
three dashboards feel like a product line, not strangers.

## 12. License

MIT for the code; OSM data is ODbL 1.0; rest of the feeds retain their
respective upstream licenses (see `public/docs/cnx-sources.md` for
the full table).
