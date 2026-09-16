# CNX Dashboard — Methodology

> Every threshold, formula, and judgment rule behind the war room.
> Filename mirrors `/docs/lopburi-methodology.md` so the Lopburi
> and Chiang Mai documentation sets look like siblings.

## Operating principle

**A number is not an answer — a verb is.**

Every measurement (water level, AQI, hotspot count, flight heading)
is translated to one imperative action. The governor and the field
operator never have to ask "what do I do with this number?" — the
dashboard already says.

## Province air score

Worst-station-wins across all 25 amphoes. The province-level AQI pill
on the masthead shows the worst reading, never the average. A single
amphoe with hazardous PM2.5 cannot be hidden by a quiet province
average.

## Forest-tenure hotspot priority (RFD)

Royal Forest Department hotspots ship with a `type` field per the
wildfire-forest.go.th response. Ranking inside `CNXFirePanel`:

1. **DNP** — Department of National Parks (อุทยานแห่งชาติ) — highest risk; escalation into park boundaries is the top concern.
2. **NRF** — National Reserved Forest (ป่าสงวนแห่งชาติ).
3. **ALOW** — Agricultural Land Office of Thailand.
4. **CMF** — Chiang Mai Forest (ป่าเชียงใหม่).
5. **FIO** — other / unclassified.

Counters in section 1 (DNP / NRF) trigger CRITICAL at > 5 hotspots,
WATCH at > 0; counters in section 5 (FIO) trigger WATCH at > 20 only.

## Burning season auto-tightening

Between **March 1 and April 30** the alert threshold for all forest-tenure types is halved (CRITICAL at > 3 DNP hotspots instead of > 5). This is a model, not a feed — it's calibrated against Chiang Mai's five-year hotspot baseline.

## Water ledger (Ping basin)

The Ping river rises with the southwest monsoon (Oct peak) and runs dry during burning season (Apr). The Mae Ngat dam (`/api/cnx/thaiwater → dam?province_id=50`) is the ledger between the two:

- Storage fraction > 85% → "เตรียมระบายน้ำล่วงหน้า" (prepare proactive release)
- Storage fraction < 30% in April → "งดการระบาย ประสานชลประทานปิง" (hold; coordinate with Ping irrigation)

## Flight heading quadrants

OpenSky ADS-B over Chiang Mai (bounding box `18.4–19.3°N, 98.5–99.5°E`).
Each airborne aircraft heading is bucketed:

| Bearing | Destination | Display |
|---|---|---|
| South (135°–225°) | Bangkok / South | `→ BKK` |
| North (315°–45°) | Chiang Rai / Myanmar north | `→ CEI` |
| East (45°–135°) | Laos / Vietnam east | `→ VTE` |
| West (225°–315°) | Myanmar / Bangladesh | `→ RGN` |

The top-3 inbound origin countries drive the multilingual social subscription list (see `cnx-sources.md`).

## Honesty rules (load-bearing)

1. Every number is labelled `live / scenario / model`. Nothing is invented.
2. Demo CCTV footage always wears the amber DEMO badge with source link.
3. Missing data renders as "ข้อมูลไม่พอ" / "no data" — never as false green.
4. Unreadable datasets are listed, not hidden.

## Tailwind / component constraints

- Apple HIG 44 px touch targets — every interactive element.
- `min-h-[100dvh]` — full-viewport mobile layout.
- `xl:` (1280 px) desktop, `lg:` (1024 px) tablet, mobile = tabbed drawer.
- `--cool: #1d2951` (Lanna blue) for chrome only, `--sun: #b8860b` (Doi Suthep gold) for accent only — status ramp (good/watch/alert/critical) is the only role for those colours.