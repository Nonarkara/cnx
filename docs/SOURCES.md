# CNX source inventory

Every upstream CNX consumes, what it actually gives, how it fails, and what
the board is allowed to claim from it.

**Verified 1 October 2026** against the live deployment. The "live" column is
what the API returned on that date, not what the code intends. Anything
unverified says so.

A source is only allowed to reach a panel if it appears here with a stated
failure mode. That is the same rule as `layer-contract.ts`, applied to the
feed list rather than the layer list: `getLayerContract()` returns `null`
for an unknown layer rather than minting a clean default, and an upstream
with no recorded failure mode has no documented path to `provenance: "live"`.

---

## 1. Air quality

| Source | Endpoint | Key | Gives | Failure mode |
|---|---|---|---|---|
| **Air4Thai (PCD)** | `air4thai.pcd.go.th/services/getNewAQI_JSON.php` | none | Official PM2.5/PM10/O3/CO/NO2/SO2 by station | Provincial stations go quiet overnight; the board says "0 fresh monitors", it does not carry yesterday's reading forward |
| **CMU CCDC DustBoy** | `www-old.cmuccdc.org` (open-api.cmuccdc.org) | none used | ~236 sensors, hourly batch, per-station `observedAt` | **The feed is one hourly batch, not 236 independent clocks.** After 3 h the board says stale. `log_datetime` is **UTC** despite looking Bangkok-local |
| **Open-Meteo CAMS** | `air-quality-api.open-meteo.com` | none | Global model AQI + PM2.5 | A **model**, not a measurement. One grid cell; the map dots are scaled copies of it |
| **AERONET** | `aeronet.gsfc.nasa.gov` | none | Ground photometer Ångström exponent, daily AOD | Cloud-screened: cloudy days are simply **missing**, not zero. A gap in the series is not a clean day |
| **GISTDA PM2.5** | `map.longdo.com` tile | none | Per-amphoe PM2.5 raster | Tile service, not an API |

**Honest current state:** province-average PM2.5 **13 µg/m³**, AERONET level
1.5, GIBS AOD **0.18** (band `watch`).

**DustBoy outlier handling.** `station > max(60, p90(province peers) × 3)`
→ `suspect: true`. Headline is p95 of accepted readings; raw max preserved as
`maxPm25Raw`; `worstProvince` by per-province p90. A neighbour test, not a
percentile clamp, because a clamp would hide a genuine regional episode —
a percentile clamp that suppresses a real event is worse than a false
positive. See `dustboy-suspect.test.ts` for both directions.

---

## 2. Fire and smoke

| Source | Endpoint | Key | Gives | Failure mode |
|---|---|---|---|---|
| **NASA FIRMS** | `firms.modaps.eosdis.nasa.gov/api/area/csv/` | `FIRMS_MAP_KEY` ✅ set | VIIRS hotspot lat/lon, brightness, confidence, FRP | NRT publishes with a **<3 h delay**, and the request is anchored to UTC while the province runs UTC+7. A 1-day window returns a valid *empty* body — indistinguishable from "no fires". Fixed: fetch 2 days as the liveness proof, report 24 h |
| **RFD (กรมป่าไม้)** | `wildfire.forest.go.th` | none | Thai forest hotspots, tenure-classified | 0 in the Chiang Mai box over 7 days at last check |
| **Smoke trajectory** | Open-Meteo wind + FIRMS | — | 1/3/6 h plume | Only drawn from a **live VIIRS pass inside 350 km** (the window that reaches Shan State). Straight-line advection, not a forecast |

**FIRMS CSV shape, verified against NASA LANCE docs.** VIIRS confidence is
`l`/`n`/`h`, **not** a 0–100 integer; `+cell` gives `NaN`. `satellite` is a
letter, not a name. A missing `bright_ti4` column gives `NaN` brightness,
which used to fall through the severity ladder to `"good"` — a false
all-clear from a field we never received. Severity is now `unknown` (grey),
never `good`, when brightness is unreadable.

