# SIC reference reconciliation · 18 October 2026

47 entries from FloodDash’s dated research catalogue (`public/js/panels/research-apps.js`). 46 historically inspected; AQUA SHIELD reported but unopened. This is a reconciliation against CNX code, not a fresh inspection of 47 sites, accuracy ranking, AI-construction claim or claim of superiority. Official services and research tools appear alongside community apps. No third-party code or data copied.

Improved = concrete change this audit. Aligned = existing comparable capability, without claiming origin. Reference = lesson only, not adoption. The brief-to-evidence action additionally improves traceability.

| # | Reference | Lesson | CNX status / evidence |
|---|---|---|---|
| 1 | [FloodThai (floodthai.org)](https://www.floodthai.org/) | Place-first access | aligned: `src/components/CNX/CNXMap.tsx` |
| 2 | [BKK Flood Map](https://bkk-flood-map.bkk-flood-map.workers.dev) | Show coverage limits | reference — not adopted |
| 3 | [Thailand Flooder](https://thailand-flooder.vercel.app/) | Expose freshness | reference — not adopted |
| 4 | [BKK FloodWatch 2026](https://flood.autobahn.bot) | Separate forecasts and observations | reference — not adopted |
| 5 | [EarthDeFIRE · Bangkok flood chance](https://bkk-flood-chance-earth-de-fire.vercel.app/) | Explain score inputs | reference — not adopted |
| 6 | [Bangkok Flood (passable roads)](https://bangkok-flood.vercel.app/) | Accessible emergency contacts | reference — not adopted |
| 7 | [BKK StreetSmart](https://cctv-bangkok.tail95e28b.ts.net/) | Camera availability | reference — not adopted |
| 8 | [ChuayKan (ช่วยกัน)](https://chuaykan.web.app/) | Optional reporting | reference — not adopted |
| 9 | [ROD Platform](https://www.rodplatform.net/) | Separate scenarios | reference — not adopted |
| 10 | [CityMETER (Landometer)](https://landometer.com/v3/citymeter?d=trafficIncident) | Explicit units | aligned: `src/components/CNX/CNXGlyphLegend.tsx` |
| 11 | [FloodRoute ลาดกระบัง](https://dana-floodroute.watcharapong-melon.chatgpt.site/flood) | No unsupported route safety | reference — not adopted |
| 12 | [Sa Kaeo Flood Watch & SOS](https://sakaeo-flood.onrender.com/) | Response ownership | reference — not adopted |
| 13 | [People's Party · flood69](https://flood69.peoplesparty.or.th/) | Date reports | reference — not adopted |
| 14 | [JK World · Bangkok flood watch](https://world.tehx.dyndns.info/flood) | Expose uncertainty | reference — not adopted |
| 15 | [iReadCustomer · Bangkok flood map](https://ireadcustomer.com/th/tools/bangkok-flood-map) | Explain symbols | reference — not adopted |
| 16 | [น้ำ.aiya.ai](https://water.aiya.ai/) | Trace summaries to evidence | aligned: `src/components/CNX/CNXGovernorBrief.tsx` |
| 17 | [ALLSAFT](https://allsaft.com) | Alert thresholds | reference — not adopted |
| 18 | [Housing projects: survived or flooded](https://www.google.com/maps/d/viewer?mid=1f_ioOrgjZiR82ifuCwbuFCEbi5OGvYU&usp=sharing) | Geographic context | reference — not adopted |
| 19 | [SXP RiskMap](https://riskmap.sxpworks.com/) | Label unassessable evidence | improved: `src/lib/cnx/haze-vision-core.ts`, `src/components/CNX/CNXHazeModal.tsx` |
| 20 | [เฝ้าน้ำ (Fao Nam)](https://www.faonam.com) | Monitoring coverage | reference — not adopted |
| 21 | [พิกัดน้ำท่วมสมุทรปราการ (paddypure.com)](https://paddypure.com/flood-samutprakan-2569-09-29) | Catchment context | reference — not adopted |
| 22 | [เลี่ยงถนนน้ำท่วม กทม. (Claude artifact)](https://claude.ai/artifact/N6umcENfSgoY6GMkhVKwZs) | Ground generated explanations | reference — not adopted |
| 23 | [SV Academy · BKK flood map](https://bkk-flood-map.apps.sv-academy.org) | Source attribution | reference — not adopted |
| 24 | [Prachinburi flood watch](https://prachin.space/) | Local decisions | reference — not adopted |
| 25 | [BMR canal dashboard](https://flashflood-risk-intelligence.vercel.app/bmr) | Canal and river distinctions | reference — not adopted |
| 26 | [ThaiFloodWatch](https://www.seemywish.com/thaiwarning) | Mobile access | reference — not adopted |
| 27 | [Meanam](https://www.meanam.com/) | Gauge context | reference — not adopted |
| 28 | [CEO Weather Watch](https://ceo-weather-watch.pages.dev/) | Source age | reference — not adopted |
| 29 | [Flashflood · เตือนภัยน้ำป่าทั่วประเทศ](https://flashflood-risk-intelligence.vercel.app/) | Flash-flood limitations | reference — not adopted |
| 30 | [น้ำคลอง (คลอง กทม. · น้ำท่วมถนน · ประกาศ CAP)](https://namkhlong.horjorkor.com/) | Per-feed health | reference — not adopted |
| 31 | [Flood Intelligence Watch · Esri Thailand](https://esri.s.gy/floodwatch) | Satellite and street distinctions | reference — not adopted |
| 32 | [SOS · ศูนย์ประสานงานช่วยเหลือผู้ประสบภัยน้ำท่วม](https://sos.smartcity.click/) | Minimize personal data | reference — not adopted |
| 33 | [Flood CCTV Thailand · รวมกล้องน้ำท่วมทั่วไทย (cctv.maholan.net)](https://cctv.maholan.net) | Credit camera operators | aligned: `src/lib/cnx/cctv.ts` |
| 34 | [Google Flood Hub (sites.research.google/floods)](https://sites.research.google/floods) | River models versus gauges | reference — not adopted |
| 35 | [Floodboard (floodboard.org)](https://www.floodboard.org) | Missing is not calm | improved: `src/lib/cnx/flood-desk.ts` |
| 36 | [น้ำบนถนน บางมด (flood.taokaetech.com)](https://flood.taokaetech.com) | Local water observations | reference — not adopted |
| 37 | [POPNIX Flood (flood.pop.in.th)](https://flood.pop.in.th/) | Concise response instructions | reference — not adopted |
| 38 | [Floraville Flood Forecast — Bangkok (floraville-flood-forecast.netlify.app/bangkok.html)](https://floraville-flood-forecast.netlify.app/bangkok.html) | Forecast horizon | reference — not adopted |
| 39 | [ThaiFlood (thaiflood.in.th)](https://thaiflood.in.th/map.php) | Model versus measured wind | aligned: `src/components/CNX/CNXGlyphLegend.tsx` |
| 40 | AQUA SHIELD (Flood Intelligence OS) | Unopened reference | reference — not adopted |
| 41 | [จิตอาสาดูแลไทย (Jitasa.care)](https://jitasa.care/) | Report provenance | reference — not adopted |
| 42 | [Life Dee × เช็คน้ำ (GISTDA)](https://lifedee.gistda.or.th/map/flood) | Date satellite imagery | reference — not adopted |
| 43 | [Find My Plate (findmyplate.iaunn.com)](https://findmyplate.iaunn.com) | Human review for consequential CV | reference — not adopted |
| 44 | [TH EYES (theyes.hamsterdesu.com)](https://theyes.hamsterdesu.com) | Attributable reports | reference — not adopted |
| 45 | [แผนที่โครงข่ายการระบายน้ำ กทม.ปริมณฑล (thaivaluer.com/zoomify)](https://thaivaluer.com/zoomify/) | Drainage context | reference — not adopted |
| 46 | [NPT RiskMap V2 · พืชเกษตรนครปฐม](https://npt-dashboard.netlify.app/riskmap-v2) | Independent corroboration | improved: `scripts/haze-vision.mjs` |
| 47 | [Flood scan · ถนนน้ำท่วมจาก GPS (flood-scan-bkk-vicinity.netlify.app)](https://flood-scan-bkk-vicinity.netlify.app/) | Traffic anomalies are not proof of flooding | reference — not adopted |

CV remains sparse and unvalidated. Traffic anomalies do not establish flooding or route safety. Human-reviewed publication and validated flood detection remain future work.
