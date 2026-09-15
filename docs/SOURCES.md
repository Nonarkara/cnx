# CNX Dashboard — External Sources

> What we already wire, and what's worth adding next. Sources the
> governor's priority list (pandemic / international crime / Chinese
> / Japanese / Korean news) maps to specific public feeds.

## Live operational sources (already wired)

| Source | Used by | Endpoint | Auth |
|---|---|---|---|
| NASA FIRMS | Fires panel, map | firms.modaps.eosdis.nasa.gov | Map key (`FIRMS_MAP_KEY` env) |
| Royal Forest Department | Fire safety panel | wildfire.forest.go.th/firemap/getdb.php | none |
| Open-Meteo CAMS | Air quality + AOD | air-quality-api.open-meteo.com | none |
| ThaiWater / HII | Flood panel | water.rid.go.th (scenario fallback) | key TBD |
| NASA GIBS | Satellite layer | gibs.earthdata.nasa.gov | none |
| Longdo CCTV | CCTV strip | longdo.com/services/cctv | key TBD |
| iTIC | CCTV strip | itic.traffic.rid.go.th | key TBD |
| OpenSky Network | Flight panel | opensky-network.org | anonymous |
| Google News RSS | Social sidebar | news.google.com/rss | none |
| GDELT 2.0 | Social sidebar | api.gdeltproject.org | none |
| data.go.th (CKAN) | Open Data panel | data.go.th/api/3/action | none |
| OSM Overpass | Bus routes, buildings | overpass-api.de | none |

## Recommended next sources (priority 2 gaps)

### Pandemic / public health

| Source | What | Endpoint | Auth |
|---|---|---|---|
| **WHO Disease Outbreak News** | Global outbreak alerts | who.int/emergencies/diseases | none |
| **Thailand MOPH COVID-19 dashboard** | Thai daily case counts | covid-19.ddc.moph.go.th | none |
| **GISAID** | Genomic surveillance of influenza / SARS-CoV-2 | gisaid.org | free academic |
| **FluNet / WHO FluID** | Global ILI / SARI surveillance | who.int/influenza | none |
| **ProMED-mail** | Outbreak reports by topic + region | promedmail.org | free signup |

### International crime / security

| Source | What | Endpoint | Auth |
|---|---|---|---|
| **INTERPOL Red Notices** | Wanted persons | interpol.int/en/How-we-work/Notices/Red-Notices | none |
| **UNODC** | Drug trafficking / organised crime | dataunodc.un.org | none |
| **Royal Thai Police** | Crime statistics | police.go.th | none |
| **ACSC / ASEANAPOL** | ASEAN crime bulletins | aseanapol.org | none |
| **Global Terrorism Database** | GTD incidents | start.umd.edu/gtd | academic |

### Tourism origin countries — news in their languages

Already wired in `social.ts` as `MULTILINGUAL_FEEDS`:

| Country | Language | Feed | Endpoint |
|---|---|---|---|
| China | 中文 | Google News 清迈 | news.google.com/rss |
| Japan | 日本語 | Google News チエンマイ | news.google.com/rss |
| Korea | 한국어 | Google News 치앙마이 | news.google.com/rss |
| Russia | русский | Google News Чонгмай | news.google.com/rss |
| Germany | Deutsch | Google News Chiang Mai | news.google.com/rss |
| France | Français | Google News Chiang Mai | news.google.com/rss |
| India | English | Google News IN | news.google.com/rss |
| Australia | English | Google News AU | news.google.com/rss |

Top inbound origins auto-subscribe via the dashboard's "follow the
flight" pattern — every poll, the top-5 origin countries from
`/api/cnx/flights` drives which multilingual feeds are pulled.

### Aviation (extended)

| Source | What | Endpoint | Auth |
|---|---|---|---|
| **OpenSky /flights/all** | Historical flight tracks | opensky-network.org/api/flights | OAuth |
| **AviationStack** | Airline routes / schedules | aviationstack.com | key |
| **hexdb.io** | Aircraft registration lookup | hexdb.io | none |
| **FlightAware** | Flight plans / arrivals | flightaware.com | key |

### CCTV / media (open live)

| Source | What | Note |
|---|---|---|
| YouTube live (`youtube.com/watch?v=LIVE`) | Temple cameras, TAT feeds, event cameras | Open `LIVE` IDs in `cctv.ts` `SCENARIO_SLOTS` |
| Facebook Live (`facebook.com/<page>/live`) | Tourism Authority + community | OAuth |
| TAT official YouTube | `youtube.com/@TourismThailandOfficial` | public |

### Local Chiang Mai sources

| Source | What | Note |
|---|---|---|
| Chiang Mai Governor's Office (ผู้ว่าราชการจังหวัดเชียงใหม่) | Daily press releases | `chiangmai.go.th` |
| Chiang Mai City Hall (เทศบาลนครเชียงใหม่) | City services | `chiangmaicity.go.th` |
| Chiang Mai Rajabhat University | Academic bulletins | `cmru.ac.th` |
| Chiang Mai International Airport (CNX) | Flight schedule | `chiangmaiairport.com` |
| Royal Irrigation Department Region 1 | Northern basin operations | `rid.go.th` |
| PCD Northern Region | Air quality bulletins | `pcd.go.th` |

## Filing convention

When you add a source:

1. Add a fetcher in `src/lib/cnx/<source>.ts`.
2. Add an entry to `src/types/cnx.ts` response type.
3. Add the API route in `src/app/api/cnx/<source>/route.ts`.
5. Add a panel — or fold into an existing one if the data is a
   secondary stream (e.g. pandemic cases fold into the social
   sidebar as a new tab).
6. Update this SOURCES.md in the same commit.

— Last updated: 2026-09-15
— Owner: Dr Non, depa Senior Expert