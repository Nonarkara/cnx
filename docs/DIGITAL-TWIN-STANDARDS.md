# CNX against digital-twin and early-warning standards

> Gap analysis prepared 11 October 2026 (v1.9.0, branch
> `codex/governor-frontend-audit`, HEAD `19631f6`) ahead of the governor
> demonstration. The code review was read-only. Every standard below is
> cited with its version and date. The **Access** column says whether the
> clause text was read in full, from an official preview, or only from a
> summary. Nothing here is claimed from a standard the review could not
> reach without saying so.

## Bottom line

1. **What CNX is, in standard terms.** ISO/IEC 30173:2023 §3.1.1 defines a
   digital twin as a *"digital representation of a target entity with data
   connections that enable convergence between the physical and digital
   states at an appropriate rate of synchronization"*. Its introduction
   treats "providing external management" as something a twin does *"when
   necessary"*: control back to the physical system is optional, not
   required. Under that definition CNX can fairly be called a
   **monitoring and early-warning city digital twin with one-way
   synchronisation and no actuation**. The About page currently says that
   ISO/IEC 30173 "formalizes" the Kritzinger (2018) model / shadow / twin
   ladder and that the standard requires two-way control
   (`src/components/CNX/CNXAboutContent.tsx:526,538`). The ladder comes
   from Kritzinger, not from ISO/IEC 30173, and the definition above does
   not require two-way control. Someone in the room who knows the
   standard would catch this. Fix it before the demo (item 5).
2. **Where CNX is strongest: the trust and quality principles.** Every
   value carries provenance, observation time, a failure mode and a
   "must not conclude" boundary, and these are enforced by tests. Few
   city dashboards get this far. It covers Gemini *Quality* and
   *Openness*, DTC *fidelity*, and WMO's rule that a warning states its
   uncertainty.
3. **Where CNX is weakest: machine-readable outputs and dissemination.**
   CNX does not publish CAP messages, has no machine-readable twin
   manifest or catalogue, no declared synchronisation targets (SLOs), no
   time-series history, and no log for verifying warnings after the fact.
   Pillar 3 (dissemination) and the feedback loop in Pillar 4 of Early
   Warnings for All are essentially absent.
4. **One factual error to fix now: Thailand does publish machine-readable
   official warnings.** `docs/WAR-ROOM-BIBLE.md:136-137` says Thai public
   advisory feeds stay unwired *"because none exists machine-readably"*.
   That is false. The Thai Meteorological Department (TMD) is a registered
   WMO alerting authority (OID 2.49.0.0.764.0). It publishes **signed CAP
   1.2** messages with polygons and ISO 3166-2 geocodes, marked public
   domain, at `https://www.tmd.go.th/api/xml/CAP` (TH) and `/en/api/xml/CAP`
   (EN). Both feeds returned 200 on 11 October 2026; message
   `TMD20261011062839_2-en` was a "Very Heavy Rain" alert with
   `severity=Extreme`. Chiang Mai is geocode `TH-50`. Wiring this feed
   (item 1) is the single highest-value change before the demo.

---

## Standards consulted

