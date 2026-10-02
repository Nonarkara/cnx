# CNX Dashboard — Sources

> Every public feed wired into the Chiang Mai Operations War Room,
> with endpoint, auth, and what it drives. Filename mirrors the
> Lopburi dashboard's `/docs/lopburi-sources.md` so the two
> provinces' documentation sets look like siblings.
>
> This page is the **public** list: what is connected, and what is
> deliberately not. The deeper engineering inventory — per-source
> failure modes, provenance rules, and the operator decisions still
> open — is maintained in-repo at `docs/SOURCES.md` and is not
> published, because it contains unreleased licence and gating
> decisions rather than user-facing facts.

## Live operational sources (already wired)

| Source | Used by | Endpoint | Auth |
|---|---|---|---|
| Royal Forest Department (RFD) | Fire safety panel, hotspot pills | `wildfire.forest.go.th/firemap/getdb.php` | none |
| PCD Air4Thai | Official provincial AQI stations | `air4thai.pcd.go.th/services/getNewAQI_JSON.php` | none |
| CMU CCDC DustBoy | ~236 low-cost PM2.5 sensors, per-station `observedAt` | `open-api.cmuccdc.org` | none |
| NASA AERONET | Ground photometer Ångström exponent + daily AOD | `aeronet.gsfc.nasa.gov` | none |
| GISTDA PM2.5 by location | Air-quality panel, AQI per district | `map.longdo.com/ws/etc/gistda_pm25_by_location` | none |
| GISTDA AOD tiles | Aerosol overlay | `disaster.gistda.or.th` (auth-walled for full tile range) | public PM2.5 is open; full AOD needs session |
| NASA FIRMS (MODIS / VIIRS) | Fires panel, map markers | `firms.modaps.eosdis.nasa.gov` | Map key (`FIRMS_MAP_KEY` env) |
| NASA GIBS | Satellite base layer | `gibs.earthdata.nasa.gov` | none |
| Google Flood Hub | Riverine flood forecast at virtual gauges on the Ping | `floodforecasting.googleapis.com` | `CNX_FLOODHUB_KEY` |
| Open-Meteo CAMS | AQI fallback, AOD model | `air-quality-api.open-meteo.com` | none |
| RainViewer | Live precipitation radar tiles | `api.rainviewer.com` / `tilecache.rainviewer.com` | none |
| OpenSky Network | Flight panel | `opensky-network.org` | **OAuth2 client-credentials** (`OPENSKY_CLIENT_ID` / `_SECRET`) |
| adsb.lol | ADS-B backup, used when OpenSky is unavailable | `api.adsb.lol` | none |
| **Maholan flood CCTV wall** | Public Cameras panel + map markers (position, owning agency, liveness) | `cctv.maholan.net/api/cameras` | none — **catalogue metadata only, no video proxied** |
| **ThaiWater v3** | **Measured river levels** — Ping-basin gauge panel, map markers, and the flood axis of the province verdict | `api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel` | none — **keyless public endpoint** |
| Google News RSS | Social sidebar | `news.google.com/rss` | none |
| GDELT 2.0 | Social sidebar | `api.gdeltproject.org` | none |
| data.go.th (CKAN) | Open Data panel | `data.go.th/api/3/action/package_search` | none |
| OSM Overpass | Bus routes, waterways, 3D city (buildings / temples / walls) | `overpass-api.de` | identifying `User-Agent` required |
| OSM Standard tiles | Map base | `tile.openstreetmap.org` | none |
| **Arnis (arnismc.com)** | Minecraft world of Chiang Mai Old City (Java Edition, ~106 MB) | `/Users/axiom/.local/bin/arnis` (local CLI) | none |
| Overture Maps (via Arnis) | 3D building footprints Arnis uses for the Minecraft world | `overturemaps.org` (Arnis fetches) | none |

### About the data.go.th count

The Open Data panel shows a **dated snapshot of one filtered Thai-language
search**, not a catalogue total: **311 datasets when baked 2026-09-15, 316
when re-queried 2026-10-01**, out of 44,207 in the whole catalogue (the
English "Chiang Mai" query alone returns 493). The bake is refreshed by a
manual script, so the number drifts and the panel carries its own age
stamp. Any figure quoted here is a snapshot, never a population count.

### Not wired, despite appearing in layer contracts

| Source | Status |
|---|---|
| Longdo CCTV / iTIC | Partially reachable; only a subset of cameras answer |

> **ThaiWater v3 is now wired** (2026-10-02) for measured river levels —
> see below. The older claim that nothing fetched `api-v3.thaiwater.net`
> was true when written and is now out of date.

