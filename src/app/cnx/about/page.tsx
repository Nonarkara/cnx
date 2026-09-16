import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ระบบทำงานอย่างไร — Chiang Mai War Room",
  description:
    "เอกสารอธิบายระบบห้องปฏิบัติการเชียงใหม่แบบภาษาคนธรรดา: ข้อมูลมาจากไหน ระบบคิดอย่างไร และกติกาความซื่อสัตย์ของข้อมูล",
  keywords: [
    "Chiang Mai War Room",
    "CNX Dashboard",
    "Lanna",
    "Doi Suthep",
    "RCAD",
    "depa",
    "Smart City Thailand",
    "Ping River",
    "burning season",
    "PM2.5",
    "RFD hotspots",
  ],
};

const WORDMARK = "/logos/cnx-wordmark.svg";

export default function CNXAboutPage() {
  return (
    <main
      data-surface="cnx-dashboard"
      className="min-h-[100dvh] bg-[var(--bg)] text-[var(--ink)]"
    >
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b border-[var(--line)] bg-[var(--bg-surface)] backdrop-blur-md">
        <div className="flex h-12 w-full items-stretch justify-between">
          <div className="flex items-stretch">
            {/* Logo plate: wordmark + partner logos (matches dashboard) */}
            <div className="flex shrink-0 items-center border-r border-[var(--line)] px-2.5 sm:px-3">
              <a
                title="หน้าแรกห้องปฏิบัติการเชียงใหม่"
                className="flex items-center"
                href="/cnx"
              >
                <div className="flex shrink-0 items-center gap-2.5 bg-white px-2.5 py-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={WORDMARK}
                    alt="จังหวัดเชียงใหม่ · Chiang Mai"
                    title="จังหวัดเชียงใหม่ · Chiang Mai"
                    style={{ height: 28, width: "auto" }}
                    className="block object-contain"
                  />
                  <span
                    aria-hidden="true"
                    className="hidden h-6 w-px shrink-0 bg-[#1d2951]/35 lg:inline-block"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/rcad.svg"
                    alt="RCAD — Royal College of Architectural Designers"
                    title="RCAD — Royal College of Architectural Designers"
                    style={{ height: 24, width: "auto" }}
                    className="hidden object-contain lg:block"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/depa.jpg"
                    alt="depa — สำนักงานส่งเสริมเศรษฐกิจดิจิทัล"
                    title="depa — สำนักงานส่งเสริมเศรษฐกิจดิจิทัล"
                    style={{ height: 24, width: "auto" }}
                    className="hidden object-contain lg:block"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/smart-city-thailand.jpg"
                    alt="Smart City Thailand"
                    title="Smart City Thailand"
                    style={{ height: 24, width: "auto" }}
                    className="hidden object-contain lg:block"
                  />
                </div>
              </a>
            </div>

            {/* Province identity */}
            <div className="relative flex min-w-0 items-center gap-2 py-1 pl-3 pr-3 md:min-w-[190px]">
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 top-0 w-1 bg-[#1d2951]"
              />
              <div className="flex min-w-0 flex-col justify-center leading-none">
                <a className="hover:opacity-90" href="/cnx">
                  <h1
                    className="truncate text-[14px] font-bold text-[var(--ink)] lg:text-[15px]"
                    lang="th"
                  >
                    ห้องปฏิบัติการเชียงใหม่
                  </h1>
                </a>
                <span className="mt-0.5 truncate text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
                  Chiang Mai Operations
                </span>
              </div>
            </div>

            {/* Primary nav */}
            <nav
              aria-label="เมนูหลัก · Primary Navigation"
              className="hidden items-stretch border-l border-[var(--line)] md:flex"
            >
              <a
                className="flex items-center border-r border-[var(--line)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors text-[var(--dim)] hover:bg-[var(--bg-raised)] hover:text-[var(--ink)]"
                href="/cnx"
              >
                <span lang="th">แผนที่</span>
                <span className="ml-1 hidden text-[9px] font-normal opacity-60 xl:inline">
                  Map
                </span>
              </a>
              <a
                aria-current="page"
                className="flex items-center border-r border-[var(--line)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors border-b-2 border-b-[var(--cool)] bg-[var(--cool-dim)] text-[var(--cool)]"
                href="/cnx/about"
              >
                <span lang="th">เกี่ยวกับ</span>
                <span className="ml-1 hidden text-[9px] font-normal opacity-60 xl:inline">
                  About
                </span>
              </a>
            </nav>
          </div>

          <div className="flex items-stretch justify-end">
            <div className="flex items-stretch border-l border-[var(--line)]">
              <a
                href="/cnx"
                title="กลับไปแผนที่ · Back to the war room"
                aria-label="กลับไปแผนที่ · Back to the war room"
                className="inline-flex min-h-[44px] items-center gap-1 border border-[var(--line)] px-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--dim)] transition-colors hover:border-[var(--cool)] hover:text-[var(--cool)] sm:px-3"
                lang="th"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 7v14" />
                  <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
                </svg>
                <span className="hidden sm:inline">คู่มือ</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Body ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[880px] px-5 py-8">
        {/* Title block */}
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
          เอกสารอธิบายระบบ · How the system works
        </div>
        <h1 className="mt-1 text-[34px] font-bold leading-[1.15] tracking-[-0.02em]" lang="th">
          ห้องปฏิบัติการเชียงใหม่
          <span className="ml-3 text-[18px] font-semibold text-[var(--dim)]">
            Chiang Mai Operations War Room
          </span>
        </h1>
        <p className="mt-3 max-w-[70ch] text-[16px] leading-[1.75]" lang="th">
          เอกสารนี้อธิบายว่าระบบทำงานอย่างไร ด้วยภาษาที่ไม่ต้องเป็นนักเทคนิคก็อ่านเข้าใจ — ข้อมูลมาจากไหน ระบบตัดสินใจอย่างไร และทำไมถึงเชื่อถือได้
        </p>
        <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
          A plain-language explanation of the system: where every number comes from, how the system reaches its judgments, and why it can be trusted.
        </p>

        {/* ─── Section 01: What this is ──────────────────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            01 · What this is
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            ระบบนี้คืออะไร
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
            <p lang="th">
              คือ “หน้าต่างบานเดียว” ที่รวมข้อมูลสาธารณะของจังหวัดเชียงใหม่ไว้ในที่เดียว: ระดับน้ำแม่ปิงและเขื่อนแม่งัด จุดความร้อนจากกรมป่าไม้และดาวเทียม ค่าฝุ่น PM2.5 ทุกอำเภอ เที่ยวบินเข้า-ออกสนามบินเชียงใหม่แบบเรียลไทม์ ข่าวและโซเชียล 8 ภาษาตามต้นทางผู้โดยสาร กล้องสาธารณะ **เมืองสามมิติของตึก กำแพง และวัด 59,344 หลัง** และชุดข้อมูลเปิดภาครัฐทั้งหมด 411 ชุดของจังหวัด — อัปเดตเองตลอดเวลา ไม่ต้องรอรายงานกระดาษ
            </p>
            <p lang="th">
              จอใหญ่ในศูนย์บัญชาการ (IOC) เห็นภาพรวมทั้งจังหวัดพร้อมกัน ส่วนมือถือของผู้ปฏิบัติงานเห็น “คำสั่งที่ต้องทำตอนนี้” เป็นอย่างแรกเสมอ
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              A single window that gathers Chiang Mai&rsquo;s public data — Ping river telemetry and the Mae Ngat dam, Royal Forest Department hotspots and NASA FIRMS satellite detections, PM2.5 per amphoe (25 districts), real-time CNX airport flights, multilingual news in 8 languages (auto-selected from inbound flight origins), public cameras, and the province&rsquo;s full 411-record open-data catalog — self-updating. The IOC wall sees everything at once; an operator&rsquo;s phone leads with the action to take.
            </p>
          </div>
        </section>

        {/* ─── Section 02: Where the data comes from ─────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            02 · Where the data comes from
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            ข้อมูลมาจากไหน
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
            <p lang="th">
              ระบบไม่สร้างข้อมูลเอง — มันไปรับข้อมูลจากหน่วยงานที่วัดจริง แล้วนำมาเรียงให้อ่านง่าย: กรมป่าไม้ (จุดความร้อน 25 อำเภอ พร้อมแยกประเภทเขตป่าสงวน/อุทยาน/พื้นที่ราษฎร์), GISTDA ให้ค่า PM2.5 รายอำเภอและภาพดาวเทียม AOD, NASA FIRMS ให้จุดไฟ MODIS/VIIRS, NASA GIBS ให้ชั้นภาพถ่ายดาวเทียม, Open-Meteo CAMS ให้ค่า AQI ทั่วโลก, OpenSky Network ให้เที่ยวบินเข้า-ออกสนามบิน CNX แบบ ADS-B, Google News RSS และ GDELT 2.0 ให้ข่าว 8 ภาษา (จีน/ญี่ปุ่น/เกาหลี/รัสเซีย/เยอรมัน/ฝรั่งเศส/อินเดีย/ออสเตรเลีย), OSM Overpass ให้เส้นทางรถเมล์/สายน้ำ/อาคาร 3D 59,344 หลัง / กำแพงเมือง 14 ชิ้น / วัด 474 วัด, Arnis (`arnismc.com`) ให้โลก Minecraft จำลองของจริงของเมืองเก่าเชียงใหม่, ThaiWater v3 (สสน.) ให้ระดับน้ำและฝนรายสถานี province=50, Longdo/iTIC ให้กล้องสาธารณะ, และ data.go.th ให้ชุดข้อมูลราชการของจังหวัดทั้งหมด 411 ชุด
            </p>
            <p lang="th">
              ทุกแผงบนหน้าจอมีป้ายบอกแหล่งที่มากำกับเสมอ — กดดูรายละเอียดได้ทุกจุด รายการเต็มอยู่ในเอกสารดาวน์โหลดท้ายหน้านี้
            </p>
            <p lang="th">
              **เมืองสามมิติบนแผนที่** สร้างจากข้อมูล OpenStreetMap เช่นเดียวกับ Arnis (`arnismc.com` — ตัวสร้างโลก Minecraft จากข้อมูลจริง) — อาคาร 59,344 หลัง, กำแพงเมืองเก่า 14 ชิ้น (รวมประตูสวนดอก, แจ่งศรีภูมิ, แจ่งกู่เฮือง, แจ่งหัวลิน, แจ่งก๊ะต๊ำ), และวัด 474 แห่ง ถูกแยกเป็น 4 ชั้นข้อมูล: `buildings-core.geojson` (10 MB, Old City + Doi Suthep), `buildings-wide.geojson` (10 MB, เขตเมืองรอบนอก), `temples.geojson` (212 KB, ทองคำล้านนา), `walls.geojson` (8 KB, เส้นกำแพงเมือง) — โหลดเร็วเหมือน atlas.nonarkara.org เพราะ MapLibre สลับชั้นตามระดับซูม ไม่ใช่โหลดทั้งหมดทีเดียว
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              The system measures nothing itself — it relays the agencies that do: Royal Forest Department (25-amphoe hotspots, with forest-tenure classification across DNP / NRF / ALOW / CMF / FIO lands), GISTDA (per-amphoe PM2.5 + AOD satellite tiles), NASA FIRMS (MODIS + VIIRS), NASA GIBS (satellite imagery base), Open-Meteo CAMS (global AQI), OpenSky Network (ADS-B flights), Google News RSS + GDELT 2.0 (news in 8 languages — zh/ja/ko/ru/de/fr/en-IN/en-AU, auto-driven by inbound flight origins), OSM Overpass (bus routes, waterways, 3D buildings), ThaiWater v3 / HII (water + rain at province_code=50), Longdo / iTIC (CCTV), and the province&rsquo;s full 311-record open-data catalog on data.go.th. Every panel carries its attribution.
            </p>
          </div>
        </section>

        {/* ─── Section 03: How it thinks ─────────────────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            03 · How it thinks
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            ระบบคิดอย่างไร
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
            <p lang="th">
              หลักการเดียวกันทั้งระบบ: <strong>ตัวเลขไม่ใช่คำตอบ — คำกริยาคือคำตอบ</strong> ระบบแปลงตัวเลขเป็นการปฏิบัติหนึ่งอย่างเสมอ เช่น จุดความร้อนเกิน 5 จุดในเขตอุทยาน = “แจ้งเจ้าหน้าที่ดับไฟ ประสานกำนันผู้ใหญ่บ้าน” ฝุ่น PM2.5 เกิน 75 µg/m³ = “ออกประกาศงดกิจกรรมกลางแจ้ง สวมหน้ากาก”
            </p>
            <p lang="th">
              ค่าฝุ่นทั้งจังหวัดใช้ “สถานีที่แย่ที่สุด” ไม่ใช่ค่าเฉลี่ย — ชุมชนที่อากาศแย่หนึ่งแห่งจะไม่ถูกเฉลี่ยจนมองไม่เห็น และมีกติกาพิเศษของเชียงใหม่: จุดความร้อนในเขตป่าสงวนจะถูกจัดลำดับความสำคัญเหนือกว่าจุดในพื้นที่เกษตร (เพราะการลุกลามเข้าเขตอุทยานคือความเสี่ยงสูงสุด) ช่วงฤดูเผา (มี.ค.-เม.ย.) ระบบจะเร่งการแจ้งเตือนโดยอัตโนมัติ
            </p>
            <p lang="th">
              จุดวิเคราะห์หลักของระบบคือ “สมุดบัญชีแม่ปิง” — ลุ่มน้ำเดียวกันท่วมเดือนตุลาคม (มรสุมตะวันตกเฉียงใต้) และแล้งเดือนเมษายน (ฤดูเผา + พายุฤดูร้อน) เขื่อนแม่งัดคือบัญชีที่คั่นกลาง ทุกการระบายคือการแลก ความเสี่ยงน้ำท่วมท้ายน้ำคืนนี้กับน้ำชลประทานฤดูแล้งปีหน้า
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              One principle everywhere: a number is not an answer — a verb is. Readings become one imperative action. The province air score is worst-station-wins, never an average. A Chiang Mai-specific rule prioritises hotspots inside Royal Forest / National Reserve lands over agricultural-field hotspots (because escalation into park boundaries is the highest-risk path); during burning season (Mar–Apr) the alert cadence auto-tightens. The keystone read is the Ping Ledger: the same basin floods in October (southwest monsoon) and burns dry in April (burning season + pre-monsoon storms), and the Mae Ngat dam is the ledger between the two.
            </p>
          </div>
        </section>

        {/* ─── Section 04: The honesty rules ─────────────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            04 · The honesty rules
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            กติกาความซื่อสัตย์
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
            <p lang="th">
              1) ทุกตัวเลขติดป้ายว่าเป็นข้อมูล <strong>สด / จำลอง / แบบจำลอง</strong> — ไม่มีตัวเลขแต่งขึ้น 2) ภาพกล้องที่ยังไม่ใช่ของจริงติดป้าย <strong>สาธิต DEMO</strong> สีเหลืองเสมอ พร้อมลิงก์ต้นทางและตำแหน่งจริง 3) เมื่อไม่มีข้อมูล ระบบบอกว่า “ข้อมูลไม่พอ” — ไม่แสดงสีเขียวหลอก 4) ชุดข้อมูลที่อ่านไม่ได้ถูกบันทึกไว้ให้เห็น ไม่ถูกซ่อน
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              Every number is labeled live / scenario / model — nothing is invented. Demo footage always wears the amber DEMO badge with its source link. No data reads as &ldquo;not enough data,&rdquo; never as a false green. Unreadable datasets are listed, not hidden.
            </p>
          </div>
        </section>

        {/* ─── Section 05: Architecture, briefly ──────────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            05 · Architecture, briefly
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            สถาปัตยกรรมแบบย่อ
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
            <p lang="th">
              ไม่มีเซิร์ฟเวอร์ที่ต้องเฝ้า: หน้าเว็บทำงานบน Cloudflare (เครือข่ายขอบโลก) ตัวเว็บไปดึงฟีดสดเองทุกนาที ข้อมูลที่เปลี่ยนช้า (ขอบเขต 25 อำเภอ สายน้ำลุ่มปิง เส้นทางรถเมล์ อาคาร 3D แค็ตตาล็อกราชการ 411 ชุด จุดสนใจ 12 แห่ง) ถูก “อบ” เป็นไฟล์ไว้ล่วงหน้าด้วยสคริปต์ที่รันซ้ำได้เสมอ ระบบทั้งหมดโคลนได้จาก GitHub และดีพลอยได้ฟรี — ดูเอกสาร “ติดตั้งระบบเอง” ด้านล่าง
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              No servers to babysit: the app runs on Cloudflare&rsquo;s edge, fetching live feeds per minute; slow-changing data (25-amphoe boundaries, Ping basin waterways, bus routes, 3D buildings, 311-record provincial catalog, 12 POIs) is baked to files by idempotent scripts. The whole system clones from GitHub and deploys free — see the setup document below.
            </p>
          </div>
        </section>

        {/* ─── Section 06: University partners ───────────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            06 · University partners
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            พันธมิตรมหาวิทยาลัย
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
            <p lang="th">
              ศูนย์บริหารจัดการมหาวิทยาลัยอัจฉริยะ (Smart Campus Management Center — SCMC) มหาวิทยาลัยเชียงใหม่ เผยแพร่ข้อมูลอุบัติเหตุและข้อมูลยานพาหนะสาธารณะผ่าน Tableau Public — ฝังไว้ด้านล่างโดยตรงจากต้นทาง
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              Chiang Mai University&rsquo;s Smart Campus Management Center (SCMC) publishes accident and campus-vehicle datasets on Tableau Public. Embedded live below, straight from the source — this dashboard doesn&rsquo;t re-host or scrape their data.
            </p>
          </div>
          <div className="mt-4 border border-[var(--line)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--bg-surface)] px-3 py-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
                Accident — CMU SCMC
              </span>
              <a
                href="https://public.tableau.com/app/profile/scmc/viz/Accident_17206129265280/Accident"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--cool)] hover:underline"
              >
                Open on Tableau Public ↗
              </a>
            </div>
            <iframe
              title="CMU SCMC — Accident dashboard"
              src="https://public.tableau.com/views/Accident_17206129265280/Accident?:showVizHome=no&:embed=true&:language=en-US"
              className="h-[600px] w-full"
              loading="lazy"
            />
          </div>
          <p className="mt-2 font-mono text-[10px] text-[var(--dim)]" lang="th">
            แหล่งอื่นจาก SCMC:{" "}
            <a
              href="https://public.tableau.com/app/profile/scmc/viz/Accident_17206129265280"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--cool)] underline-offset-2 hover:underline"
            >
              ข้อมูลการลงทะเบียนยานพาหนะ
            </a>{" "}
            ·{" "}
            <a
              href="https://public.tableau.com/app/profile/scmc"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--cool)] underline-offset-2 hover:underline"
            >
              SCMC profile
            </a>
          </p>
        </section>

        {/* ─── Section 07: Downloads ─────────────────────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            07 · Downloads
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            ดาวน์โหลดเอกสาร
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
            <div className="grid gap-2 sm:grid-cols-3">
              <a
                href="/docs/cnx-sources.md"
                download
                className="border border-[var(--line)] p-3 transition-colors hover:border-[var(--cool)]"
              >
                <div className="text-[14px] font-bold" lang="th">
                  แหล่งข้อมูลทั้งหมด
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--cool)]">
                  All data sources (.md)
                </div>
                <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--dim)]" lang="th">
                  ทุกฟีด ทุกลิงก์ ทุกสัญญาอนุญาต — ตารางเดียวครบ
                </p>
              </a>
              <a
                href="/docs/cnx-methodology.md"
                download
                className="border border-[var(--line)] p-3 transition-colors hover:border-[var(--cool)]"
              >
                <div className="text-[14px] font-bold" lang="th">
                  ระบบคิดอย่างไร
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--cool)]">
                  Methodology (.md)
                </div>
                <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--dim)]" lang="th">
                  ทุกเกณฑ์ ทุกสูตร: ระดับน้ำ, AQI ไทย 2566, จุดความร้อน, บัญชีน้ำปิง
                </p>
              </a>
              <a
                href="/docs/cnx-setup.md"
                download
                className="border border-[var(--line)] p-3 transition-colors hover:border-[var(--cool)]"
              >
                <div className="text-[14px] font-bold" lang="th">
                  ติดตั้งระบบเอง
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--cool)]">
                  Clone &amp; run (.md)
                </div>
                <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--dim)]" lang="th">
                  โคลนจาก GitHub → ดึงข้อมูล → ดีพลอยฟรีบน Cloudflare — ทีละขั้น
                </p>
              </a>
            </div>
            <p className="text-[13px] text-[var(--dim)]" lang="th">
              ซอร์สโค้ดทั้งหมด:{" "}
              <a
                href="https://github.com/Nonarkara/cnx"
                className="text-[var(--cool)] underline-offset-2 hover:underline"
              >
                github.com/Nonarkara/cnx
              </a>
            </p>
          </div>
        </section>

        {/* ─── Section 07: Leadership — two cards ────────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            07 · Project sponsor &amp; system architect
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            ผู้สนับสนุนและผู้ออกแบบระบบ
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-4 text-[15px] leading-[1.75]">
            {/* RCAD — project sponsor */}
            <div className="border border-[var(--line)] bg-[var(--bg-surface)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--cool)]">
                  Project Sponsor
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logos/rcad.svg"
                  alt="RCAD — Royal College of Architectural Designers"
                  title="RCAD — Royal College of Architectural Designers"
                  style={{ height: 32, width: "auto" }}
                  className="block object-contain"
                />
              </div>
              <h3 className="mt-2 text-[20px] font-bold text-[var(--ink)]" lang="th">
                รศ. ดร. พูน เที่ยงบูรณธรรม
                <span className="ml-2.5 font-normal text-[15px] text-[var(--dim)]">
                  (Assoc. Prof. Poon Thiengburanathum, PhD)
                </span>
              </h3>
              <p className="mt-2 text-[14px] leading-[1.7] text-[var(--ink)]" lang="th">
                ประธาน Royal College of Architectural Designers (RCAD) — ผู้สนับสนุนโครงการห้องปฏิบัติการเชียงใหม่ สนับสนุนด้านสถาปัตยกรรมเมืองและการออกแบบเชิงนวัตกรรมเพื่อให้ระบบดิจิทัลแฝดเมืองตอบโจทย์บริบทล้านนาได้อย่างแท้จริง
              </p>
              <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
                Chair of the Royal College of Architectural Designers (RCAD) — the project&rsquo;s institutional sponsor. RCAD&rsquo;s support anchors the city-architecture and innovative-design lens that grounds the Chiang Mai digital twin in the Lanna context.
              </p>
              <div className="mt-4 border-t border-[var(--line)] pt-3 font-mono text-[11px] text-[var(--dim)]">
                <span>
                  องค์กร:{" "}
                  <a
                    href="https://www.nxpo.or.th/rcad/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--cool)] underline-offset-2 hover:underline"
                  >
                    RCAD · nxpo.or.th/rcad
                  </a>
                </span>
              </div>
            </div>

            {/* Dr Non — system architect */}
            <div className="border border-[var(--line)] bg-[var(--bg-surface)] p-5">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--cool)]">
                Digital Twin &amp; Smart City Architecture Lead
              </div>
              <h3 className="mt-1 text-[20px] font-bold text-[var(--ink)]" lang="th">
                ดร.นน อัครประเสริฐกุล
                <span className="ml-2.5 font-normal text-[15px] text-[var(--dim)]">
                  (Dr Non Arkaraprasertkul)
                </span>
              </h3>
              <p className="mt-2 text-[14px] leading-[1.7] text-[var(--ink)]" lang="th">
                ผู้เชี่ยวชาญอาวุโส ฝ่ายส่งเสริมเมืองอัจฉริยะ สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (depa) กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม — ผู้ออกแบบสถาปัตยกรรมและขับเคลื่อนการพัฒนา ระบบห้องปฏิบัติการดิจิทัลแฝดเมือง (Digital Twin Operations War Room) ของจังหวัดเชียงใหม่ ลพบุรี และภูเก็ต
              </p>
              <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
                Senior Expert in Smart City Promotion at the Digital Economy Promotion Agency (depa), Ministry of Digital Economy and Society, Thailand. Principal architect and lead engineer of the Chiang Mai, Lopburi, and Phuket provincial digital twin war room platforms.
              </p>
              <div className="mt-4 border-t border-[var(--line)] pt-3 font-mono text-[11px] text-[var(--dim)]">
                <span>
                  การศึกษา: B.Arch. (เกียรตินิยมอันดับหนึ่ง จุฬาฯ), M.A. (MIT), M.Sc. (Oxford), A.M., Ph.D. (Harvard)
                </span>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--line)] py-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--dim)]">
          จังหวัดเชียงใหม่ · RCAD · สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (depa) · Smart City Thailand — ข้อมูลจากหน่วยงานที่ระบุในเอกสารแหล่งข้อมูล
        </footer>
      </div>
    </main>
  );
}