| Standard / framework | Version, date | URL | Access |
|---|---|---|---|
| ISO/IEC 30173 Digital twin — Concepts and terminology | Ed. 1, 2023-11 | https://www.iso.org/standard/81442.html | Official preview: foreword, §1–3.1.2, table of contents. §3.1.3 onward not read |
| ISO/IEC TR 30172 Digital twin — Use cases | 2023 | https://committee.iso.org/standard/81578.html | Summary only |
| ISO/IEC 30188 Digital twin — Reference architecture | Ed. 1, published 2026-07-30 | https://www.iso.org/standard/53308.html | Catalogue entry only. **Clauses not verified** |
| ISO/IEC 30186 Digital twin — Maturity model and guidance for a maturity assessment | Ed. 1, 2025-07 | https://committee.iso.org/standard/53306.html | Catalogue entry only |
| IEEE 3144 Digital twin maturity model (industry) | 2025-09-08 | https://standards.ieee.org/ieee/3144/10837/ | Summary only. Industrial scope |
| ISO 23247-1…4 Digital twin framework for manufacturing | 2021 | iso.org (ISO 23247 series) | Summary only. Manufacturing scope |
| CDBB Gemini Principles | Dec 2018 | https://www.cdbb.cam.ac.uk/system/files/documents/102689_GeminiPrinciples_cutdown.pdf | **Full text read** (all 9 principles quoted from the PDF) |
| CDBB Pathway towards an Information Management Framework | 2020 | https://www.cdbb.cam.ac.uk/what-we-do/national-digital-twin-programme/pathway-towards-information-management-framework/open | Summary only |
| Digital Twin Consortium (DTC) definition and Capabilities Periodic Table user guide | Guide 2022-03-28 (CPT v1.1 announced later) | https://www.digitaltwinconsortium.org/initiatives/the-definition-of-a-digital-twin/ and https://media.digitaltwinconsortium.org/wp-content/uploads/2022/06/Digital-Twin-Capabilities-Periodic-Table-User-Guide.pdf | **Full guide read**: 6 categories, 62 capabilities |
| ITU-T Y.4600 Requirements and capabilities of a digital twin system for smart cities | 08/2022 (approved 2022-08-29) | https://www.itu.int/rec/T-REC-Y.4600-202208-I | **Full text read** (§7.1–7.3, §8.2–8.7) |
| ITU-T Y.4224 Requirements for DT federation in smart cities, and Y.4605 Information exchange model for DT federation | 11/2023 | https://www.itu.int/rec/T-REC-Y.4224 , https://www.itu.int/rec/T-REC-Y.4605 | Summary only |
| OASIS CAP 1.2 (also ITU-T X.1303 bis) | 2010-07-01 (X.1303 bis 2014-03) | https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html | **Spec read** (required elements, enumerations) |
| WMO-No. 1109 CAP-enabled emergency alerting; WMO-No. 1150 Multi-hazard impact-based forecast and warning services | — | https://www.preventionweb.net/publication/wmo-guidelines-multi-hazard-impact-based-forecast-and-warning-services | Summary only |
| UNDRR / WMO Early Warnings for All (four pillars); MHEWS checklist | Executive Action Plan 2023–2027; checklist 2018 | https://www.undrr.org/early-warning-for-all , https://globalplatform.undrr.org/2022/sites/default/files/2022-02/Multi-hazard%20Early%20Warning%20Systems-%20A%20Checklist.pdf | Official pages read; checklist PDF not opened |
| WMO Register of Alerting Authorities: TMD, NDWC | live register | https://alertingauthority.wmo.int/authorities.php?recId=164 , `recId=272` | **Read**. TMD feed **probed live** |
| OGC SensorThings API Part 1 Sensing | v1.1, published 2021-08-04 (OGC 18-088) | https://docs.ogc.org/is/18-088/18-088.html | Summary only |
| OGC API – Environmental Data Retrieval | v1.1 (OGC 19-086r6) | https://ogcapi.ogc.org/edr/ | Summary only |
| OGC CityGML 3.0 Conceptual Model | approved OGC standard | https://www.ogc.org/standard/citygml/ | Summary only |
| ISO 37123 Indicators for resilient cities | 2019-12 | https://www.iso.org/standard/70428.html | Summary only. The indicator list was not read |
| ISO 37120 (sustainable cities) / ISO 37122 (smart cities) indicators | editions not verified | iso.org | **Not verified** in this pass |
| Thailand National Disaster Prevention and Mitigation Plan B.E. 2564–2570 (2021–2027) | Cabinet approved 2022-07-05 | https://www.preventionweb.net/quick/96884 | Summary only |
| Thailand Cell Broadcast national tests (DDPM + operators) | May 2025 | https://thailand.prd.go.th/en/content/category/detail/id/52/iid/384120 | Summary only |
| Thailand PDPA B.E. 2562 (2019) | in full force 2022-06-01 | (PDPC) | Secondary summaries only |
| W3C WCAG 2.2 | Recommendation, 2023 | https://www.w3.org/TR/WCAG22/ | Known; not re-read |

---

## 1. ISO/IEC 30173 (terminology), 30188 (architecture), 30186 (maturity)