## Measured river levels — ThaiWater v3

The **Ping River — measured** panel, the blue gauge markers on the map, and
the flood axis of the province verdict read
**[ThaiWater](https://www.thaiwater.net)**, the national water data centre
run by the **National Hydroinformatics Data Center (สทนช.)** under the Office
of the National Water Command. The observations themselves belong to
**RID** (Royal Irrigation Department), **FOP** (Department of Water
Resources), **HII** (Hydro-Informatics Institute) and **EGAT**.

**No API key is required.** The endpoints read here are the same
`/public/` paths the public website calls from a browser.

### What it delivers, and what it does not

- Measured 2026-10-02: **43 Ping-basin gauges reporting** in Chiang Mai
  province, **8 of them on the Ping mainstem**. The province's telemetry
  catalogue lists 128 stations across all basins, and the panel shows that
  as context only — it is **not** a coverage denominator, because the
  catalogue carries no basin field and most of the other 85 stations drain
  to the Kok and the Chao Phraya rather than the Ping.
- Every reading carries a real observation time and a height above mean
  sea level. Freshness varies a lot between stations (minutes to hours
  in one response), so **each row ages its own observation**.
- **Exactly one station publishes an official critical level** — P.1
  สะพานนวรัฐ (Nawarat Bridge), at 304.20 m above sea level. It is shown
  with its headroom in metres. No threshold is invented for any other
  station; the others show their distance to their published bank level.
- The feed also returns a numeric `situation_level` per gauge. This board
  **does not interpret it**: across the whole province its values do not
  track height above the bank, and the publisher's own site uses it only
  as a map draw-order hint. Severity bands on the panel are this board's
  reading of published bank geometry, clearly labelled as such.
- There is **no official machine-readable warning or advisory feed**. The
  dashboard therefore never presents its own threshold as a government
  announcement.

### Terms

The publisher states **"Copyright © 2024 Hydro - Informatics Institute,
All rights reserved."** and publishes **no open licence** for this feed, so
this dashboard claims none. The integration is keyless, limited to one
read per 10 minutes, and scoped to Chiang Mai province. The full intended-use
and terms text is owned by `src/lib/cnx/river-level.ts` and rendered
verbatim in the panel footer.

### How the endpoints were found

Not by guessing. The service name `thaiwater30` had been recorded as dead
because a probe of the bare path `/api/v1/thaiwater30` returns
`404 Request to an unknown service` — the router dispatches on the full
sub-path, so the bare name is unroutable while
`/api/v1/thaiwater30/public/waterlevel` answers 200. The working endpoint
list was read out of the public site's own JavaScript bundle, which
enumerates the paths the site itself calls.

## Public cameras — credit, intended use and terms

The **Public Cameras** panel and the camera markers on the map read the
**[Maholan Flood CCTV Wall](https://cctv.maholan.net)**, a
community-operated aggregator of Thai flood and road cameras. The
individual cameras are operated by the agency named beside each one —
in the Chiang Mai area mostly the **Royal Department of Highways
(กรมทางหลวง / DOH)**, plus **ThaiWater / EGAT / DWR**.

**What is read:** position, owning agency, stream type, and the
aggregator's own liveness flag. **What is not:** no video is mirrored,
embedded, recorded, stored or redistributed by this board. The panel
links to the source; the pictures stay with the agency that owns the
camera. It is a volunteer-operated server, so the catalogue is read once
every 15 minutes and filtered to this province rather than polled hard.

**Intended use.** Public-goods situational awareness for haze and flood
response in Chiang Mai province. Camera positions and liveness are read
to help decide road openings, flood detours and air-quality field checks.
Nothing here is sold, and nothing here is used to identify or track any
person.

**Terms.** Camera streams remain the property of the agencies that
operate them, as credited per camera. The aggregator publishes no formal
API terms, so this integration is keyless, rate-limited, and scoped to the
Chiang Mai operating area. Any reuse beyond public-goods situational
awareness should be agreed with the aggregator and the named agencies
first.

**A camera that is not answering is shown as not answering.** It is never
hidden, and it never counts as evidence that a road is clear.

## Province code reference

| What | Code |
|---|---|
| ThaiWater v3 province (เชียงใหม่) | `50` |
| ThaiWater v3 basin (ลุ่มน้ำโขงเหนือ) | `2` |
| GISTDA PM2.5 province | Chiang Mai (no code, label-based) |

## Multilingual social listening (auto-driven by inbound flights)

`fetchCnxSocialMultilingual(countries)` subscribes to Google News RSS
in eight languages based on the top inbound origin countries from
`/api/cnx/outbound`:

| Country | Language | Feed hl / gl |
|---|---|---|
| China | zh | `hl=zh-CN&gl=CN` |
| Japan | ja | `hl=ja&gl=JP` |
| Korea | ko | `hl=ko&gl=KR` |
| Russia | ru | `hl=ru&gl=RU` |
| Germany | de | `hl=de&gl=DE` |
| France | fr | `hl=fr&gl=FR` |
| India | en-IN | `hl=en-IN&gl=IN` |
| Australia | en-AU | `hl=en-AU&gl=AU` |

## Persistence

- `/api/cnx/flights` snapshots land in `/Volumes/Data/CNX/flight-snapshots/YYYY-MM-DD.ndjson` when the API runs on the M3 Air (in-process Map fallback on the Cloudflare edge).
- Slow-changing data (amphoe boundaries, Ping waterways, OSM 3D buildings, data.go.th catalog, heritage POIs) is baked at build by `scripts/*` invocations.

## Slow-changing data (baked at build)

- 25 amphoe boundaries (Thai shapefile from GISTDA)
- OSM 3D buildings — split into 4 layers by `scripts/fetch-cnx-buildings-3d.mjs`:
  - `public/data/cnx/buildings-core.geojson` — Old City + Doi Suthep, deep (30,522 features, 10 MB)
  - `public/data/cnx/buildings-wide.geojson` — urban fringe, light (28,822 features, 9.7 MB)
  - `public/data/cnx/temples.geojson` — `amenity=place_of_worship` polygons (474 features, 212 KB) — Buddhist wats, mosques, churches
  - `public/data/cnx/walls.geojson` — `historic=city_wall` + `barrier=city_wall` (14 features, 8 KB) — actual Chiang Mai Old City gates: Suan Dok Gate, Chaeng Siphum, Chaeng Ku Hueang, Chaeng Hua Lin, Chaeng Katam
  - All four are valid GeoJSON (`[lon, lat]` arrays). The earlier `buildings.geojson` had Overpass-native `{lat, lon}` objects — the 3D layer rendered nothing for that reason. The new scripts fix it.
- OSM waterways / Ping basin — `scripts/waterways` (cached 7 d)
- OSM bus routes — `scripts/bus-routes`
- 311 data.go.th datasets (baked 2026-09-15, a filtered snapshot — see the note above) — `scripts/fetch-datagoth-cnx.mjs`
- 12 heritage POIs (Wat Phra Singh, Doi Suthep, Nimman, etc.)

## Arnis Minecraft world

A Java Edition Minecraft world of Chiang Mai Old City (1.5 km × 1.5 km walled square + a bit of Ping riverbank) is generated by `scripts/run-arnis-chiangmai.sh`. The script invokes the locally-installed Arnis CLI (`/Users/axiom/.local/bin/arnis`) with:

```
--bbox 18.7820,98.9750,18.8000,99.0010
--spawn-lat 18.7903 --spawn-lng 98.9870
--terrain --fillground --overture true --map-preview
```

Output: `/Volumes/Data/Projects/BKKx-worlds/chiangmai-old-city-java/Arnis World 1/` (~106 MB; 3,766 Overture buildings + OSM roads + AWS terrain tiles + ESA WorldCover land cover + bundled schematic trees). Same script family as `chula-control-tower/scripts/run-arnis-pathumwan.sh`.

To regenerate:

```bash
bash /Volumes/Data/Projects/CNX/scripts/run-arnis-chiangmai.sh
```

Requires Arnis installed locally (`brew install louis-e/arnis/arnis` on macOS) and `/Volumes/Data` mounted.

## Auth-walled / deferred (documented honestly)

- **GISTDA disaster portal** (`https://disaster.gistda.or.th`) — full AOD tile range needs session; we use the public PM2.5 endpoint instead.
- **JAXA GCOM-C SGLI AOT** — resolved from a static STAC COG catalog, **wired 2026-10-02 at `/api/cnx/jaxa-aot`** by operator decision: the dataset declares `license: proprietary` and access generates a text access log, so the route is rate-limited (30 min server TTL + edge cache). The endpoint resolves which scene exists, its observation window, and the licence — it does not return an AOT value, because the value lives inside the COG and a decoded pixel is work the Workers runtime cannot do.
- **OpenSky** — OAuth2 client-credentials via `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`; `api.adsb.lol` is the fallback when that is unavailable.
- **ThaiWater v3 / HII** — no live gauge feed. Until one exists the board reports **no measured river level** and refuses to certify the flood axis as safe; a flood-prone-area raster would be a static hazard map, not a measurement.