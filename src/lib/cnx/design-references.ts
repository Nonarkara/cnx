// Dated FloodDash research catalogue; no third-party code or data copied.
// Historical inspection is not fresh verification; alignment does not establish lineage.
export type DesignReference = { sourceIndex: number; name: string; nameEn: string; url: string | null; lesson: string; lessonTh: string; status: "improved" | "aligned" | "reference"; evidence: string[]; inspection: string };
export const DESIGN_REFERENCES: DesignReference[] = [
  {
    "sourceIndex": 1,
    "name": "FloodThai (floodthai.org)",
    "nameEn": "FloodThai (floodthai.org)",
    "url": "https://www.floodthai.org/",
    "lesson": "Place-first access",
    "lessonTh": "เริ่มจากพื้นที่",
    "status": "aligned",
    "evidence": [
      "src/components/CNX/CNXMap.tsx"
    ],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 2,
    "name": "BKK Flood Map",
    "nameEn": "BKK Flood Map",
    "url": "https://bkk-flood-map.bkk-flood-map.workers.dev",
    "lesson": "Show coverage limits",
    "lessonTh": "บอกขอบเขตข้อมูล",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 3,
    "name": "Thailand Flooder",
    "nameEn": "Thailand Flooder",
    "url": "https://thailand-flooder.vercel.app/",
    "lesson": "Expose freshness",
    "lessonTh": "แสดงความสดข้อมูล",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 4,
    "name": "BKK FloodWatch 2026",
    "nameEn": "BKK FloodWatch 2026",
    "url": "https://flood.autobahn.bot",
    "lesson": "Separate forecasts and observations",
    "lessonTh": "แยกพยากรณ์กับค่าที่วัด",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 5,
    "name": "EarthDeFIRE · Bangkok flood chance",
    "nameEn": "EarthDeFIRE · Bangkok flood chance",
    "url": "https://bkk-flood-chance-earth-de-fire.vercel.app/",
    "lesson": "Explain score inputs",
    "lessonTh": "อธิบายคะแนน",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 6,
    "name": "Bangkok Flood (passable roads)",
    "nameEn": "Bangkok Flood (passable roads)",
    "url": "https://bangkok-flood.vercel.app/",
    "lesson": "Accessible emergency contacts",
    "lessonTh": "ติดต่อฉุกเฉินได้ง่าย",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 7,
    "name": "BKK StreetSmart",
    "nameEn": "BKK StreetSmart",
    "url": "https://cctv-bangkok.tail95e28b.ts.net/",
    "lesson": "Camera availability",
    "lessonTh": "บอกสถานะกล้อง",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 8,
    "name": "ChuayKan (ช่วยกัน)",
    "nameEn": "ChuayKan",
    "url": "https://chuaykan.web.app/",
    "lesson": "Optional reporting",
    "lessonTh": "รายงานตามสมัครใจ",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 9,
    "name": "ROD Platform",
    "nameEn": "ROD Platform",
    "url": "https://www.rodplatform.net/",
    "lesson": "Separate scenarios",
    "lessonTh": "แยกสถานการณ์จำลอง",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 10,
    "name": "CityMETER (Landometer)",
    "nameEn": "CityMETER (Landometer)",
    "url": "https://landometer.com/v3/citymeter?d=trafficIncident",
    "lesson": "Explicit units",
    "lessonTh": "ระบุหน่วย",
    "status": "aligned",
    "evidence": [
      "src/components/CNX/CNXGlyphLegend.tsx"
    ],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 11,
    "name": "FloodRoute ลาดกระบัง",
    "nameEn": "FloodRoute Lat Krabang",
    "url": "https://dana-floodroute.watcharapong-melon.chatgpt.site/flood",
    "lesson": "No unsupported route safety",
    "lessonTh": "ไม่รับรองเส้นทางโดยไร้หลักฐาน",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 12,
    "name": "Sa Kaeo Flood Watch & SOS",
    "nameEn": "Sa Kaeo Flood Watch & SOS",
    "url": "https://sakaeo-flood.onrender.com/",
    "lesson": "Response ownership",
    "lessonTh": "ระบุผู้รับผิดชอบ",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 13,
    "name": "People's Party · flood69",
    "nameEn": "People's Party · flood69",
    "url": "https://flood69.peoplesparty.or.th/",
    "lesson": "Date reports",
    "lessonTh": "ลงวันที่รายงาน",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 14,
    "name": "JK World · Bangkok flood watch",
    "nameEn": "JK World · Bangkok flood watch",
    "url": "https://world.tehx.dyndns.info/flood",
    "lesson": "Expose uncertainty",
    "lessonTh": "แสดงความไม่แน่นอน",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 15,
    "name": "iReadCustomer · Bangkok flood map",
    "nameEn": "iReadCustomer · Bangkok flood map",
    "url": "https://ireadcustomer.com/th/tools/bangkok-flood-map",
    "lesson": "Explain symbols",
    "lessonTh": "อธิบายสัญลักษณ์",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 16,
    "name": "น้ำ.aiya.ai",
    "nameEn": "water.aiya.ai",
    "url": "https://water.aiya.ai/",
    "lesson": "Trace summaries to evidence",
    "lessonTh": "ตามจากสรุปไปหลักฐาน",
    "status": "aligned",
    "evidence": [
      "src/components/CNX/CNXGovernorBrief.tsx"
    ],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 17,
    "name": "ALLSAFT",
    "nameEn": "ALLSAFT",
    "url": "https://allsaft.com",
    "lesson": "Alert thresholds",
    "lessonTh": "เกณฑ์แจ้งเตือน",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 18,
    "name": "Housing projects: survived or flooded",
    "nameEn": "Housing projects: survived or flooded",
    "url": "https://www.google.com/maps/d/viewer?mid=1f_ioOrgjZiR82ifuCwbuFCEbi5OGvYU&usp=sharing",
    "lesson": "Geographic context",
    "lessonTh": "บริบทพื้นที่",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 19,
    "name": "SXP RiskMap",
    "nameEn": "SXP RiskMap",
    "url": "https://riskmap.sxpworks.com/",
    "lesson": "Label unassessable evidence",
    "lessonTh": "แยกภาพที่ประเมินไม่ได้",
    "status": "improved",
    "evidence": [
      "src/lib/cnx/haze-vision-core.ts",
      "src/components/CNX/CNXHazeModal.tsx"
    ],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 20,
    "name": "เฝ้าน้ำ (Fao Nam)",
    "nameEn": "Fao Nam",
    "url": "https://www.faonam.com",
    "lesson": "Monitoring coverage",
    "lessonTh": "ขอบเขตการเฝ้าระวัง",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 21,
    "name": "พิกัดน้ำท่วมสมุทรปราการ (paddypure.com)",
    "nameEn": "Samut Prakan flood locations (paddypure.com)",
    "url": "https://paddypure.com/flood-samutprakan-2569-09-29",
    "lesson": "Catchment context",
    "lessonTh": "บริบทลุ่มน้ำ",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 22,
    "name": "เลี่ยงถนนน้ำท่วม กทม. (Claude artifact)",
    "nameEn": "Bangkok flood-road avoidance (Claude artifact)",
    "url": "https://claude.ai/artifact/N6umcENfSgoY6GMkhVKwZs",
    "lesson": "Ground generated explanations",
    "lessonTh": "คำอธิบายต้องมีหลักฐาน",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 23,
    "name": "SV Academy · BKK flood map",
    "nameEn": "SV Academy · BKK flood map",
    "url": "https://bkk-flood-map.apps.sv-academy.org",
    "lesson": "Source attribution",
    "lessonTh": "ระบุแหล่งข้อมูล",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 24,
    "name": "Prachinburi flood watch",
    "nameEn": "Prachinburi flood watch",
    "url": "https://prachin.space/",
    "lesson": "Local decisions",
    "lessonTh": "ตัดสินใจในพื้นที่",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 25,
    "name": "BMR canal dashboard",
    "nameEn": "BMR canal dashboard",
    "url": "https://flashflood-risk-intelligence.vercel.app/bmr",
    "lesson": "Canal and river distinctions",
    "lessonTh": "แยกคลองกับแม่น้ำ",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 26,
    "name": "ThaiFloodWatch",
    "nameEn": "ThaiFloodWatch",
    "url": "https://www.seemywish.com/thaiwarning",
    "lesson": "Mobile access",
    "lessonTh": "ใช้บนมือถือ",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 27,
    "name": "Meanam",
    "nameEn": "Meanam",
    "url": "https://www.meanam.com/",
    "lesson": "Gauge context",
    "lessonTh": "บริบทสถานีวัด",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 28,
    "name": "CEO Weather Watch",
    "nameEn": "CEO Weather Watch",
    "url": "https://ceo-weather-watch.pages.dev/",
    "lesson": "Source age",
    "lessonTh": "อายุข้อมูล",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 29,
    "name": "Flashflood · เตือนภัยน้ำป่าทั่วประเทศ",
    "nameEn": "Flashflood",
    "url": "https://flashflood-risk-intelligence.vercel.app/",
    "lesson": "Flash-flood limitations",
    "lessonTh": "ข้อจำกัดน้ำท่วมฉับพลัน",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 30,
    "name": "น้ำคลอง (คลอง กทม. · น้ำท่วมถนน · ประกาศ CAP)",
    "nameEn": "NamKhlong",
    "url": "https://namkhlong.horjorkor.com/",
    "lesson": "Per-feed health",
    "lessonTh": "สุขภาพแต่ละฟีด",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 31,
    "name": "Flood Intelligence Watch · Esri Thailand",
    "nameEn": "Flood Intelligence Watch · Esri Thailand",
    "url": "https://esri.s.gy/floodwatch",
    "lesson": "Satellite and street distinctions",
    "lessonTh": "แยกดาวเทียมกับถนน",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 32,
    "name": "SOS · ศูนย์ประสานงานช่วยเหลือผู้ประสบภัยน้ำท่วม",
    "nameEn": "SOS flood assistance coordination",
    "url": "https://sos.smartcity.click/",
    "lesson": "Minimize personal data",
    "lessonTh": "ลดข้อมูลส่วนบุคคล",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 33,
    "name": "Flood CCTV Thailand · รวมกล้องน้ำท่วมทั่วไทย (cctv.maholan.net)",
    "nameEn": "Flood CCTV Thailand (cctv.maholan.net)",
    "url": "https://cctv.maholan.net",
    "lesson": "Credit camera operators",
    "lessonTh": "เครดิตผู้ดูแลกล้อง",
    "status": "aligned",
    "evidence": [
      "src/lib/cnx/cctv.ts"
    ],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 34,
    "name": "Google Flood Hub (sites.research.google/floods)",
    "nameEn": "Google Flood Hub (sites.research.google/floods)",
    "url": "https://sites.research.google/floods",
    "lesson": "River models versus gauges",
    "lessonTh": "แยกแบบจำลองกับสถานี",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 35,
    "name": "Floodboard (floodboard.org)",
    "nameEn": "Floodboard (floodboard.org)",
    "url": "https://www.floodboard.org",
    "lesson": "Missing is not calm",
    "lessonTh": "ข้อมูลขาดไม่แปลว่าสงบ",
    "status": "improved",
    "evidence": [
      "src/lib/cnx/flood-desk.ts"
    ],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 36,
    "name": "น้ำบนถนน บางมด (flood.taokaetech.com)",
    "nameEn": "Bang Mot road water (flood.taokaetech.com)",
    "url": "https://flood.taokaetech.com",
    "lesson": "Local water observations",
    "lessonTh": "ระดับน้ำในพื้นที่",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 37,
    "name": "POPNIX Flood (flood.pop.in.th)",
    "nameEn": "POPNIX Flood (flood.pop.in.th)",
    "url": "https://flood.pop.in.th/",
    "lesson": "Concise response instructions",
    "lessonTh": "คำแนะนำกระชับ",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 38,
    "name": "Floraville Flood Forecast — Bangkok (floraville-flood-forecast.netlify.app/bangkok.html)",
    "nameEn": "Floraville Flood Forecast — Bangkok (floraville-flood-forecast.netlify.app/bangkok.html)",
    "url": "https://floraville-flood-forecast.netlify.app/bangkok.html",
    "lesson": "Forecast horizon",
    "lessonTh": "ระยะพยากรณ์",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 39,
    "name": "ThaiFlood (thaiflood.in.th)",
    "nameEn": "ThaiFlood (thaiflood.in.th)",
    "url": "https://thaiflood.in.th/map.php",
    "lesson": "Model versus measured wind",
    "lessonTh": "แยกลมจำลองกับลมที่วัด",
    "status": "aligned",
    "evidence": [
      "src/components/CNX/CNXGlyphLegend.tsx"
    ],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 40,
    "name": "AQUA SHIELD (Flood Intelligence OS)",
    "nameEn": "AQUA SHIELD (Flood Intelligence OS)",
    "url": null,
    "lesson": "Unopened reference",
    "lessonTh": "ยังไม่ได้เปิดศึกษา",
    "status": "reference",
    "evidence": [],
    "inspection": "reported-unopened"
  },
  {
    "sourceIndex": 41,
    "name": "จิตอาสาดูแลไทย (Jitasa.care)",
    "nameEn": "Jitasa.care",
    "url": "https://jitasa.care/",
    "lesson": "Report provenance",
    "lessonTh": "ที่มารายงาน",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 42,
    "name": "Life Dee × เช็คน้ำ (GISTDA)",
    "nameEn": "Life Dee × Check Nam (GISTDA)",
    "url": "https://lifedee.gistda.or.th/map/flood",
    "lesson": "Date satellite imagery",
    "lessonTh": "วันที่ภาพดาวเทียม",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 43,
    "name": "Find My Plate (findmyplate.iaunn.com)",
    "nameEn": "Find My Plate (findmyplate.iaunn.com)",
    "url": "https://findmyplate.iaunn.com",
    "lesson": "Human review for consequential CV",
    "lessonTh": "คนตรวจผลภาพก่อนใช้ตัดสินใจสำคัญ",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 44,
    "name": "TH EYES (theyes.hamsterdesu.com)",
    "nameEn": "TH EYES (theyes.hamsterdesu.com)",
    "url": "https://theyes.hamsterdesu.com",
    "lesson": "Attributable reports",
    "lessonTh": "ที่มารายงานสาธารณะ",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 45,
    "name": "แผนที่โครงข่ายการระบายน้ำ กทม.ปริมณฑล (thaivaluer.com/zoomify)",
    "nameEn": "Bangkok drainage network (ThaiValuer)",
    "url": "https://thaivaluer.com/zoomify/",
    "lesson": "Drainage context",
    "lessonTh": "บริบทการระบายน้ำ",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 46,
    "name": "NPT RiskMap V2 · พืชเกษตรนครปฐม",
    "nameEn": "NPT RiskMap V2",
    "url": "https://npt-dashboard.netlify.app/riskmap-v2",
    "lesson": "Independent corroboration",
    "lessonTh": "ยืนยันจากแหล่งอิสระ",
    "status": "improved",
    "evidence": [
      "scripts/haze-vision.mjs"
    ],
    "inspection": "inspected-in-source-catalogue"
  },
  {
    "sourceIndex": 47,
    "name": "Flood scan · ถนนน้ำท่วมจาก GPS (flood-scan-bkk-vicinity.netlify.app)",
    "nameEn": "Flood Scan: GPS road anomalies",
    "url": "https://flood-scan-bkk-vicinity.netlify.app/",
    "lesson": "Traffic anomalies are not proof of flooding",
    "lessonTh": "การจราจรผิดปกติไม่ยืนยันว่าน้ำท่วม",
    "status": "reference",
    "evidence": [],
    "inspection": "inspected-in-source-catalogue"
  }
];
