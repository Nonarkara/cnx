# ศูนย์พักพิงชั่วคราว — พิกัดและการยืนยัน / Shelter locations and verification

## ภาษาไทย

รายชื่อศูนย์พักพิงชั่วคราว 177 แห่งของสำนักงานจังหวัดเชียงใหม่ (chiangmai.gdcatalog.go.th) **ไม่มีพิกัด**
แดชบอร์ดจึงหาตำแหน่งจาก OpenStreetMap (OSM) และบอกระดับความแม่นยำของทุกจุดไว้เสมอ ไม่มีการเดาพิกัด

| ระดับ (`precision`) | ความหมาย |
|---|---|
| `official` | **พิกัดยืนยันโดยหน่วยงาน** — มาจากไฟล์ `data/shelter-locations.csv` ชนะทุกแหล่ง |
| `place` | อาคารใน OSM ที่ชื่อตรงกันทุกตัวอักษร (หลังปรับรูปแบบชื่อ) และอยู่ในเขตอำเภอนั้น |
| `tambon` | ประมาณ — ระดับตำบล (กลางเขตตำบลจาก OSM, ที่ทำการ อบต./เทศบาลของตำบล, หรือหมู่บ้านชื่อเดียวกับตำบล) |
| `amphoe` | ประมาณ — ระดับอำเภอ (ที่ว่าการอำเภอ, ตัวเมืองอำเภอ, หรือกลางเขตอำเภอ) |
| `none` | ไม่ทราบพิกัด |

### ขอให้หน่วยงานช่วยยืนยันพิกัด

1. เปิดไฟล์ `public/data/cnx/shelters-to-verify.csv` (เปิดด้วย Excel ได้ ภาษาไทยไม่เพี้ยน)
   เรียงตาม `priority`: 1 = ระดับอำเภอ/ไม่ทราบ, 2 = ระดับตำบล, 3 = อาคารแต่ยังยืนยันตำบลไม่ได้, 4 = อาคารที่อยู่ในตำบลถูกต้อง
   แต่ละแถวมีลิงก์ OSM และลิงก์ค้นหา Google Maps
2. เจ้าหน้าที่ไปที่จุดจริง (หรือโทรถามผู้ดูแลอาคาร) กรอก `verifiedLat`, `verifiedLon`, `verifiedBy`, `verifiedAt`
3. ส่งกลับมา แล้วคัดลอกแถวที่ยืนยันแล้วลงใน `data/shelter-locations.csv`:

```
id,nameTh,lat,lon,source,verifiedBy,verifiedAt
cm-shelter-099,วัดสันติวนาราม,20.0xxxxx,99.2xxxxx,สำรวจภาคสนาม,ที่ทำการปกครองอำเภอแม่อาย,2026-10-20
```

- `nameTh` ต้องตรงกับชื่อในรายชื่อทางการ (กันกรณีลำดับแถวเปลี่ยนแล้วพิกัดไปติดผิดศูนย์)
- `lat`/`lon` เป็นทศนิยม (WGS84) ต้องอยู่ในจังหวัดและในอำเภอของศูนย์นั้น มิฉะนั้นการ build จะหยุดพร้อมบอกบรรทัดที่ผิด
- `verifiedAt` รูปแบบ ค.ศ. `YYYY-MM-DD`

4. รัน `node scripts/build-cnx-shelters.mjs` แล้ว commit ทั้ง `data/shelter-locations.csv` และ `public/data/cnx/shelters*.{json,csv}`

## English

The official list of 177 temporary shelters has no coordinates. `scripts/build-cnx-shelters.mjs` locates
each one and records how (`precision`, `basis`, and for building matches `tambonCheck`). It never invents
a coordinate.

**Order of evidence**

1. `official` — a row in `data/shelter-locations.csv`. Always wins. Must be inside the province ring and
   inside the shelter's อำเภอ (OSM district polygon), and `nameTh` must equal the published name; otherwise
   the build fails with the offending line.
2. `place` — an OSM object whose normalised name equals one of the shelter's name variants
   (abbreviations รร./อบต./ทต. expanded, hall prefixes หอประชุม/อาคาร/ศาลา/โรงยิม stripped, tone marks and
   Thai digits folded, publisher typos fixed). Found by Nominatim (address names the อำเภอ) or by a
   province-wide Overpass pass. Every point must be inside the OSM อำเภอ polygon. Overpass matches must be
   inside the stated ตำบล polygon where OSM has one; otherwise the name must be unique in the อำเภอ (or the
   only one whose own `addr:subdistrict` names the ตำบล). `tambonCheck`: `boundary` / `address` /
   `unverified` (no ตำบล evidence in OSM — most of the province).
3. `tambon` — OSM ตำบล polygon interior point → the ตำบล's own อบต./เทศบาล office (unique in the อำเภอ) →
   a Nominatim settlement named after the ตำบล. A *village* of that name counts only if its address names
   the ตำบล or an OSM facility named after the ตำบล is within 3 km (Nominatim's ตำบล in an address comes
   from the nearest place node, not a boundary, so it is not evidence either way).
4. `amphoe` — ที่ว่าการอำเภอ (Overpass, then Nominatim; with two candidates the one tagged
   `amenity=townhall`) → the district-seat settlement → the อำเภอ polygon's interior point.

**Hand-reviewed aliases** (in `SEARCH_ALIASES`): เทศบาลตำบลแม่โจ้ → เทศบาลเมืองแม่โจ้ (upgraded municipality);
โรงเรียนบ้านแม่ทะลบ → โรงเรียนแม่ทะลบ; โรงเรียนแม่สาว → โรงเรียนบ้านแม่สาว (namesake schools mapped with/without
"บ้าน"); โรงเรียนรวมศูนย์ → โรงเรียนรวมศูนย์วัดห้วยแก้ว (truncated name, only such school in อ.แม่ออน).

**Known limits (OSM coverage, October 2026)**: OSM has ตำบล boundary relations for only 11 of Chiang Mai's
subdistricts (all in/near อ.เมือง), and few named schools, temples or offices outside the city — e.g. no
named ที่ว่าการอำเภอ for จอมทอง, เชียงดาว, ไชยปราการ, สันกำแพง, สะเมิง, แม่วาง, ฮอด, ดอยเต่า, ดอยหล่อ, เวียงแหง,
แม่แจ่ม. 29 shelters in อ.แม่อาย therefore share the district-office point. Only an office survey
(`shelters-to-verify.csv` → `data/shelter-locations.csv`) can fix those.

**Run**: `node scripts/build-cnx-shelters.mjs [--refresh-csv] [--refresh-overpass] [--cache <file>]`.
Nominatim (≤1 req/s) and the three Overpass queries are cached next to `--cache`; re-runs are offline.