**The three states.** Header-only → the pass is unpublished, report
**unknown**. Rows but none within 24 h → the pass is **live and the sky is
clear**, report 0. Rows within 24 h → the number. Collapsing the first two
tells operators "NASA did not answer" on a day when NASA answered clearly.

---

## 3. Flood

| Source | Endpoint | Key | Gives | Failure mode |
|---|---|---|---|---|
| **ThaiWater v3** | `api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel` | **none** | **Measured** gauge levels: 43 Ping-basin gauges reporting in Chiang Mai, 8 on the mainstem. **Wired 2026-10-02** at `/api/cnx/river-level` | Values arrive as **strings**; `waterlevel_m` is null on every row while `waterlevel_msl` carries the reading. Shapes are not uniform (`river_name` is a bare string on 38 rows, null on 8). The bare path `…/thaiwater30` 404s — the router needs a sub-path |
| **Google Flood Hub** | `floodforecasting.googleapis.com` | `CNX_FLOODHUB_KEY` ✅ set | 7-day riverine model forecast at virtual gauges | Model only — 337 upper-north points, all HYBAS virtual, only 5 quality-verified, **none** of the 12 nearest Chiang Mai. No physical gauge |
| **JAXA GCOM-C SGLI AOT** | `s3.ap-northeast-1.wasabisys.com` (static STAC COG) | none | Newest scene, walked back from today, at `/api/cnx/jaxa-aot`. **Wired 2026-10-02 by operator decision** — see below. `license: proprietary` travels with the response |

**Measured river levels arrived on 2026-10-02.** Everything below this line
records what was believed before, and why it was wrong, because the error
is the reusable part.

### The feed that was written off as dead

`flood.ts` carried this header for months:

> *"The upstream ThaiWater/HII API requires a key we don't have on
> Cloudflare Workers"* … *"GET ThaiWater realtime (water.rid.go.th)"*

Both halves were wrong.

- **`water.rid.go.th` is a 1996 HTML frameset** pointing at
  `wmsc.rid.go.th` and `hits.html`. It was never an API, and naming it as
  the intended source meant the real one was never looked for.
- **No key is required.** The endpoints this board reads
  (`/public/waterlevel`, `/frontend/shared/tele_canal_station`) are the
  same paths the public website calls from a browser with no credential.
- **`thaiwater30` was never dead.** A probe of
  `api-v3.thaiwater.net/api/v1/thaiwater30` returns
  `404 Request to an unknown service`, which reads exactly like a renamed
  endpoint. The router dispatches on the **full sub-path**, so the bare
  name is unroutable while `…/thaiwater30/public/waterlevel` answers `200`
  with the national realtime feed.

The endpoint list was not guessed. It was read out of the public site's own
bundle (`www.thaiwater.net/dist/js/app.chunk.js`, 7.6 MB), which
enumerates the paths the site itself calls.

**The lesson: an unavailable feed is a claim about the integration, not
about the world.** Two people, handed the same 404, both concluded the data
did not exist.

### The edge rate limit, and what it cost to find

