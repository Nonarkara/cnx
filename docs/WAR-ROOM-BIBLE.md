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
> number on it is live; every dataset has a written owner; every panel
> corresponds to a single decision the governor or a deputy might make
> in the next 24 hours.

---

## 1. The streams

| Stream | What it tells you | Source | Refresh |
|---|---|---|---|
| **Fire safety (RFD)** | Active forest fires in CNX province, Thai forest-tenure class (DNP / NRF / ALOW / CMF / FIO) | [wildfire.forest.go.th/firemap/getdb.php](https://wildfire.forest.go.th/firemap/) | 30 min |
| **Fire safety (FIRMS)** | Global VIIRS/MODIS hotspots — independent confirmation | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov) | 10 min |
| **Aerosol / AOD** | Province-average 550 nm aerosol optical depth (burning-season haze proxy) | Open-Meteo CAMS | 30 min |
| **Flood (Ping)** | Ping river gauges + rainfall + Bhumibol / Sirikit / Mae Kuang storage | ThaiWater / HII (scenario fallback) | 1 min |
| **Air quality** | PM2.5 / PM10 / O3 / NO2 — province + per-station | Open-Meteo CAMS + PCD | 5 min |
| **CCTV** | 12 corridor cameras + reachable/live count | Longdo / iTIC / TAT / YouTube | 1 min |
| **Flights** | Real-time airspace count over the CNX bbox, plane size buckets | [OpenSky Network](https://opensky-network.org) | 30 s |
| **Heritage** | 12 curated temples / parks / waterfalls / gates | static (curated) | 24 h |
| **Open Data** | 311 datasets on data.go.th matching `เชียงใหม่` / `Chiang Mai` | [data.go.th CKAN](https://data.go.th) | on-demand (`npm run fetch:opendata`) |
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
2. **How is the air?** — AOD (aerosol optical depth) at 550 nm. PM2.5 is
   the ground-truth for "is the city breathing?" but AOD is the satellite
   proxy that fires 24 h ahead. When AOD rises above 0.25, burning is
   active somewhere in the province; when above 0.4, the city will
   suffocate by morning.
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
| AOD ≥ 0.4 | critical | PCD mobile units at Chang Phueak / Tha Phae gates |
| AOD ≥ 0.25 | alert | N95 distribution at public hospitals |
| AOD < 0.10 | good | Normal posture |

---

## 3. The flood desk

The Ping basin floods seasonally (May–October). Six gauges in the
province feed into the dashboard; Bhumibol + Sirikit dams are the
national-scale storage buffer; Mae Kuang is the local reservoir.

The Ping river at Nawarat Bridge is the keystone number. Bank-full is
3.5 m; below 60% capacity = normal; above 70% = watch; above 85% = alert.

(Full Ping dashboard exists in `src/components/CNX/CNXFloodPanel.tsx`.)

---

## 4. The flight desk

OpenSky Network's anonymous tier gives 400 credits/day. A 30-second
poll costs ~4 credits per call. One wall display = one poll = ~28k
credits per day = well within budget. The plane-size breakdown
(ATR / A320 / B777 / A380) drives the **tourist origin / plane size**
analysis that the governor wanted.

A future expansion (Phase 6) snapshots every flight into
`/Volumes/Data/CNX/flight-snapshots/YYYY-MM-DD.ndjson.gz` — about 8 TB
of trend data per year, which becomes the corpus for predicting
tourism surges, viral-outbreak movements, and pandemic inflows.

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
| 8 TB flight snapshots | no | yes (Phase 6) |
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