| Requirement | CNX status | Evidence | Action | Effort | When |
|---|---|---|---|---|---|
| §3.1.1: a digital representation of a *target entity* | Partial | The target entity (Chiang Mai province: river, air, fire, people at risk) is implicit. `twin.ts:29-100` exposes a province risk surface, not an entity model | Name the entities and their states in a manifest (item 3) | S | Demo |
| §3.1.1: data connections that converge physical and digital state | Meets (one-way) | Live feeds via `river-level.ts`, `rain.ts`, `fires.ts`, `dustboy.ts`; relay tier `relay-kv.ts:72-103` | — | — | — |
| §3.1.1: "appropriate rate of synchronization" is declared | **Missing** | Each panel has its own `staleAfterMs` (`CNXDataAge.tsx:107` defaults to 3 h). No feed has a declared target rate | Declare cadence and staleness per entity (item 3) and show compliance (item 4) | S | Demo |
| Introduction: management/actuation only "when necessary" | Meets (n/a by design) | Decision aid, not decision: `WAR-ROOM-BIBLE.md:256-266` | — | — | — |
| About page cites the standard correctly | **Wrong** | `CNXAboutContent.tsx:526,538` attributes the Kritzinger ladder and a two-way-control requirement to ISO/IEC 30173 | Reword (item 5) | S | Demo |
| §6 stakeholder roles (developers, resource providers, integrators, users, operators; government and community) | Partial | Upstream credits are thorough (`SOURCES.md:515-521`). No named operator, data steward or escalation owner | Add a governance card (item 7) | S | Demo |
| §5.6 life-cycle process | Partial | Release gate `docs/SHIP-AUDIT.md`; `/api/cnx/build` (`src/app/api/cnx/build/route.ts`) | Version model rules (model cards, see §2) | M | Later |
| ISO/IEC 30188:2026 reference architecture | **Not assessed** | Clauses not reachable | Buy and map once published copies are available | M | Later |
| ISO/IEC 30186:2025 maturity self-assessment | Missing | About page says "not formally assessed" (`CNXAboutContent.tsx:541`) | Self-assess after purchase; do not quote a maturity tier before then | M | Later |

## 2. Digital Twin Consortium: definition and Capabilities Periodic Table

DTC definition: *"a virtual representation of real-world entities and
processes, synchronized at a specified frequency and fidelity"*. The two
words that matter are **specified** and **fidelity**.