The feed is keyless and reachable — from this laptop, on every request
shape tried (plain curl, `Cloudflare-Workers` UA, no UA at all: `200` in
81 ms). **Deployed on Cloudflare Workers it returns `429`.**

    {"status":429,"contentType":"text/plain","head":"429:  การใช้งานถึง limit ที่กำหนด
     กรุณาติดต่อผู้ดูแลระบบ"}

*usage has reached the configured limit; please contact the administrator.*

The decisive measurement: **eight consecutive rapid requests from this
machine returned `200` in the same minute the Worker returned `429`** for
the same URL. So the limit is per source IP, and Cloudflare's egress
addresses are shared across many tenants. It is a property of where the
code runs, not of the data.

Three things followed, and only the first is a fix:

1. **Failures are cached for 30 minutes**, successes for 10. A board that
   re-polls an exhausted quota every 10 minutes stays blind forever and
   burns the whole budget being told no.
2. **The failure is named.** The first version reported "ThaiWater
   returned no data array" for both a network error and an empty
   response — asserting the source had answered when it had never
   arrived. `getJsonDetailed` now separates transport failure, non-200
   (with the status, and `429` called out as a throttle), and unparseable
   body.
3. **The panel says "this is a throttle, not the river"**, and the flood
   axis falls back to blind — which may not certify `safe`.

**Closed 2 October 2026 with the relay bake — the same pattern as flights.**
The feed works; running it from shared edge IPs throttles it. The durable
fix did not need a key or new infrastructure: the same launchd relay that
pushes flights (`scripts/relay-flights.mjs`) now also reads ThaiWater from
this building's residential IP — where the `429` does not apply — and
pushes the **raw** envelope into KV (`CNX_FLIGHTS_KV`, key
`river-level-latest`), which `fetchRiverLevel` reads **first**
(`river-level-kv.ts`). The projection, severity bands and note still run
at the edge in the same pure functions, so the relay cannot push numbers
that bypass the documented bank-geometry methodology — the same trust
boundary as the flights relay's. Copies older than 45 min fall back to the
direct read; from the edge that `429`s and the axis goes blind — honestly,
with the reason naming the throttle. The limitation above stands as
recorded for the record: it is why the relay tier exists.

**Finding it cost two deploys, because the symptom was a lie.** The first
production probe said "unavailable" with no reason, which is
indistinguishable from "the river is quiet". A throwaway diagnostic route
returning the raw status, content-type and body prefix found a `429` in
one request. The lesson: **when a live read fails, the reason must come
from the layer that failed.** A `null` that both means "no network" and
"empty response" will eventually be reported as the second one.

### What the payload actually contains

Measured against the live feed, not against documentation:

- **Population discipline.** `station_all?province_code=50` returns 627
  catalogue records; `tele_canal_station?province_code=50` returns **128
  telemetry stations**; `public/waterlevel?province_code=50` returns the
  **43 that reported** (46 province-wide, 43 of them in the Ping basin —
  the other 3 drain to the Kok). The 46 is a **subset** of the 128, never
  a rival count for it. But the panel does **not** say "43 of 128
  reporting", because **the catalogue endpoint returns no basin field** —
  `station_id, station_name, station_old_code, lat, long, geocode,
  province/amphoe/tumbon, agency_id, station_type, hydro_id, qmax` — so
  there is no way to ask it how many *Ping* gauges the province has. The
  first draft said "85 of the province's 128 telemetry stations reported
  nothing", which is **false**: most of those 85 are Kok and Chao Phraya
  stations that were never in scope. The 128 is now context only, and the
  coverage claim is exactly what the data supports.
- **Timestamps are ICT with no offset.** Read as UTC they land 7 hours in
  the future and every gauge renders as impossibly fresh. `parseIctStamp`
  attaches `+07:00` and converts. Range-checks components before
  `Date.UTC`, which would otherwise normalise `2026-13-45 99:99` into a
  perfectly plausible 2027 date.
- **`situation_level` is not a severity scale, and is not interpreted.**
  Measured across all 46 rows its ranges *overlap* — level 4 appears at
  0.88 m below bank and at 3.19 m, level 2 at 7.84 m — and every row says
  `ต่ำกว่าตลิ่ง`. The publisher's own bundle mentions it exactly once, as a
  `zIndexOffset`. It is a draw-order hint. It is carried as
  `sourceSituationCode`, labelled as undocumented, and never scored.
- **One real threshold exists.** P.1 สะพานนวรัฐ (Nawarat Bridge) publishes
  `critical_level_msl: 304.2` and `critical_level_m: 3.7` with
  `offset: 300.5` — and `300.5 + 3.7 = 304.2`, so the two published forms
  agree and the headroom in metres has a source authority behind it. The
  scenario's guessed "~3.5 m bank-full" was in the right neighbourhood of
  this real 3.7 m, and is now replaced by it.
- `diff_wl_bank` is **derived**, not an independent reading: it equals
  `min_bank − waterlevel_msl` on 46/46 rows. Verified arithmetically rather
  than trusted.

### The blind-axis rules, and how they changed

- A blind flood axis **scores 0** and never emits a measurement-shaped reason.
- A blind flood axis **cannot certify "safe"** — the level caps at `watch`
  with the reason *"No live river-gauge reading — this is not evidence the
  river is safe."*
- A **graded** gauge unblinds the axis and may support `safe`. A gauge that
  reports a level but publishes **no bank geometry does not** — an
  ungradable station is the same position as no station, and treating its
  presence as a measurement would let it certify safety off nothing.
- A measured gauge **never launders the scenario**. The scenario bank-full
  ratio, dam surge and 24 h rainfall all originate in a module that is
  still hash-seeded for two of its three domains, so they are gated on
  `flood.provenance === "live"` and stay silent beside a real reading.
  A mixed card — real river level, invented dam release — is the exact
  output this board refuses.
- A **calm** reading is appended **last**, after every measured domain. It
  was first appended inside the flood block, which put a river sitting
  comfortably below its bank at the top of the card, above a measured
  PM2.5 of 155 µg/m³.
- The scenario module survives as a last-resort fallback behind
  `provenance: "scenario"`, barred from the RAG corpus, the keystone
  story, and the flood↔air correlation. **`flood.ts:fetchLive()` is still a
  `return null` placeholder** — it is not what now carries the flood axis.

FloodHub remains escalate-only by construction: a forecast of flooding
raises the level, and the absence of one is never rendered as an all-clear.

**FloodHub's two hard limits**, stated on the panel:
1. Every point shown is unverified unless Google says otherwise — the note
   is computed from the points actually returned, so it self-corrects if
   Google ever validates a Ping point.
2. It forecasts **riverine flooding only**, not urban or flash flooding. The
   acute flood mode in a Thai city is street-level, and the board is silent
   about it.

**JAXA.** A static catalog of relative links on public S3, no API, no key,
`206` range-reads. Path is derived from the date and longitude band; the
Item's `href` is *relative*, which is why every flat shortcut 404s. The
asset declares its own sentinel: `dn.nodata = 65535`, `slope = 1e-4`
(range **0.001–5.0**; a `1e-5` reading would make every value 10× too small
and read a hazy 0.8 as a pristine 0.08). Gaps are **spatial** — 65535 pixels
where the swath saw cloud — not missing days; every date since 2018 resolves.

**The licence gate did not block deploying the resolver.** Access is what
generates the access log, so a module nothing calls generates nothing.
`bf01aac` added the module and its tests and nothing else, so it shipped as
unreferenced code and no request to Wasabi could be made from a request
path. **The gate applies to *wiring it to a route*, and the operator
approved that on 2 October 2026.** The resolver is deployed and reachable
at `/api/cnx/jaxa-aot` (newest scene, walked back from today, 30 min TTL
plus an s-maxage edge cache, so JAXA's access log sees a quiet tenant).

*Provenance of that decision, because it nearly went in wrong:* an earlier
draft of this file said the gate had been "called" on 2 October 2026 on
the strength of a commit message alone, when no decision had actually been
made. The sentence was corrected to say the decision was open, and the
operator was asked. The approval recorded above is the real one, given
directly. Nothing about this entry is inferred from a commit.

The route resolves WHICH scene exists, its observation window, and the
licence — it deliberately does not return an AOT value, because the value
lives inside the COG and decoding a GeoTIFF is work the Workers runtime
cannot do.

---

## 4. Flights and ground transport

| Source | Endpoint | Key | Gives | Failure mode |
|---|---|---|---|---|
| **OpenSky Network** | `opensky-network.org` | `OPENSKY_CLIENT_ID` / `_SECRET` ✅ | ADS-B state vectors | Low traffic at CNX: 2 airborne aircraft is a normal reading, not an outage |
| **adsb.lol** | `api.adsb.lol` | none | ADS-B backup | 403s intermittently; the relay falls back rather than going dark |
| **Arrivals** | derived from ADS-B | — | Flights/day by origin country | **Passenger counts are estimated** (seat capacity × 82% assumed load factor). Flight counts and origin countries are observed; visitor numbers are not, and the panel says so |
| **RainViewer** | `api.rainviewer.com` / `tilecache.rainviewer.com` | none | Live precipitation radar | Frame timestamps are the observation time, not the poll time |
| **Longdo** | `camera.longdo.com`, `map.longdo.com` | none | Public cameras, GISTDA PM2.5 tiles | 4 of 9 reachable at last check |

---

## 5. Civic, media and heritage

| Source | Endpoint | Gives | Failure mode |
|---|---|---|---|
| **data.go.th** | `data.go.th` (CKAN) | A **dated snapshot of one filtered Thai-language search** — 311 datasets when baked 2026-09-15, 316 on 2026-10-01, out of 44,207 in the catalogue (English "Chiang Mai" alone: 493) | Baked by a **manual** script (`npm run fetch:opendata`, no cron), so it drifts silently — the panel header now carries a `DataAge` stamp off the bake's own `generatedAt`, amber past 14 days. **It is not a population count and must never be rendered as one.** The empty-fallback path previously hardcoded `totalDatasets: 311`, which the panel header printed as `0/311` above an empty list; it now reports 0. Personal data must be redacted before publishing — withhold names, home addresses and mobile numbers; office landlines are fine |
| **GDELT + Google News RSS** | `api.gdeltproject.org`, `news.google.com` | Multi-language news | `tone: "demo"` cold-start placeholders exist and are badged — and are **excluded from the RAG corpus**, because a badged headline quoted as a citation launders a fabrication into a source |
| **Citizen / local media** | Reddit + news, geocoded to an OSM gazetteer | Place-pinned haze mentions | Precision radius is carried: a district-level mention is never drawn as a street address |
| **Haze-vision (CCTV)** | 4 cameras | Camera-derived haze estimate | Agreement is gated on a robust spread (`p95 − median ≥ 20`) **and** ≥3 unhealthy readings. Pearson against a near-constant response is uninformative, not a failed method |

---

## 6. Not currently usable

| Source | Status |
|---|---|
| **ASMC** (`api.haze.asean.org`, `api-asmc.onegeology.org`) | `needs-key`. The module returns an honest `needs-key` state rather than a fabricated reading |
| **GlobalMonitor / GlobeWatch** (`globalmonitor.fly.dev`, `globalmonitor.nonarkara.org`) | **Not wired, deliberately.** A global political/military feed. `fly.dev` is live (`theater: middleeast`, 200 aircraft); `nonarkara.org` is a stale snapshot (`fetchedAt: 2026-08-17`, `stale: true`, `liveError: api.adsb.lol 403`, `origin` empty). Neither answers "who is flying into CNX" — `/api/cnx/arrivals` already does, live, with an honest load-factor caveat |

---

## 7. Candidate sources audited 1 October 2026

Every candidate on the operator's referral list, probed directly. Status is
what the endpoint returned that day, not what it is advertised as. "No API
observed" means HTML responded and no machine-readable surface was found in
this pass — it is not a claim that no API exists anywhere.

| Source | Probe | Key | Verdict |
|---|---|---|---|
| **data.go.th** | CKAN `package_search` 200 | none | **Already wired** (baked). `count: 44,207` catalogue-wide |
| **gdcatalog.go.th** | CKAN `package_search` 200, `count: 25,022` | none | **New, live, keyless.** Best untapped source — see below. API host `gdcatalog.go.th`; **not** `data.gdcatalog.go.th`, which is NXDOMAIN |
| **World Bank** | `api.worldbank.org/v2` 200 | none | Live, keyless. **Annual and national** (THA 2025 population 71,619,863, `lastupdated 2026-07-13`). A national denominator, not a Chiang Mai one |
| **HDX** | CKAN 200, `q=Thailand` → 161 | none | Live, keyless, but humanitarian relief. Nothing Thai hazard-related of operational value |
| **OSM Overpass** | `api/status` 200, then a live query | none | **Already wired** — `waterways.ts`, `bus-routes.ts`. 5,323 waterways baked, 39 named Ping segments. Requires an identifying `User-Agent` |
| **OSM Nominatim** | 200 | none | **Already wired** (citizen-core gazetteer) |
| **Maholan flood CCTV wall** (`cctv.maholan.net`) | `/api/cameras` 200, ~906 KB, no filter params | none | **Wired 2026-10-02** — catalogue metadata only. 2,355 cameras nationwide, 9 in the CNX bbox. See below |
| **NSO** (สถิติแห่งชาติ) | `www.nso.go.th` 200 HTML | — | No machine-readable surface found; HTML only |
| **TAT** | `tatnews.org` 200 HTML (WordPress) | — | News site, not a data API |
| **NESDC** | 302 → `Location:` **itself** | — | **Redirect loop.** Unreachable. Not an access-control issue — the host is misconfigured |
| **Traffy Fondue** | `www.traffy.in.th` 200 (a Notion page); `api.traffy.in.th` 404 on `/` and `/v1/stations` | — | **No public API found.** The marketing site is a Notion export |
| **oss-local.info** | 200 HTML, 759 KB, Thai-language | — | Local media site, not a data source |
| **WAQI** | 200 — **and wrong** | demo | **Trap. Do not wire.** See below |
| **Air4Thai / DustBoy / Open-Meteo / GISTDA** | 200 | none | **Already wired** (§1) |
| **RID telemetry** (`telemetry.rid.go.th`) | no connection — `000` on `/`, `/rfw`, `/rfw/today.xml`, `/api`, http **and** https; `hydro-1.rid.go.th` same; `www.rid.go.th` 301 only; `tiwrm.hii.or.th` 200 (65 B) | — | **Unreachable at probe (2 October 2026).** The classic RID river-gauge telemetry host answers nothing from this network right now, so the live river-level feed that would close the blind flood axis (§3) stays unwired until a reachable endpoint is verified against its real response shape. §7's RID row covers the static flood-prone-area shapefiles — a hazard map, not a gauge feed |

### WAQI returns the wrong city

`https://api.waqi.info/feed/geo:18.7883;98.9853/?token=demo` — Chiang Mai's
coordinates — returns `status: ok` with:

```
city.name : Shanghai (上海)
city.geo  : [31.2047372, 121.4489017]
aqi       : 55
lat/lon   : null
attribution: China National Urban air quality real-time publishing platform,
             U.S. Consulate Shanghai Air Quality Monitor, …
```

The demo token ignores the requested coordinates and returns a fixed
Shanghai station, with **no lat/lon to catch it**. A panel wired to this
would render Shanghai's air quality as Chiang Mai's, at full authority,
and nothing in the payload would look wrong. This is the exact shape of
defect the board exists to prevent, and it fails silently. A real token
plus a distance assertion between requested and returned coordinates is
the minimum; until then WAQI is not usable.

### Overpass — already wired, and it demands a User-Agent

Overpass is **not** a new source: `waterways.ts` and `bus-routes.ts` already
use it, `waterways.ts:151` already sends the identifying header
`cnx-dashboard/1.0 (+https://cnx.nonarkara.org)`, and the baked extract
holds **5,323 waterways, 1,414 of them named**, including **39 segments of
แม่น้ำปิง** (Ping), generated 2026-09-16 over bbox 17.5–20.5 N /
97.5–100.5 E. A live re-query returns the same channels.

The one operational note: `POST` without an identifying `User-Agent`
returns **406 Not Acceptable** from Apache. An ad-hoc `curl` that omits the
header will read as "Overpass is down" when it is actually refusing an
anonymous client. The anonymous tier is also rate-limited from the
Cloudflare edge, which is why the baked extract exists as tier 2 and the
live call is last resort.

River **geometry** is not river **hydrology**. OSM carries no water level,
so none of this closes the blind flood axis.

### Public cameras — the Maholan wall

`cctv.maholan.net` is a community-operated aggregator of Thai flood and
road cameras. Probed 2026-10-01 and re-probed 2026-10-02: **2,355
cameras**, keyless, and every entry carries `lat`/`lng`, a `live` flag,
and the owning `source` agency. **Nine** sit inside the CNX bbox, six of
them live, most from the Royal Department of Highways (กรมทางหลวง).

`/api/cameras` takes **no filter parameters** — `bbox`, `region`, `q` and
`limit` are all ignored or rejected, and the app itself calls the bare
path — so the full 906 KB comes down and is filtered server-side to the
CNX operating area.

**Wired as catalogue metadata only.** Position, owning agency, stream type
and the aggregator's liveness flag. Three restrictions, all deliberate:

1. **No video is proxied.** The wall's own source comments record it
   fighting ~300 Mbps of origin uplink. A second consumer pulling HLS adds
   load to a volunteer server for no gain — the map needs positions, not
   frames. The streams also belong to the agencies that run them.
2. **15-minute poll.** That is ~87 MB/day against a community host, which
   is a fair thing to cost. The cost is that the `live` flag is at most
   15 minutes old, so the response carries `cataloguedAt` and the panel
   ages it.
3. **The `live` flag is passed through, never inferred.** Offline cameras
   are shown hollow, not omitted, and each says it cannot confirm the
   road — a dead camera that looks live sends someone down a flooded
   street.

An empty province is `provenance: "live"` with zero cameras, because the
source answered and said it has nothing there. Only a transport failure is
`unavailable`. Those are different states and conflating them is how "no
coverage" becomes "all clear".

**Credit.** Cameras via the Maholan Flood CCTV Wall; operated by the
agencies named per camera (กรมทางหลวง / DOH, ThaiWater–EGAT–DWR).

**Legal — stated as intended use and terms-as-published, not as a licence
we hold.** The wall publishes no API terms, so there is nothing to cite
and nothing to claim. What goes on a public page is what we do with the
data and who holds the rights: public-goods haze and flood situational
awareness in Chiang Mai; positions and liveness read to help decide road
openings, flood detours and air-quality field checks; no video mirrored,
recorded, stored or redistributed; nothing sold; nothing used to identify
or track any person. Reuse beyond that should be agreed with the
aggregator and the named agencies first.



`gdpublish-69-162`, published by **จังหวัดเชียงใหม่** (Chiang Mai
Province), licence **Open Data Common**, `metadata_modified 2026-09-22`,
one CSV, 20 rows in long format (`year, h_census, value, unit, source`).

Working hosts — the only two, and the addresses a reader needs to reproduce
any of this. `data.gdcatalog.go.th` is **NXDOMAIN**; do not construct it
from the portal's name:

```
gdcatalog.go.th         A 164.115.45.96          CKAN API
chiangmai.gdcatalog.go.th  CNAME -> assix.gdcatalog.go.th   file host
```

```bash
# 1. resolve the dataset id from the portal (pass the THAI title, not the id)
curl -sG https://gdcatalog.go.th/api/3/action/package_search \
  --data-urlencode 'q=สถิติการใช้บริการท่าอากาศยานเชียงใหม่' --data-urlencode rows=1
#    -> name: gdpublish-69-162

# 2. the CSV lives on the per-region host, not the portal
curl -sSL 'https://chiangmai.gdcatalog.go.th/dataset/31589d3f-bb1b-4eee-909d-b4b1b205e2ca/resource/3314ba55-e3c3-4049-b59d-9f19e6d6240a/download/untitled.csv'
#    -> 200, 4105 bytes
```

| BE year | CE year | Passengers | Flights |
|---|---|---|---|
| 2564 | 2021 | 11,339,704 | 79,535 |
| 2565 | 2022 | 4,851,624 | 39,455 |
| 2568 | 2025 | 8,624,573 | 55,663 |

**The `year` column is Buddhist Era.** 2568 is 2025. A parser that renders
it raw puts "2568" on a governor's dashboard. Any consumer must subtract
543.

What this is good for: an **official, published denominator** for the
arrivals panel, which currently derives passengers from seat capacity × an
assumed 82% load factor. 2025 works out at **154.9 passengers per flight**
airport-wide, both directions — consistent with a mean of roughly 189
seats at the assumed 82%, so the assumption sits in a defensible band.
It also shows traffic is still well below 2021 (8.62 M vs 11.34 M pax).

What it is **not**: live. It is annual and complete only to 2025, and it
is airport-wide (arrivals **and** departures) while the arrivals panel
counts arrivals by origin. It bounds the estimate; it does not replace the
daily figure. `h_census` is a metric-label column, not a census.

### Flood-prone areas — thin, and mostly not a feed

Enumerated as **populations, not samples** (every result fetched for each
series, `len(fetched) == count`):

- `พื้นที่เสี่ยงอุทกภัย` — 27 datasets, 22 publishers. Chiang Mai is **not**
  among them (กรมทรัพยากรน้ำ and provinces including Krabi, Kalasin,
  Khon Kaen, Chanthaburi, Chaiyaphum, Trat, Nakhon Phanom,
  Nakhon Ratchasima, Nakhon Si Thammarat, Phatthalung, Lampang,
  Sisaket, Songkhla …).
- `พื้นที่เสี่ยงน้ำท่วม` — 12 datasets, 7 publishers. Chiang Mai is **not**
  among them (กรมทรัพยากรน้ำ, สถาบันสารสนเทศทรัพยากรน้ำ, and
  Nakhon Phanom, Y_sothon, Sisaket, Songkhla, Phetchabun).
- `น้ำท่วม` — 270 datasets total, all 270 fetched. **Exactly one** is
  published by จังหวัดเชียงใหม่.

That one is `สารสนเทศในรูปแบบแผนภาพสาธารณภัย ด้านอุทกภัย`
("public-safety thematic map: floods"), Open Data Common, updated
2026-09-04 — and its single resource is a **Power BI embed**
(`app.powerbi.com/view?r=…`), not a file.

So an official provincial flood map *does* exist and is publicly linkable,
which is worth having as a citation on the flood desk. It is **not** a data
feed. The numbers live inside Power BI's own storage, reachable only via
undocumented `bootstrapConfig` / `querydata` calls that would break without
notice. CNX should link the map; it should not build a production source on
the embed's internals.

The national layer `พื้นที่เสี่ยงภัยแล้ง/น้ำท่วม` from **กรมทรัพยากรน้ำ**
(Royal Irrigation Department), updated 2026-08-11, does cover the province
and ships as `.rar, .shp` — a real shapefile, in a container format neither
the Workers runtime nor standard tooling unpacks without a dedicated
binary.

A flood-prone-area layer is a **static hazard map**. It says where flooding
has historically been possible. It is not a forecast and not a
measurement, and must never be rendered as current conditions or as
"this will flood".

---

## 8. Licensing

- **FloodHub** — data CC BY 4.0; **API terms limit use to non-commercial.** Fine for a civic dashboard; a licensing question before any paid deployment.
- **JAXA GCOM-C** — declares `license: proprietary`, and access generates a text access log. **Wired 2 October 2026 by operator decision** at `/api/cnx/jaxa-aot`; the licence travels with the response, and the route is rate-limited (30 min TTL + edge cache) to keep the access log quiet.
- **Chiang Mai airport statistics** (gdcatalog `gdpublish-69-162`) and the **provincial flood thematic map** (`gdpublish-69-200`) — both **Open Data Common**, both published by จังหวัดเชียงใหม่. Clean.
- **gdcatalog.go.th** — per-dataset licences, not uniform; read `license_title` per package rather than assuming a portal-wide grant.
- **FIRMS, GIBS, Open-Meteo, OSM, GDELT, RainViewer** — open, all attributed on the panels and in the About sources list.
