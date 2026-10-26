# The Chiang Mai War-Room Bible

> A governor-grade real-time operations dashboard for Chiang Mai
> province (เชียงใหม่), live at `cnx.nonarkara.org`.
>
> This document is the **study guide**. It is the canonical reference
> for what every stream is, where the data comes from, how to wire a
> new feed, and how to read the dashboard. Future operators read this
> before they touch a line of code.

## 0. How to read this document

- Sections 1–6 describe the **what**: the streams, the panels, the data shapes.
- Sections 7–8 describe the **how**: how to add a feed, how to add a panel.
- Section 9 is the **operational doctrine**: which decisions come from which stream.
- Sections 10–12 are the **LOD pattern**: how this becomes a template for every
  next city dashboard (Phuket, Khon Kaen, Surat Thani — same shell, different
  data, marginal cost per new city → zero).

If you read only one paragraph:

> The CNX dashboard is a **map-first, scenario-aware** war room. Every
> number must distinguish measured, modeled, scenario and unavailable data;
> every dataset has a written owner; every panel
> corresponds to a single decision the governor or a deputy might make
> in the next 24 hours.

---

## 1. The streams

| Stream | What it tells you | Source | Refresh |
|---|---|---|---|
| **Fire safety (RFD)** | Active forest fires in CNX province, Thai forest-tenure class (DNP / NRF / ALOW / CMF / FIO) | [wildfire.forest.go.th/firemap/getdb.php](https://wildfire.forest.go.th/firemap/) | 30 min |
| **Fire safety (FIRMS)** | Global VIIRS/MODIS hotspots — independent confirmation | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov) | 10 min |
| **Aerosol / AOD** | Sampled CAMS grid-point 550 nm column AOD (model; not surface PM2.5) | Open-Meteo CAMS | 30 min |
| **Flood (Ping)** | **Measured** gauge levels (ThaiWater v3) + Google Flood Hub riverine forecast at virtual HYBAS gauges — see §3 | `api-v3.thaiwater.net` (keyless) + [floodforecasting.googleapis.com](https://developers.google.com/flood-forecasting) | 10 min |
| **Air quality** | PM2.5 / PM10 / O3 / NO2 — province + per-station | Open-Meteo CAMS + PCD Air4Thai + CMU CCDC DustBoy | 5 min |
| **CCTV** | Dynamic camera catalogue + independently reported availability | Longdo / iTIC / TAT / YouTube | 1 min |
| **Flights** | Real-time airspace count over the CNX bbox, plane size buckets | [OpenSky Network](https://opensky-network.org) | 30 s |
| **Heritage** | 12 curated temples / parks / waterfalls / gates | static (curated) | 24 h |
| **Weather overlays** | Live rain radar + Himawari-9 IR + MODIS AOD raster tiles on the map | RainViewer + NASA GIBS | 3 min |
| **Open Data** | Dated catalogue snapshot on data.go.th matching `เชียงใหม่` / `Chiang Mai` | [data.go.th CKAN](https://data.go.th) | on-demand (`npm run fetch:opendata`) |
| **Social listening** | Thai + English + GDELT mentions of Chiang Mai | Google News RSS + GDELT 2.0 | 3 min |
| **Story** | Keystone narrative + actionable bullets, computed from live state | derived | 3 min |
| **Ticker** | One-line marquee of every stream's headline number | derived | 1 s |

Each of these lives in `src/lib/cnx/<name>.ts`. The shape of the response is
in `src/types/cnx.ts`.

---

## 2. The fire safety desk (governor priority #1)

The fire desk has three sub-views because fire safety in CNX is not a
single number — it is a layer cake:

1. **Where is it burning?** — RFD hotspots from the Royal Forest Department
   with the Thai forest-tenure class. This is what tells you whether
   the fire is on a DNP conservation boundary or on agricultural land.
2. **How is the air?** — Fresh PCD and DustBoy ground readings describe
   surface PM2.5. CAMS model AOD describes aerosol through an atmospheric
   column; it does not establish surface health risk, a fire cause, or
   what will happen by morning. Missing values remain unavailable.
3. **What is the global satellite saying?** — NASA FIRMS as an independent
   check. If FIRMS and RFD disagree, the forest officers should be paged.

### Severity table (used in CNXFirePanel)

| Tenure / Source | Severity | Action |
|---|---|---|
| DNP (อุทยานแห่งชาติ) | critical | Page the national park chief |
| NRF (ป่าสงวนฯ) | critical | Page the Royal Forest Department Region 1 |
| ALOW (ป่าส่วนราชการ) | alert | Stand up the Chiang Mai fire task force |
| CMF (ป่าชุมชน) | alert | Notify the village head |
| FIO (อ.อ.ป.) | watch | Notify the FIO regional office |
| AOD ≥ 0.4 | high model-column aerosol | Cross-check ground PM2.5; no official deployment inferred |
| AOD ≥ 0.25 | elevated model-column aerosol | Cross-check ground readings and official health guidance |
| AOD < 0.10 | low model-column aerosol | Does not establish clean surface air |

---

## 3. The flood desk

> **This section has been wrong twice, and both errors are recorded here
> because the second one is more instructive than the first.**
>
> *Wrong until 2026-10-01:* it read *"The Ping river at Nawarat Bridge is
> the keystone number. Bank-full is 3.5 m…"* as though that described a
> measured gauge. It described the **scenario** module — hash-seeded
> numbers — as though it were a reading. It was not one.
>
> *Wrong again until 2026-10-02:* the correction said "There is **no
> physical gauge anywhere in CNX** — no ThaiWater feed is wired, and
> nothing fetches `api-v3.thaiwater.net`." That was **false**, and so was
> the reason it was believed. The flood module header claimed ThaiWater
> "requires a key we don't have", and pointed at `water.rid.go.th` as the
> source. Both were wrong: **the feed is keyless**, `water.rid.go.th` is a
> 1996 HTML frameset that was never an API, and
> `api-v3.thaiwater.net/api/v1/thaiwater30` was never a dead service — the
> router dispatches on the full sub-path, so the bare path 404s while
> `…/thaiwater30/public/waterlevel` answers 200. The working endpoint list
> was read out of the public site's own JavaScript bundle.
>
> The lesson worth keeping: **an unavailable feed is a claim about the
> integration, not about the world.** Two engineers, given a 404, both
> concluded the data did not exist.

The Ping basin floods seasonally (May–October). The board now has **two
different things**, and they must never be confused:

1. **Measured levels** — 43 Ping-basin gauges reporting in Chiang Mai
   province (8 on the mainstem), from **ThaiWater v3**, keyless and public.
   One of them, **P.1 สะพานนวรัฐ (Nawarat Bridge)**, publishes an official
   **critical level of 304.20 m** above sea level. That is the only number
   on this board about the river that carries an authority, and it comes
   from the station whose guessed 3.5 m bank-full figure the scenario used
   to carry — the real published threshold is **3.7 m**.
2. **Modelled forecast** — Google Flood Hub, a 7-day riverine *model* at
   virtual HYBAS gauges. Still escalate-only, still not street flooding.

Consequences, all enforced in code:

- A blind flood axis **scores 0**, emits no observation-shaped reason, and
  **cannot certify "safe"** — it caps at `watch`.
- A **graded** gauge reading unblinds the axis and may support `safe`.
  A gauge that reports a level but publishes **no bank geometry cannot** —
  an ungradable station is the same position as no station at all.
- The measured reading **never launders the scenario**. The scenario's
  bank-full ratio, dam surge and rainfall all come from a module that is
  still hash-seeded for two of its three domains, so they stay silent
  beside a real gauge.
- A **calm** reading is appended **last** in the verdict reasons, behind
  every measured hazard. A governor reads the headline first and often
  alone; an absence of flood trouble must never occupy that slot.
- The Thai Meteorological Department's warnings **are** machine-readable:
  signed CAP 1.2 alerts behind two RSS indexes (`tmd.go.th/api/xml/CAP`,
  `/en/api/xml/CAP`). Since 11 October 2026 they are wired at
  `/api/cnx/official-warnings` (`src/lib/cnx/tmd-cap.ts`) and lead the
  watch board as their own framed row, *ประกาศทางการ · กรมอุตุนิยมวิทยา*,
  above every model and measured row, with the alert areas outlined on the
  map. No alert reads "ไม่มีประกาศ TMD ที่มีผลสำหรับเชียงใหม่", never
  "safe"; an unreadable feed reads unavailable. The dashboard **never
  renders its own threshold as a government announcement** — only TMD's
  own CAP text sits in that row. Its own
  warnings leave as CAP with `scope=Restricted` (`/api/cnx/cap.xml`).
  (An earlier version of this line said no such feed existed — see
  `docs/DIGITAL-TWIN-STANDARDS.md`, D3.)

The scenario module still exists as a last-resort fallback, always behind
`provenance: "scenario"`, and is barred from the RAG corpus, the keystone
story, and the flood↔air correlation.

(Ping levels in `src/components/CNX/CNXRiverLevelPanel.tsx`; the source
module is `src/lib/cnx/river-level.ts`, which owns its own credit and
terms and is rendered verbatim wherever the gauges appear.)

## 3b. The map — why the mountains are 3D

Four basemaps (`src/services/basemap-styles.ts`), all keyless:

| Basemap | Raster | Terrain 3D | Hillshade |
|---|---|---|---|
| **Topography** (default) | OpenTopoMap | **yes** | **yes** |
| Satellite | Esri World Imagery | yes | yes |
| Vegetation | Esri World Imagery | yes | yes |
| Street | OpenFreeMap vector (remote style) | no | no |

Elevation comes from **AWS Terrain Tiles (Terrarium)**, a keyless DEM
MapLibre reads natively. Measured directly from the tiles: **1,536 m at
Doi Suthep against 340 m on the Old City floor** — roughly 1,200 m of
relief inside the operating area.

This is not decoration. Chiang Mai is a basin ringed by mountains, and
the same topography drives the two things the board is for:

- **Haze.** Cold-air pooling in a valley is why PM2.5 concentrates in
  the city while the ridge stays clear. A flat map cannot show that; a
  pitched one makes the basin legible at a glance.
- **Flood.** Water follows the valley floor. Knowing which ridges the
  Ping can *not* reach tells the operator where to send a detour.

Terrain was satellite-only until 2026-10-01, so the **default** basemap
had neither 3D nor hillshade — the mountains were the reason to pick a
topographic map, and they were the one thing it did not show.

---

## 3c. The temple compounds — a model that says so

The 3D city layer draws every mapped place of worship as a **compound**, not
as a block. A walled enclosure on the mapped boundary, a gate on the axis, a
courtyard, the main hall at the far end, flanking side halls, and a tower in
the court.

The order is the one a Lanna wat and a **northern Chinese** Buddhist temple
share — which is why the Chinese form is a usable reference for a Thai one.
It is a model of how a temple compound is arranged, and the board's rule
applies to it without exception:

| what | provenance |
|---|---|
| the boundary, and any building OSM maps inside it | **measured** — an OpenStreetMap footprint |
| the wall's thickness, the gate, the roof overhangs, a tower where OSM maps none | **model** — the grammar's own |
| a mapped footprint's height | **osm** if the tag exists, otherwise the extract's 9 m default, declared as a **fallback** |

Only **12 of 1,866** measured parts carry a mapped height: OSM tags a
footprint and rarely its height. That limit is declared on every part rather
than smoothed over, and the map styles modelled parts a few shades back from
measured ones so the difference is visible without opening a panel.

Three rules the grammar obeys that are worth stating:

- **A stupa only goes where a stupa belongs.** The tower is a Buddhist form
  (a pagoda in the Chinese case, which is the same religion's architecture).
  A church or a mosque gets its mapped buildings and no tower.
- **An absent tag is not an absent religion.** An untagged site still gets
  its tower; only an explicitly non-Buddhist one does not.
- **No temple may vanish.** All 474 mapped places of worship are in the
  layer, as a compound or as the single building it is. A wat that
  disappeared would read as "there is no wat here", and absence is not
  evidence.

The grammar is `src/lib/cnx/temple-compound.ts`; the baked output is
`public/data/cnx/temple-compounds.geojson`; the renderer that can see it
without booting the board is `scripts/preview-temple-compounds.mjs`.

---

## 3d. The roofs — a model that says so

A roof is the one thing a footprint cannot tell you. Measured over the
Old City sample (18.78–18.80 N, 98.97–99.00 E) with Overpass on
24 October 2026:

| tag | buildings | share |
|---|---|---|
| any building | 8,914 | — |
| `roof:shape` | 9 | 0.10 % |
| `roof:height` | 0 | 0 % |
| `roof:colour` | 5 | 0.06 % |
| `roof:material` | 1 | 0.01 % |
| **any roof tag** | **23** | **0.26 %** |

So the board does not read roof geometry off the map, because the map does
not hold it. It **models** the roof, and it says so in three places: the
click card, the symbol key, and the roof table's own `note` field. A roof
drawn here is an assertion about a form, not a measurement of one.

### The rule

The rule is borrowed from the QGIS **3D OSM Model** plugin, which moved
away from "a pyramid on every block" for exactly this reason — house-like
buildings get a pitched gable, everything else a flat roof, and the result
"reads far more like a real city".

| the building is | its roof |
|---|---|
| house-like (`house`, `detached`, `terrace`, `dormitory`, `hut`, …) | gable |
| plainly not a house (`apartments`, `commercial`, `industrial`, `hotel`, …) | flat |
| untagged, small and low | gable |
| untagged, over 500 m² | flat |
| any type, more than 3 storeys | flat |

Over the whole city that is **61,257 roofs — 84.6 % gable, 15.4 % flat**:
59,344 city roofs (49,891 gable, 9,453 flat) and 1,913 temple roofs,
every one of them a gable — 1,039 halls, 582 side halls, 292 gates. **A
temple roof is never flat.**

### The height is never inflated

OSM's `height` is the total, roof included. So the roof is carved **out**
of it: the wall is `height − roof_rise`, and the ridge lands back on
`height`. Nothing is added to a building that the data did not say. If the
roof table or the renderer fails, the board falls back to the full height
and says so in a banner, rather than drawing a building taller than the
record.

### The shapes

Each roof sits on the **minimum-area rectangle** that contains the
footprint — the tightest rectangle that still covers it, which yields the
ridge direction and the span in one pass. The ridge runs along the long
side, the way an ubosot's does. Measured over 8,793 Old City buildings,
the median rectangle-to-footprint area ratio is **1.002**; 2.5 % of
buildings exceed 1.5× and 0.4 % exceed 2×, and those are the ones whose
roof visibly overhangs its walls.

A temple's roof is the grammar's own: a steep gable over the hall, a
shallower one over each side hall, a small one over the gate, and for a
hall with no mapped footprint a second, receding tier — the stepped roof
a Lanna hall actually has. The **tower is not a roof**: a chedi is a
stepped square monument, four receding tiers, and it is modelled as mass,
not as a cap. A stupa only goes where a stupa belongs.

### How it is drawn

MapLibre's `fill-extrusion` extrudes a plan straight up, so it cannot
make a slope; and deck.gl's canvas sits over the map and would never
depth-interleave with MapLibre's own extrusions. So the roofs are a
**MapLibre custom layer** (`src/lib/cnx/roof-layer.ts`) that draws into the
map's own WebGL context and therefore shares its depth buffer. The roof
sits on the wall and a wall in front of a roof hides it. Two instanced
meshes — a gable prism and a flat cap — cover the city in two draw calls.

**No third-party asset is used.** The geometry is generated in-repo from
OpenStreetMap footprints (ODbL), so there is no asset licence to carry.
The only borrowed thing is the *rule* above, which is an idea, not a file.

### Two tables, fetched when they are needed

`roofs-temple.json` (98 KB) comes with the compound layer, which is on by
default. `roofs-city.json` (3.17 MB) comes with the 3D city, which is
not. The city roofs are split into the same groups as the city blocks —
core above zoom 13, fringe below — so at most one of the two is ever in
the buffer.

### Where the roofs are refused

On a **terrain** basemap the roofs are refused, and the board says so. A
DEM displaces the ground; the roofs carry above-ground-level heights only.
Inventing ground offsets to make them line up would be a guess, so the
board shows full-height native buildings under a "3D roofs unavailable"
banner instead. This is a coverage limit, and it is a limit on two of the
board's basemaps — the satellite and the topography.

### The files

| what | where |
|---|---|
| the grammar | `src/lib/cnx/roof.ts` |
| the renderer | `src/lib/cnx/roof-layer.ts` |
| the shared metric helpers | `src/lib/cnx/geo.ts` |
| the city bake | `scripts/build-cnx-roofs.mjs` |
| the compound bake | `scripts/build-cnx-temple-compounds.mjs` |
| the baked tables | `public/data/cnx/roofs-city.json`, `public/data/cnx/roofs-temple.json` |

The bake order is **fetch → compound bake → roof bake**. The roof bake
reads the compound bake's output, so it must run last.

---

## 4. The flight desk

Flight availability and quota depend on the selected upstream and its
current account limits; per-display requests must not be assumed to fit a
free allowance. ADS-B provides observed aircraft, not passenger nationality
or confirmed airport arrivals. Aircraft seats are capacity estimates.
Carrier or registration country is not the departure airport.

The snapshot writer stores small poll summaries in uncompressed
`/Volumes/Data/CNX/flight-snapshots/YYYY-MM-DD.ndjson`; the edge fallback is
process memory, not durable history. No measured 8 TB/year figure or
validated tourism/pandemic prediction is claimed.

---

## 5. The social listening desk

Three sources, by language priority:

1. **Thai** (`q=เชียงใหม่`) — the local language. Highest signal, lowest
   noise.
2. **English** (`q=Chiang Mai`) — international tourism + expat media.
3. **GDELT** — global English-language media monitoring with tone (-10…+10).

Phase 6 expansion: detect the **top-N origin countries** from the
flight desk and subscribe to Google News in each of those languages
(中文, 日本語, 한국어, русский, Deutsch, Français, etc.). The flight desk
drives the social listening subscription list.

---

## 6. The CCTV strip

12 corridor slots; each falls into a category (heritage / traffic / highway /
flood / tourism) with a coloured stripe matching its category.

Phase 6 expansion: pull open YouTube live streams from Wat Phra Singh,
Doi Suthep, Tha Phae Gate — embed them as `<iframe>` cards under the
`tourism` category so the operator can see what tourists see.

---

## 7. How to add a new feed (the SSDIY loop)

1. Write the fetcher in `src/lib/cnx/<name>.ts`.
2. Add the response type in `src/types/cnx.ts`.
3. Add the API route at `src/app/api/cnx/<name>/route.ts`.
4. Add the panel at `src/components/CNX/<Name>Panel.tsx`.
5. Wire the panel into `CNXApp.tsx` and (if you want a TopBar pill)
   into `CNXTopBar.tsx`.
6. `tsc --noEmit` clean → `git commit` → push → deploy.

Each step is a single committable change. Re-run any step independently.

---

## 8. How to add a new city (the LOD pattern)

Every city dashboard in the nonarkara family (KMITL, Chula, Lopburi, Phuket,
CNX, future Surat Thani / Khon Kaen / Samui) shares:

- `src/lib/<city>/<topic>.ts` — same shape, different upstream URL.
- `src/components/<City>/<Topic>.tsx` — same panel, different colour.
- `src/app/<city>/page.tsx` — the entry route.
- `wrangler.<city>.jsonc` — the Cloudflare worker config.
- `public/data/<city>/` — the local mirrors.

The cross-city primitives (Map engine, top bar shell, ticker, story
keystone, manual modal) **live in the Lopburi repo and are copy-pasted
per city**, not extracted into a shared package. The marginal cost
per city is approximately zero; the divergence risk of a shared
package is not worth the build-time saving.

---

## 9. Operational doctrine

The dashboard is a decision aid, not a decision. The numbers exist to
shape one or more of:

1. *Page who?* — which agency / office / chief needs to be activated.
2. *Brief whom?* — what does the governor's morning brief say today.
3. *Allocate what?* — N95 masks, sandbags, mobile clinic hours.
4. *Open what road?* — Highway 11 vs. Highway 21 detour decisions.

Every panel in this dashboard corresponds to one of those four
decisions. The keystone story (the `S` keyboard shortcut) is the
narrative version of "what is the governor's morning brief today?"

---

## 10. The Bible itself — how to update

If you change a panel, a feed, a severity threshold, or an upstream
URL, update Section 1 (Streams) and Section 9 (Doctrine) in the same
commit. The Bible is a living document; it is wrong by the time you
ship unless it is part of the commit.

The Bible lives at `docs/WAR-ROOM-BIBLE.md`. Print it. Pin it.
Re-read it every time you touch a new city.

---

## 11. The Lopburi-to-CNX lineage: what's shared, what's different

| | Lopburi | CNX |
|---|---|---|
| Shell grammar | map-first war-room | map-first war-room |
| Lanna-blue + Doi Suthep gold | no | yes |
| Thai-flag blue + warm paper | yes | no |
| FIRMS hotspots | yes | yes (overlaid with RFD) |
| Thai RFD fire data | yes (later) | yes (priority #1) |
| Flood | Pa Sak basin | Ping basin |
| Heritage sites | 12 Lopburi temples | 12 Chiang Mai sites |
| Open Data | Lopburi province | CNX province |
| Stories | 3 scenarios | 4 scenarios (burning / monsoon / Songkran / winter) |
| Multilingual social | Thai + EN | Thai + EN + (Phase 6: flight-origin languages) |
| Bus routes | no | yes (Phase 6) |
| Durable raw-flight history | no | requires a separate archive |
| RAG chatbot | no | yes (Phase 6) |

The "what's different" column is where the design decisions for the
**next** city dashboard are concentrated. Most cities will share
Lopburi's shell and add 2–3 new streams. CNX is the most fire-aware
city so it has the most fire-stream investment; Surat Thani's
dashboard will have more fishing-fleet investment, Khon Kaen's more
rice-harvest investment, and so on.

---

## 12. The future dashboard family

CNX is the **second city** in the nonarkara dashboard family (after
KMITL / Chula / Lopburi). The next three are:

- **Surat Thani** — south-coast island tourism + fisheries + tropical storm
- **Khon Kaen** — northeast Isaan rice harvest + Mekong tributary flood
- **Koh Samui** — small-island tourism + aviation (USM) + monsoons

Each is a fork of the CNX codebase with the streams re-shaped for the
city's geography. **Marginal cost per new city → approximately zero.**
The Bible gets one new section per city.

— Last updated: 2026-09-15
— Owner: Dr Non, depa Senior Expert, https://nonarkara.org