| Capability (CPT #) | Status | Evidence | Action | Effort | When |
|---|---|---|---|---|---|
| Specified frequency | **Missing** | Cadences are written in prose (`SOURCES.md`, `WAR-ROOM-BIBLE.md:32-46`), not declared by the system | Manifest `cadenceSec`/`staleAfterSec` (item 3) | S | Demo |
| Specified fidelity | Partial, strong | `layer-contract.ts:42-55,115-211` (measures, error direction, validation, mustNotConclude); `smoke-trajectory.ts:17-25`; shelter `precision` (`shelters.ts:25,48`) | Expose these contracts in the manifest for **all** feeds, not just the four water layers | S | Demo |
| #1 Data acquisition and ingestion, #6 real-time processing | Meets | lib modules plus relay ingest (`relay-kv.ts:72-86`) | — | — | — |
| #4 Data contextualisation | Meets | Gauges graded against published bank geometry (`SOURCES.md:187-195`) | — | — | — |
| #10 Ontology management, #11 DT model repository | **Missing** | Types live only in `src/types/cnx.ts`. No entity schema is published | Manifest is the first step. SensorThings model later (§6) | S / L | Demo / Later |
| #13 Temporal (time-series) store, #14 storage and archive | **Missing** for hazards | Relay KV is overwrite-latest (`relay-kv.ts:84`). Only flights and aircraft-derived "visitors" keep history (`snapshot-store.ts:1-25`, `visitors-kv.ts:34`, 7 days) | 30-day ring buffer for P.1 level, rain maxima and province PM2.5 | M | Later |
| #22 API services | Partial | ~40 JSON GET routes; `/api/cnx/twin` mirrors the FloodDash/AirDash contract (`twin.ts:6-8`) | Publish manifest and CAP; OpenAPI later | S | Demo |
| #26 Alerts and notification | **Missing** | No push channel, no CAP | Items 1 and 2 | S | Demo |
| #29 Prediction, #33 simulation | Partial | 48 h outlook (`outlook.ts:5-12`), smoke RK2 trajectories (`SOURCES.md:274-277`). No what-if or strategy simulation (Y.4600 §7.2) | — | L | Later |
| #41 Real-time monitoring, #45 dashboards | Meets | Watch board with `observedAt` per item (`watch-list.ts:55-56`) | — | — | — |
| #53 System monitoring, #54 logging | **Missing** | No health endpoint covering the relay. Its single-Mac dependency is disclosed only in a diagram (`CNXAboutContent.tsx:478-500`) | Item 4 (health/SLO); item 8 (warning log) | S | Demo |
| #55 Data governance | Partial | `SOURCES.md:10-14` rule ("no failure mode, no path to live"); licences `SOURCES.md:515-521` | Machine-readable form (item 3) | S | Demo |
| #58 Security | Partial | Constant-time secret, 1 MB cap, schema guards (`relay-kv.ts:15-86`); headers (`middleware.ts:10-15`); no CSP (`middleware.ts:7-9`); one shared relay secret for 7 ingest routes (audit 2026-10-09) | Per-relay secrets, rotation, CSP with nonces | M | Later |
| #59 Privacy | Meets (low exposure) | No accounts or trackers; camera haze vision keeps statistics, not frames (`docs/CCTV-PIPELINE.md:72-86`); citizen pins carry precision (`citizen-core.ts:1-10`); PII redaction rule (`SOURCES.md:297`) | Publish a short privacy statement (item 7) | S | Demo |
| #61 Reliability, #62 resilience | **Partial / at risk** | River level, rain, social, citizen and haze vision all depend on one launchd relay on one Mac (`SOURCES.md:135-148`). The About page also says "no server to watch" (`CNXAboutContent.tsx:356`) | Surface relay age (item 4). Add a second relay host later | S / M | Demo / Later |

## 3. Gemini Principles (CDBB, December 2018): read in full

| Principle (verbatim) | Status | Evidence | Action | Effort | When |
|---|---|---|---|---|---|
| 1 Public good: "deliver genuine public benefit in perpetuity" | Partial | Civic, non-commercial (`SOURCES.md:517`). "In perpetuity" conflicts with a single-operator relay and laptop-hosted bakes | Write a continuity and ownership note (item 7) | S | Demo |
| 2 Value creation: "enable value creation and performance improvement" | Partial | Doctrine of four decisions (`WAR-ROOM-BIBLE.md:254-266`). No outcome measure | Warning log (item 8) makes the value measurable | S | Demo |
| 3 Insight: "determinable insight into the built environment" | Meets, with one defect | Verdict reasons carry evidence (`verdict.ts:28-43`). **Defect:** the dam rule says Bhumibol/Sirikit releases raise the Ping at Chiang Mai within 24 h (`verdict.ts:15-18,465-475`). Bhumibol is *downstream* (Tak) and Sirikit is on the Nan. Today the rule is gated off because flood is scenario-only, but it is a wrong physical model | Remove it or replace with Mae Ngat / Mae Kuang (item 5) | S | Demo |
| 4 Security: "enable security and be secure itself" | Partial | See DTC #58 | Later items | M | Later |
| 5 Openness: "as open as possible" | Partial | CC BY 4.0 on `/api/cnx/twin` (`twin.ts:103-104`). APIs are open but undocumented; no catalogue | Manifest and CAP (items 2, 3) | S | Demo |
| 6 Quality: "data of an appropriate quality" | **Meets, strong** | Blind axis cannot certify safe (`verdict.ts:611-618`); DustBoy neighbour test (`SOURCES.md:31-36`); FIRMS three states (`SOURCES.md:55-58`); observation-aged stamps (`CNXDataAge.tsx:8-19`). **But** every water layer except reservoirs says `validation: "none"` (`layer-contract.ts:128,162,182`) | Say so on the board and plan one ground-truth exercise | — / M | Later |
| 7 Federation: "standard connected environment" | Partial | `/api/cnx/twin` joins on province code 50 like FloodDash/AirDash (`twin.ts:6-8`). Not an open standard | CAP now; SensorThings or Y.4605 later | S / L | Demo / Later |
| 8 Curation: "clear ownership, governance and regulation" | Partial | Per-source ownership in `SOURCES.md`. No named human owner, steward or review cadence | Governance card (item 7) | S | Demo |
| 9 Evolution: "adapt as technology and society evolve" | Meets | Corrections recorded with reasons (`WAR-ROOM-BIBLE.md:85-107`, `SOURCES.md:70-156`); 635+ tests | — | — | — |

## 4. ITU-T Y.4600 (08/2022): read in full

Y.4600 targets a planning twin: agent-based simulation of strategies. CNX
is an operations and early-warning twin, so most of §7.2–7.3 is out of
scope by design. Saying that openly is better than letting a reader
assume CNX claims it.

| Clause | Status | Evidence | Action | Effort | When |
|---|---|---|---|---|---|
| 7.1 collect city administration data (population, households) | Partial | Data library and open-data snapshot (`data-library.ts:15-37`, `SOURCES.md:297`). No population denominator per district | Add NSO/DOPA district population for exposure counts | M | Later |
| 7.1 collect urban spatial data | Meets | Buildings 3D, waterways, bus routes, shelters (`public/data/cnx/`) | — | — | — |
| 7.1 collect movement data | Partial | Flights (ADS-B), CMU transit; RTC bus is timetable-simulated (`CNXAboutContent.tsx:541`) | — | — | — |
| 7.1 "individual persons cannot be identified … de-identification" | Meets | No personal data path. CCTV not proxied or recorded (`SOURCES.md:395-398`) | State it (item 7) | S | Demo |
| 7.1 security of collected and shared data | Partial | See DTC #58 | — | M | Later |
| 7.1 "share data with external systems through open interfaces" (recommended) | Partial | Public JSON routes, no spec | Manifest and CAP (items 2, 3) | S | Demo |
| 7.2 model creation, agent-based and strategy simulation | Out of scope | Deterministic hazard models only | Say so on the About page (item 6) | S | Demo |
| 7.3 strategy search and impact visualisation | Out of scope | — | — | — | — |
| 8.7 de-identification and security capabilities | Meets / partial | As 7.1 | — | — | — |
| Y.4224 / Y.4605 federation (registry, message model) | Missing | Ad-hoc contract only | Consider for the FloodDash/AirDash family | L | Later |

## 5. Early warning: Early Warnings for All, WMO, CAP 1.2

| Requirement | Status | Evidence | Action | Effort | When |
|---|---|---|---|---|---|
| **Pillar 1: disaster risk knowledge** | Partial | Shelters with capacity and precision (`SOURCES.md:270`); flood-prone map as citation only (`SOURCES.md:474-511`); layer contracts | Link the provincial flood thematic map (gdpublish-69-200) on the flood desk | S | Later |
| **Pillar 2: detection, monitoring, forecasting** | Meets | 43 Ping gauges, rain, PCD/DustBoy, FIRMS/RFD, CAMS/Open-Meteo 48 h, Flood Hub, cameras | Freshness SLO (item 4) | S | Demo |
| Pillar 2: official forecasts take precedence over the board's own | **Missing** | Bible says none is machine-readable (`WAR-ROOM-BIBLE.md:136-137`). TMD CAP exists (verified) | Item 1 | S | Demo |
| **Pillar 3: warning dissemination and communication** | **Missing** | No CAP, LINE, SMS or cell-broadcast hand-off; read-only wall | CAP export for integrators (item 2). LINE OA / cell broadcast only through DDPM / Provincial Office authority | S / L | Demo / Later |
| Pillar 3: warnings carry action, uncertainty and source | Meets | Bilingual actions (`verdict.ts:77-96`), hotlines (`verdict.ts:68-75`), provenance, "not a guarantee" wording (`SOURCES.md:272-277`) | — | — | — |
| **Pillar 4: preparedness and response** | Partial | Checklists per level (`verdict.ts:98+`); shelters in the outlook (`outlook.ts:1-3`) | Map pillars on the About page (item 6) | S | Demo |
| WMO-No. 1150: verify warnings, collect feedback, iterate | **Missing** | No record of what the board said and when | Warning log (item 8) | S | Demo |
| WMO-No. 1109 / CAP 1.2: interoperable machine format | **Missing** | No CAP anywhere (`grep` for CAP, LINE, webhook and cell broadcast in `src/` and `scripts/` found nothing) | Items 1 and 2 | S | Demo |
| Non-authority must not impersonate an authority | Meets (doctrine) | "never renders its own threshold as a government announcement" (`WAR-ROOM-BIBLE.md:137-138`) | CAP export must use `scope=Restricted` (item 2) | — | — |

## 6. OGC standards

| Standard | Status | Evidence | Action | Effort | When |
|---|---|---|---|---|---|
| SensorThings API 1.1: Things / Locations / Datastreams / Observations for gauges, PM2.5, rain | Missing | Bespoke JSON per feed | Read-only STA facade over river-level, rain and DustBoy (`/api/cnx/sta/v1.1/…`) | L | Later |
| OGC API – EDR 1.1: position/area queries on the forecast field | Missing | `wind-field.ts` returns a bespoke grid | EDR `position` query over the KV field | M | Later |
| OGC API – Features: shelters, cameras, hotspots as collections | Partial | GeoJSON files and arrays, no `/collections` | Wrap existing GeoJSON | M | Later |
| CityGML 3.0 / 3D Tiles for the 59k-building model | Missing | GeoJSON extrusions (`buildings-*.geojson`) | Only if a 3D city model is requested | L | Later |

## 7. ISO 37120 / 37122 / 37123 city indicators

| Requirement | Status | Evidence | Action | Effort | When |
|---|---|---|---|---|---|
| ISO 37123:2019: comparable, verifiable resilience indicators (floods, wildfire, pollution among the shocks) | Missing | The board reports live states, not periodic indicators | After the demo, pick 3–5 37123 indicators the data supports (e.g. population near critical gauges, shelter capacity per capita) **once the indicator list is read**. It was not verified here | M | Later |
| ISO 37120 / 37122 | Not verified | — | — | — | — |

## 8. Thailand-specific

| Requirement | Status | Evidence | Action | Effort | When |
|---|---|---|---|---|---|
| Align with the national DRM Plan 2021–2027 (Sendai-aligned, DDPM lead) | Partial | DDPM 1784 in actions (`verdict.ts:70`) | Name plan alignment on the About page (item 6) | S | Demo |
| TMD official CAP warnings (OID 2.49.0.0.764.0) | **Missing, available** | Probed 200, signed CAP 1.2, `TH-50` geocode | Item 1 | S | Demo |
| NDWC (OID 2.49.0.0.764.1) | n/a | Registered, no CAP feed URL listed | Watch for a feed | — | Later |
| Cell Broadcast (DDPM national tests, May 2025) | n/a for CNX | Authority channel | CNX supplies situational awareness to the officers who trigger it, never the trigger itself | — | — |
| PDPA B.E. 2562: lawful basis, notice and security for any personal data | Low exposure, meets in practice | No user accounts, cookies or analytics found; CCTV metadata only | One-paragraph privacy and PDPA notice (item 7). A DPIA is needed if citizen reports or camera analytics expand | S | Demo |
| Web accessibility (WCAG 2.2 AA; Thai TWCAG) | Partial | 134 `aria-`/`role` attributes, focus-trapped modals, `lang="th"` (`src/app/layout.tsx:56`); audit rated a11y "above average" | Formal WCAG 2.2 AA pass, especially colour-only severity chips | M | Later |

## 9. ISO 23247 (manufacturing)

Not applicable beyond vocabulary. Its "observable manufacturing elements"
idea translates to "observable city elements", which is the entity list in
the manifest. The About page already says this correctly
(`CNXAboutContent.tsx:541`).

---

## Factual defects found during the review

A standards-literate audience will judge the whole board by details like
these. All are small.

| # | Defect | Location | Fix |
|---|---|---|---|
| D1 | ISO/IEC 30173 credited with the Kritzinger ladder and with requiring two-way control | `CNXAboutContent.tsx:526,538` | Credit Kritzinger et al. 2018 for the ladder. Quote §3.1.1. Describe CNX as a one-way-synchronised monitoring twin |
| D2 | Bhumibol/Sirikit treated as upstream of Chiang Mai | `verdict.ts:15-18,472-473`; `CNXFloodPanel.tsx:6`; `flood.ts:30-31,102-103` | Delete the rule text, or re-key it to upstream reservoirs (Mae Ngat Somboon Chon, Mae Kuang Udom Thara) |
| D3 | "Thai advisory feeds: none machine-readable" | `WAR-ROOM-BIBLE.md:136-137` | Correct it and wire TMD CAP |
| D4 | About page claims "Mae Ngat dam" telemetry. Mae Ngat appears only in the scenario module (`flood.ts:86`) | `CNXAboutContent.tsx:248,254` | Remove the claim or wire a real reservoir feed |
| D5 | Thai layer label "สถานีวัดน้ำลำปาง" (*Lampang* gauges) on the Ping gauge layer | `layer-contract.ts:119` | "สถานีวัดน้ำลุ่มน้ำปิง" |
| D6 | "311 datasets" hard-coded, but the 2026-10-01 bake had 316 | `CNXAboutContent.tsx:254,356,412`; `SOURCES.md:297` | Read the count from the bake's `generatedAt` file |
| D7 | "No server to watch" while six feeds depend on a launchd relay | `CNXAboutContent.tsx:356` | Say "one relay machine to watch" |

---

## Do before the demo (8 items, each under 2 hours)

Order is priority. Items 1–6 change what the governor sees. Items 7–8 are
cheap, but they are what a standards reviewer asks for next.

### 1. Ingest TMD official CAP warnings for Chiang Mai
*Satisfies:* EW4All Pillar 2/3 ("authoritative warnings"); WMO-No. 1109;
Gemini 6 Quality; corrects D3.
- `src/lib/cnx/tmd-cap.ts`: fetch `https://www.tmd.go.th/api/xml/CAP` and
  `/en/api/xml/CAP` (RSS). For each `<item><link>` (≤ 20), fetch the CAP
  XML. Keep alerts whose area lists geocode `TH-50`; use the polygon-vertex
  test only for areas that list no geocodes (TMD's whole-province outlines
  differ from the OSM ring by up to 4.7 km, so a Tak alert's vertices fall
  inside Chiang Mai — implemented that way in `tmd-cap-core.ts`) (`inChiangMaiProvince` in
  `province-boundary.ts:13`). CAP polygons are `lat,lon` pairs separated
  by spaces; the province ring is `[lon, lat]`. Drop alerts with
  `expires < now` or `msgType=Cancel`, and keep only the latest per
  `references` chain.
- Output `/api/cnx/official-warnings`: `{ provenance: "live"|"unavailable",
  fetchedAt, alerts: [{ identifier, sent, effective, expires, event,
  headline_th, headline_en, severity, urgency, certainty, instruction_th,
  instruction_en, web, areaDesc, polygons: [[lon,lat][]] }] }`. Cache
  10 min on success and 30 min on failure, the same rule as ThaiWater.
  If Workers gets 403/429, add it to the relay like river level.
- Board: a first row on the watch board labelled **"ประกาศทางการ · กรมอุตุนิยมวิทยา"**,
  visually distinct from model rows, with polygons drawn on the map. If
  there is no alert, write "ไม่มีประกาศ TMD ที่มีผลสำหรับเชียงใหม่", never "safe".
- Test: fixture `TMD20261011062839_2-en` (it does **not** include TH-50,
  so it must be filtered out) plus a synthetic TH-50 alert that must be
  kept.

### 2. CAP 1.2 export of the board's own active warnings at `/api/cnx/cap.xml`
*Satisfies:* OASIS CAP 1.2 / ITU-T X.1303 bis; EW4All Pillar 3; DTC #22, #26;
Y.4600 §7.1 open interfaces.
- One `<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">` per active
  outlook item (`outlook.ts`, level ≥ watch) and one for a verdict level
  ≥ prepare. Required fields: `identifier` = `cnx-{domain}-{district}-{sha1(level+peakAt)}`,
  `sender` = `cap@cnx.nonarkara.org`, `sent`, `status=Actual`,
  `msgType=Alert|Update`, **`scope=Restricted`** with
  `<restriction>Decision support for Chiang Mai Provincial Office. Not an official public warning; official sources: TMD, DDPM.</restriction>`.
- `info`: `category` Met (rain), Env (PM2.5) or Fire. `event` in TH and
  EN, as two `info` blocks with `language` th-TH and en-US. `urgency`:
  forecast → Expected, measured → Immediate. `severity`: watch→Minor,
  alert→Moderate, critical→Severe. `certainty`: model → Possible,
  measured → Observed. `responseType=Monitor|Prepare`. `instruction` from
  `ACTIONS_TH_EN`. `effective`/`expires` = forecast window. `area`:
  `areaDesc` = amphoe name, `circle` = district point (`wind-field-points.ts`)
  with radius 10 km, and `geocode` `ISO3166-2`=`TH-50`.
- Atom index at `/api/cnx/cap.atom`. Validate both against the CAP 1.2
  XSD in a unit test.

### 3. Machine-readable twin manifest at `/api/cnx/manifest.json`
*Satisfies:* ISO/IEC 30173 §3.1.1 (declared rate of synchronisation); DTC
definition (specified frequency and fidelity) and CPT #10/#11/#55; Gemini 5
Openness, 8 Curation; Y.4600 §7.1.
- New `src/lib/cnx/twin-manifest.ts`: a static registry built from
  `SOURCES.md` §1–5, one record per entity class: `id`, `name_th`,
  `name_en`, `kind` (`measured|satellite|model|vision|static|derived`),
  `upstream` (agency, endpoint host), `licence`, `route` (`/api/cnx/…`),
  `cadenceSec`, `staleAfterSec`, `transport` (`direct|relay|baked`),
  `fidelity` (one sentence), `mustNotConclude` (TH/EN; reuse
  `LAYER_CONTRACTS` where present), `validation`
  (`none|cross-checked|ground-truthed`), `failureMode`.
- The route adds live fields per entity: `lastObservedAt`, `provenance`,
  `withinSlo` (computed from each route's own response; reuse the
  watch-list `observedAt` logic). Include `version`, `commit`, `generatedAt`.
- Test: every route under `src/app/api/cnx/*` that serves data is either
  in the manifest or on an explicit exclusion list. This is the
  `getLayerContract` "unknown ⇒ null" rule applied to feeds.

### 4. Per-feed freshness SLO and relay health on the board
*Satisfies:* DTC #53 System monitoring, #61 Reliability; EW4All Pillar 2
continuity; Gemini 6 Quality.
- Read `/api/cnx/manifest.json`. Render a compact strip ("ฟีดตรงเวลา 14/17")
  in the top bar. Expanding it lists each feed's age against
  `staleAfterSec` in green, amber or grey (grey = no observation, never
  green).
- Relay health: report the age of `generatedAt` on each relay KV key
  (`river-level-latest`, rain, social, citizen, haze-vision, flights).
  If the newest is older than 45 min, show "เครื่องรีเลย์ออฟไลน์ตั้งแต่ …".
  This turns the single-Mac dependency into a visible, honest state.

### 5. Fix defects D1–D7
*Satisfies:* Gemini 3 Insight and 6 Quality; ISO/IEC 30173 §3.1.1
(accurate claims). Text-only changes plus one rule deletion (D2). Add a
test that `verdict.ts` contains no `Bhumibol|Sirikit` reason text.

### 6. "Standards position" section on the About page (TH and EN)
*Satisfies:* EW4All four pillars; Thai DRM Plan 2021–2027 alignment;
Y.4600 scope statement.
- A four-row table, Pillar → what CNX does → what CNX does **not** do →
  who owns it:
  1. Risk knowledge: shelters, layer contracts. Owner: Provincial Office.
  2. Monitoring and forecasting: all live feeds, TMD official first.
     Owner: TMD, RID/HII, PCD, GISTDA, RFD.
  3. Dissemination: CAP feed for integrators only; no public alerting.
     Owner: DDPM (Cell Broadcast), Provincial Office.
  4. Preparedness and response: checklists and shelters. Owner: DDPM
     Region / amphoe.
- Add one paragraph on ISO/IEC 30173 (the corrected D1 wording) and one
  sentence each on Y.4600 (simulation out of scope) and the Gemini
  Principles (which ones CNX meets).

### 7. Governance and privacy card
*Satisfies:* ISO/IEC 30173 §6 stakeholders; Gemini 8 Curation and 1
Public good; Y.4600 §7.1 de-identification; PDPA notice.
- An About-page section with: system owner, technical operator, duty
  officer role, data stewards per domain (links to `SOURCES.md` agencies),
  review cadence, continuity (what happens if the relay is down for 24 h),
  and a plain PDPA statement: no personal data collected; no cookies or
  analytics; cameras are positions and liveness only, with no video
  recorded; camera haze vision keeps image statistics, not images;
  citizen mentions are pinned at place precision without author identity.
  Fill in names only where the owner provides them; otherwise leave the
  role labelled "to be assigned".

### 8. Warning log for verification at `/api/cnx/warning-log`
*Satisfies:* WMO-No. 1150 (verification and feedback); DTC #54 Logging;
Gemini 2 Value creation and 9 Evolution.
- When `/api/cnx/twin` computes a verdict whose `level` differs from the
  last stored one, or when an outlook item enters or leaves ≥ watch,
  append `{ at, domain, district, from, to, score, reasons_en[0],
  provenance, commit }` to KV key `warning-log:{YYYY-MM}`. Cap at 2,000
  rows, TTL 400 days. Write on change only, so KV cost is negligible.
- GET returns the current month's rows. A later step joins these against
  measured outcomes (gauge peak, PM2.5 peak) to score hits and false
  alarms.

---

## Later (after the demo)

- 30-day time-series store for hazard feeds (DTC #13). Use the same ring
  buffer to show 48 h sparklines.
- A second relay host, per-relay secrets with rotation, CSP with nonces
  (DTC #58/#62; audit 2026-10-09 medium findings).
- OGC SensorThings 1.1 facade for gauges, PM2.5 and rain; OGC API-EDR for
  the forecast field; OGC API-Features collections.
- One ground-truth exercise per water layer so `validation` can move off
  `"none"` (`layer-contract.ts`).
- Versioned model cards for the verdict, outlook, smoke trajectory and
  haze vision: inputs, thresholds and their sources, known error
  direction, change history.
- ISO 37123 indicator subset; ISO/IEC 30186 self-assessment; ISO/IEC
  30188 mapping once the texts are bought.
- Federation per ITU-T Y.4224 / Y.4605 across the FloodDash, AirDash and
  CNX family.
- LINE OA or cell-broadcast hand-off, only under the Provincial Office's
  or DDPM's authority and sender identity.
- WCAG 2.2 AA audit.
