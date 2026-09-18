// Shared About/Research content — rendered both by the standalone
// /cnx/about route (for direct links/sharing) and by CNXAboutModal
// (the in-app pop-up opened from the top bar's Research button, so
// visitors do not have to leave the war room in a new tab/window).

const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** One box in the architecture diagrams below. */
function DiagramBox({
  x,
  y,
  w,
  h,
  title,
  subtitle,
  mono,
  variant = "default",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle?: string;
  mono?: string;
  variant?: "default" | "accent" | "danger" | "muted";
}) {
  const stroke =
    variant === "accent" ? "var(--cool)" : variant === "danger" ? "var(--danger)" : variant === "muted" ? "var(--line)" : "var(--line)";
  const fill = variant === "accent" ? "var(--cool-dim)" : variant === "danger" ? "rgba(239,68,68,0.08)" : "var(--bg-raised)";
  const titleColor = variant === "danger" ? "var(--danger)" : "var(--ink)";
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={variant === "accent" ? 1.5 : 1} />
      <text x={x + 10} y={y + 20} fontSize={11} fontWeight={700} fill={titleColor} style={{ fontFamily: MONO_STACK }}>
        {title}
      </text>
      {subtitle && (
        <text x={x + 10} y={y + 35} fontSize={9.5} fill="var(--dim)" style={{ fontFamily: MONO_STACK }}>
          {subtitle}
        </text>
      )}
      {mono && (
        <text x={x + 10} y={y + h - 9} fontSize={8.5} fill="var(--cool)" style={{ fontFamily: MONO_STACK }}>
          {mono}
        </text>
      )}
    </g>
  );
}

/** Simple horizontal or vertical arrow between two points. */
function DiagramArrow({ x1, y1, x2, y2, dashed }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="var(--dim)"
      strokeWidth={1.25}
      strokeDasharray={dashed ? "3,3" : undefined}
      markerEnd="url(#cnx-arrowhead)"
    />
  );
}

function DiagramDefs() {
  return (
    <defs>
      <marker id="cnx-arrowhead" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="var(--dim)" />
      </marker>
    </defs>
  );
}

export default function CNXAboutContent() {
  return (
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
              คือ “หน้าต่างบานเดียว” ที่รวมข้อมูลสาธารณะของจังหวัดเชียงใหม่ไว้ในที่เดียว: ระดับน้ำแม่ปิงและเขื่อนแม่งัด จุดความร้อนจากกรมป่าไม้และดาวเทียม ค่าฝุ่น PM2.5 ทุกอำเภอ เที่ยวบินเข้า-ออกสนามบินเชียงใหม่แบบเรียลไทม์ ข่าวและโซเชียล 8 ภาษาตามต้นทางผู้โดยสาร กล้องสาธารณะ เมืองสามมิติของตึก กำแพง และวัด 59,344 หลัง และชุดข้อมูลเปิดภาครัฐทั้งหมด 311 ชุดของจังหวัด — อัปเดตเองตลอดเวลา ไม่ต้องรอรายงานกระดาษ
            </p>
            <p lang="th">
              จอใหญ่ในศูนย์บัญชาการ (IOC) เห็นภาพรวมทั้งจังหวัดพร้อมกัน ส่วนมือถือของผู้ปฏิบัติงานเห็น “คำสั่งที่ต้องทำตอนนี้” เป็นอย่างแรกเสมอ
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              A single window that gathers Chiang Mai&rsquo;s public data — Ping river telemetry and the Mae Ngat dam, Royal Forest Department hotspots and NASA FIRMS satellite detections, PM2.5 per amphoe (25 districts), real-time CNX airport flights, multilingual news in 8 languages (auto-selected from inbound flight origins), public cameras, a 3D city of 59,344 buildings/walls/temples, and the province&rsquo;s full 311-record open-data catalog — self-updating. The IOC wall sees everything at once; an operator&rsquo;s phone leads with the action to take.
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
              ระบบไม่สร้างข้อมูลเอง — มันไปรับข้อมูลจากหน่วยงานที่วัดจริง แล้วนำมาเรียงให้อ่านง่าย: กรมป่าไม้ (จุดความร้อน 25 อำเภอ พร้อมแยกประเภทเขตป่าสงวน/อุทยาน/พื้นที่ราษฎร์), GISTDA ให้ค่า PM2.5 รายอำเภอและภาพดาวเทียม AOD, NASA FIRMS ให้จุดไฟ MODIS/VIIRS, NASA GIBS ให้ชั้นภาพถ่ายดาวเทียม (รวมฮิมาวาริ-9 อินฟราเรดและ AOD), RainViewer ให้เรดาร์ฝนสด, Open-Meteo CAMS ให้ค่า AQI ทั่วโลก, OpenSky Network และ adsb.lol ให้เที่ยวบินเข้า-ออกสนามบิน CNX แบบ ADS-B, Google News RSS และ GDELT 2.0 ให้ข่าว 8 ภาษา (จีน/ญี่ปุ่น/เกาหลี/รัสเซีย/เยอรมัน/ฝรั่งเศส/อินเดีย/ออสเตรเลีย), OSM Overpass ให้เส้นทางรถเมล์/สายน้ำ/อาคาร 3 มิติ 59,344 หลัง / กำแพงเมือง 14 ชิ้น / วัด 474 วัด, มหาวิทยาลัยเชียงใหม่ (SCMC) ให้ตำแหน่งรถรับส่งภายในมหาวิทยาลัยแบบ GPS สด, ThaiWater v3 (สสน.) ให้ระดับน้ำและฝนรายสถานี, Longdo ให้กล้องสาธารณะ, และ data.go.th ให้ชุดข้อมูลราชการของจังหวัดทั้งหมด 311 ชุด
            </p>
            <p lang="th">
              ทุกแผงบนหน้าจอมีป้ายบอกแหล่งที่มากำกับเสมอ — กดดูรายละเอียดได้ทุกจุด รายการเต็มอยู่ในเอกสารดาวน์โหลดท้ายหน้านี้
            </p>
            <p lang="th">
              เมืองสามมิติบนแผนที่สร้างจากข้อมูล OpenStreetMap — อาคาร 59,344 หลัง (แยกเป็น <code>buildings-core.geojson</code> ย่านเมืองเก่า/ดอยสุเทพ และ <code>buildings-wide.geojson</code> เขตเมืองรอบนอก), กำแพงเมืองเก่า 14 ชิ้น, และวัด 474 แห่ง ถูกแยกเป็นไฟล์ต่างหากตามระดับซูม — MapLibre จึงสลับชั้นตามระยะซูมแทนที่จะโหลดทั้งหมดทีเดียว
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              The system measures nothing itself — it relays the agencies that do: Royal Forest Department (25-amphoe hotspots, forest-tenure classified), GISTDA (per-amphoe PM2.5 + AOD satellite tiles), NASA FIRMS (MODIS + VIIRS), NASA GIBS (Himawari-9 infrared and MODIS AOD tiles), RainViewer (live precipitation radar), Open-Meteo CAMS (global AQI), OpenSky Network and adsb.lol (ADS-B flights), Google News RSS + GDELT 2.0 (news in 8 languages, auto-driven by inbound flight origins), OSM Overpass (bus routes, waterways, 3D buildings), Chiang Mai University&rsquo;s Smart Campus Management Center (live shuttle GPS over MQTT), ThaiWater v3 / HII (water + rain telemetry), Longdo (CCTV), and the province&rsquo;s 311-record open-data catalog on data.go.th. Every panel carries its attribution.
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
            <p lang="th">
              ตัวอย่างที่เป็นรูปธรรม: รถบัสสนามบิน RTC บนแผนที่คือ <strong>การจำลองจากตารางเวลา</strong> ไม่ใช่ GPS จริง (วิ่งคงที่ 35 กม./ชม. ตามเส้นทาง) — ในขณะที่รถรับส่งมหาวิทยาลัยเชียงใหม่คือ <strong>GPS สดจริง</strong> จากมหาวิทยาลัย ทั้งสองแยกป้ายกำกับชัดเจนบนปุ่มควบคุมแผนที่ ส่วนตัวเลข “ผู้โดยสารประมาณการ” มาจากจำนวนที่นั่งเครื่องบินจริงคูณด้วยอัตราภาระบรรทุกสมมติ (82% สำหรับข้อมูลผู้โดยสารขาเข้า หรือค่าที่นั่งเฉลี่ยตามขนาดเครื่องสำหรับข้อมูลเที่ยวบินขาออก) — เที่ยวบินและประเทศต้นทางเป็นข้อมูลจริง มีเพียงจำนวนผู้โดยสารเท่านั้นที่เป็นค่าประมาณ
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              Every number is labeled live / scenario / model — nothing is invented. Demo footage always wears the amber DEMO badge with its source link. No data reads as &ldquo;not enough data,&rdquo; never as a false green. Unreadable datasets are listed, not hidden. Concretely: the RTC airport buses on the map are a <strong>timetable simulation</strong> (a constant 35 km/h along the published route), not live GPS — while the CMU campus shuttles are <strong>real, live GPS</strong> from the university&rsquo;s own feed; both are labeled accordingly on the map controls. &ldquo;Estimated visitors&rdquo; multiplies real seat capacity by an assumed load factor (82% for inbound arrivals, or a size-based average for outbound flights) — the flight counts and origin countries are real; only the passenger count is an estimate.
            </p>
          </div>
        </section>

        {/* ─── Section 05: Architecture, in diagrams ──────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            05 · Architecture, in diagrams
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            สถาปัตยกรรมเป็นแผนภาพ
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
            <p lang="th">
              ไม่มีเซิร์ฟเวอร์ที่ต้องเฝ้า: หน้าเว็บทำงานบน Cloudflare Workers (ผ่าน OpenNext, Next.js 15) ตัวเว็บไปดึงฟีดสดเองทุกนาที ข้อมูลที่เปลี่ยนช้า (ขอบเขต 25 อำเภอ สายน้ำลุ่มปิง เส้นทางรถเมล์ อาคาร 3D แค็ตตาล็อกราชการ 311 ชุด) ถูก “อบ” เป็นไฟล์ไว้ล่วงหน้าด้วยสคริปต์ที่รันซ้ำได้เสมอ
            </p>
            <p lang="th">
              แต่ระบบสำรองข้อมูลไม่ได้ใช้แบบเดียวกันหมดทุกจุด — โมดูลส่วนใหญ่ลองดึงข้อมูลสดก่อน แล้วตกไปใช้ “สถานการณ์จำลอง” ที่ติดป้ายชัดเจนเมื่อดึงไม่สำเร็จ, สามโมดูล (เส้นทางรถเมล์ สายน้ำ ข้อมูลเปิด) อ่านไฟล์ที่อบไว้ล่วงหน้าผ่าน Cloudflare Workers เป็นหลัก แล้วเรียก API สดเป็นทางเลือกสุดท้าย, และเที่ยวบิน (ซึ่งซับซ้อนที่สุด) ใช้วิธีที่ต่างออกไปทั้งหมด — ดูแผนภาพที่สองด้านล่าง
            </p>
          </div>

          <div className="mt-5 overflow-x-auto border border-[var(--line)] bg-[var(--bg-surface)] p-4">
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--dim)]">
              Diagram 1 · Five different fallback shapes, not one uniform tier system
            </div>
            <svg viewBox="0 0 960 460" className="w-full min-w-[720px]" role="img" aria-label="CNX data pipeline diagram">
              <DiagramDefs />
              {/* Column headers */}
              <text x={20} y={22} fontSize={10} fontWeight={700} fill="var(--dim)" style={{ fontFamily: MONO_STACK, letterSpacing: 1 }}>
                SOURCES
              </text>
              <text x={370} y={22} fontSize={10} fontWeight={700} fill="var(--dim)" style={{ fontFamily: MONO_STACK, letterSpacing: 1 }}>
                CLOUDFLARE WORKER — PER-MODULE FALLBACK
              </text>
              <text x={790} y={22} fontSize={10} fontWeight={700} fill="var(--dim)" style={{ fontFamily: MONO_STACK, letterSpacing: 1 }}>
                SURFACES
              </text>

              {/* Sources column */}
              <DiagramBox x={20} y={40} w={190} h={44} title="Live public APIs" subtitle="Open-Meteo, FIRMS, RFD, GISTDA…" />
              <DiagramBox x={20} y={94} w={190} h={44} title="OSM Overpass" subtitle="bus routes, waterways" />
              <DiagramBox x={20} y={148} w={190} h={44} title="data.go.th (CKAN)" subtitle="baked at build/dev time" />
              <DiagramBox x={20} y={202} w={190} h={44} title="Longdo, GDELT, News" subtitle="cameras, social, RSS" />

              {/* Pattern boxes */}
              <DiagramBox
                x={330}
                y={40}
                w={280}
                h={54}
                title="A · Live → scenario fallback"
                subtitle="try upstream, catch → labeled synthetic snapshot"
                mono="air-quality.ts · fires.ts · flood.ts · aerosol.ts"
              />
              <DiagramBox
                x={330}
                y={104}
                w={280}
                h={54}
                title="B · Cache → baked file → live"
                subtitle="ASSETS binding reads own static file first"
                mono="bus-routes.ts · waterways.ts"
              />
              <DiagramBox
                x={330}
                y={168}
                w={280}
                h={54}
                title="C · Disk / ASSETS → fixed count"
                subtitle="on total failure, returns a hard-coded total"
                mono="open-data-th.ts (311 datasets)"
              />
              <DiagramBox
                x={330}
                y={232}
                w={280}
                h={64}
                title="D · External relay → KV → explicit degraded flag"
                subtitle="only module with a true degraded:true return"
                mono="opensky.ts · flights-kv.ts (see diagram 2)"
                variant="accent"
              />
              <DiagramBox
                x={330}
                y={306}
                w={280}
                h={54}
                title="E · Merge, not fallback"
                subtitle="live + curated items concatenated, deduped"
                mono="cctv.ts · social.ts"
              />

              <DiagramBox x={330} y={372} w={280} h={44} title="Retrieval (“Ask”)" subtitle="TF-IDF keyword search — no LLM, no embeddings" mono="rag.ts, ~330–390 live docs" />

              {/* Surfaces column */}
              <DiagramBox x={750} y={40} w={190} h={44} title="Map layers" subtitle="deck.gl + MapLibre" />
              <DiagramBox x={750} y={94} w={190} h={44} title="Top-bar pills" subtitle="PM2.5, fires, flood, flights" />
              <DiagramBox x={750} y={148} w={190} h={44} title="Open Data browser" subtitle="/cnx open-data panel" />
              <DiagramBox x={750} y={202} w={190} h={44} title="Ask (RAG search)" subtitle="keyword answers, sourced" />
              <DiagramBox x={750} y={256} w={190} h={44} title="CCTV / social rail" subtitle="live + DEMO-labeled" />

              {/* Arrows: sources -> patterns (approximate, illustrative) */}
              <DiagramArrow x1={210} y1={62} x2={328} y2={67} />
              <DiagramArrow x1={210} y1={116} x2={328} y2={131} />
              <DiagramArrow x1={210} y1={170} x2={328} y2={195} />
              <DiagramArrow x1={210} y1={224} x2={328} y2={333} />
              <DiagramArrow x1={210} y1={224} x2={328} y2={394} />

              {/* Arrows: patterns -> surfaces */}
              <DiagramArrow x1={610} y1={67} x2={748} y2={62} />
              <DiagramArrow x1={610} y1={131} x2={748} y2={116} />
              <DiagramArrow x1={610} y1={195} x2={748} y2={170} />
              <DiagramArrow x1={610} y1={264} x2={748} y2={224} />
              <DiagramArrow x1={610} y1={333} x2={748} y2={278} />
              <DiagramArrow x1={610} y1={394} x2={748} y2={224} dashed />

              <text x={20} y={440} fontSize={9} fill="var(--dim)" style={{ fontFamily: MONO_STACK }}>
                Every panel is one of the five patterns above, plus one direct merge — not a single universal cache chain.
              </text>
            </svg>
          </div>

          <div className="mt-6 space-y-3 text-[15px] leading-[1.75]">
            <p lang="th">
              เที่ยวบินคือกรณีพิเศษ: OpenSky และ adsb.lol ทั้งคู่ <strong>เข้าไม่ถึงจากเครือข่าย Cloudflare เอง</strong> — ยืนยันด้วย Worker ทดสอบแยกต่างหาก: OpenSky คืนรหัส 522 ของ Cloudflare (ขอบเครือข่ายเปิดการเชื่อมต่อไปยังต้นทางไม่ได้เลย ~19 วินาที) ทั้งสำหรับ endpoint ข้อมูลเที่ยวบินและ endpoint ยืนยันตัวตน ส่วน adsb.lol ตอบกลับ 429 จาก nginx (จำกัดตาม IP ที่ Cloudflare ใช้ร่วมกันทั่วโลก) ไม่ว่าจะใส่ key หรือไม่ก็ตาม — จึงไม่มีทางแก้ด้วยการยืนยันตัวตนได้เลย
            </p>
            <p lang="th">
              ทางแก้คือเครื่อง Mac เครื่องหนึ่ง (นอกเครือข่าย Cloudflare) รันสคริปต์ผ่าน launchd ดึงข้อมูลเที่ยวบินทุก 30 วินาที แล้วส่งเข้า Cloudflare KV ผ่าน endpoint ที่มีรหัสลับกำกับ — Worker จึงอ่านจาก KV ก่อนเสมอ ถ้าข้อมูลเก่าเกิน 3 นาที (แปลว่า relay หยุดทำงาน) ระบบจะรายงานว่า “ข้อมูลเสื่อมสภาพ” อย่างชัดเจน แทนที่จะแสดงตำแหน่งเครื่องบินเก่าค้างไว้
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              Flights are a special case: neither OpenSky nor adsb.lol is reachable from Cloudflare&rsquo;s own network — confirmed with a separate throwaway test Worker. OpenSky returns Cloudflare error 522 (the edge cannot even open a TCP connection to OpenSky&rsquo;s origin, ~19s) for both its flight-data and its authentication endpoints; adsb.lol returns 429 from nginx (a shared-IP rate limit tied to Cloudflare&rsquo;s egress ranges), regardless of credentials. No amount of authentication fixes a network-level block, so this cannot be solved from inside the Worker.
            </p>
          </div>

          <div className="mt-5 overflow-x-auto border border-[var(--line)] bg-[var(--bg-surface)] p-4">
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--dim)]">
              Diagram 2 · Why flights need an off-Cloudflare relay
            </div>
            <svg viewBox="0 0 960 260" className="w-full min-w-[720px]" role="img" aria-label="Flight data relay diagram">
              <DiagramDefs />
              <DiagramBox x={20} y={30} w={190} h={64} title="OpenSky Network" subtitle="states/all + OAuth2 token" mono="→ Cloudflare 522 (edge can't connect)" variant="danger" />
              <DiagramBox x={20} y={110} w={190} h={64} title="adsb.lol" subtitle="community ADS-B aggregator" mono="→ nginx 429 (shared-IP rate limit)" variant="danger" />

              <DiagramBox x={260} y={70} w={210} h={64} title="Relay machine" subtitle="scripts/relay-flights.mjs" mono="launchd · polls every 30s · not on Cloudflare" variant="accent" />

              <DiagramBox x={520} y={70} w={200} h={64} title="/api/cnx/flights/ingest" subtitle="POST, shared-secret header" mono="validates payload shape" />

              <DiagramBox x={760} y={30} w={180} h={64} title="Cloudflare KV" subtitle="CNX_FLIGHTS_KV" mono="300s TTL" variant="accent" />
              <DiagramBox x={760} y={110} w={180} h={64} title="fetchCnxSnapshot()" subtitle="reads KV first" mono="stale &gt; 3min → degraded: true" />

              <DiagramArrow x1={210} y1={62} x2={258} y2={90} />
              <DiagramArrow x1={210} y1={142} x2={258} y2={112} />
              <DiagramArrow x1={470} y1={102} x2={518} y2={102} />
              <DiagramArrow x1={720} y1={90} x2={758} y2={62} />
              <DiagramArrow x1={850} y1={94} x2={850} y2={108} />
              <DiagramArrow x1={758} y1={142} x2={720} y2={102} dashed />

              <text x={20} y={205} fontSize={9} fill="var(--dim)" style={{ fontFamily: MONO_STACK }}>
                Only the relay machine's own internet connection is used to reach OpenSky/adsb.lol — the Worker itself never tries in production.
              </text>
              <text x={20} y={220} fontSize={9} fill="var(--dim)" style={{ fontFamily: MONO_STACK }}>
                Binding: env.CNX_FLIGHTS_KV (wrangler.cnx.jsonc) · Worker: cnx-dashboard · Routes: cnx.nonarkara.org, www.cnx.nonarkara.org
              </text>
            </svg>
          </div>

          <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.7] text-[var(--dim)]">
            The whole system clones from GitHub and deploys free on Cloudflare&rsquo;s free tier — see the setup document below.
          </p>
        </section>

        {/* ─── Section 06: Is this a "digital twin"? ─────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            06 · Is this a &ldquo;digital twin&rdquo;?
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            แดชบอร์ดนี้คือ “ดิจิทัลทวิน” หรือไม่
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
            <p lang="th">
              คำว่า “ดิจิทัลทวิน” (digital twin) ถูกใช้อย่างหลวมในวงการเมืองอัจฉริยะ มาตรฐาน <strong>ISO/IEC 30173:2023</strong> (Digital twin — Concepts and terminology) ให้นิยามที่เข้มงวดกว่านั้น โดยสืบทอดแนวคิดจากงานวิชาการของ Kritzinger และคณะ (2018) ที่แบ่งระดับไว้ 3 ขั้น: <strong>แบบจำลองดิจิทัล (Digital Model)</strong> — ไม่มีการไหลของข้อมูลอัตโนมัติกับของจริงเลย, <strong>เงาดิจิทัล (Digital Shadow)</strong> — รับข้อมูลจากของจริงอัตโนมัติทิศทางเดียว (จริง → ดิจิทัล) แต่ไม่ส่งคำสั่งกลับ, และ <strong>ดิจิทัลทวินแท้จริง (Digital Twin)</strong> — ต้องมีการไหลข้อมูลสองทิศทางอัตโนมัติ คือระบบดิจิทัลส่งผลควบคุมกลับไปยังของจริงได้ด้วย
            </p>
            <p lang="th">
              ตามนิยามนี้ ห้องปฏิบัติการเชียงใหม่จัดอยู่ในระดับ <strong>“เงาดิจิทัล” (Digital Shadow)</strong> — ไม่ใช่ดิจิทัลทวินแท้จริง ระบบรับข้อมูลจริงหลายแหล่ง (เที่ยวบิน ระดับน้ำ ฝุ่น รถรับส่งมหาวิทยาลัย) มาปรับปรุงแบบจำลองเชิงพื้นที่-เวลาโดยอัตโนมัติ แต่ไม่มีช่องทางใดในสถาปัตยกรรมที่ระบบจะสั่งการกลับไปควบคุมสัญญาณไฟจราจร ประตูระบายน้ำ หรือระบบจริงอื่นใด — การไหลของข้อมูลเป็นทิศทางเดียวตลอดทั้งระบบ
            </p>
            <p lang="th">
              การจำลองรถบัส RTC (ตามตารางเวลา ไม่ใช่ GPS จริง) และตัวประมาณผู้โดยสาร (จากที่นั่งเครื่องบิน × อัตราสมมติ) เป็นเพียง<strong>กฎเกณฑ์อย่างง่าย</strong> ไม่ใช่แบบจำลองเชิงฟิสิกส์หรือแบบจำลองสินทรัพย์ (asset model) ตามแนวทาง Asset Administration Shell (IEC 63278) และกรอบงาน ISO 23247 ก็ไม่ใช้ได้โดยตรง เพราะออกแบบมาสำหรับดิจิทัลทวินในอุตสาหกรรมการผลิตโดยเฉพาะ ไม่ใช่ระบบปฏิบัติการเมือง
            </p>
            <p lang="th">
              ระบบนี้ยังไม่เคยถูกประเมินอย่างเป็นทางการตามมาตรฐานวุฒิภาวะ เช่น IEEE 3144-2025 หรือ ISO/IEC 30186:2025 — แต่จากสถาปัตยกรรมที่เป็นอยู่ (ไม่มี asset model, ไม่มีการควบคุมย้อนกลับ, ไม่มีแบบจำลองเชิงฟิสิกส์) การประเมินตามกรอบเหล่านี้อย่างตรงไปตรงมาน่าจะอยู่ในระดับวุฒิภาวะเริ่มต้นถึงปานกลางเท่านั้น
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              &ldquo;Digital twin&rdquo; gets used loosely in smart-city marketing. <strong>ISO/IEC 30173:2023</strong> (Digital twin — Concepts and terminology) is stricter, formalizing a distinction that traces back to Kritzinger et al. (2018): a <strong>Digital Model</strong> has no automatic data flow in either direction; a <strong>Digital Shadow</strong> has automatic one-way flow from the physical asset to its digital representation; a <strong>Digital Twin</strong> proper requires automatic two-way flow, including control signals back to the physical asset. By that definition, this system is a <strong>Digital Shadow</strong>, not a digital twin in the strict sense: it automatically ingests real-world state (flights, water levels, PM2.5, CMU shuttle GPS) into a live spatial-temporal model, but nothing in the architecture sends a command back to a traffic signal, a pump, or any other physical system — the data flow is one-directional throughout.
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              The RTC bus &ldquo;simulation&rdquo; is a timetable-driven rule (a constant 35 km/h along a fixed route, not live GPS or a physics engine), and the visitor/arrival estimates apply a fixed seat-count or load-factor assumption to real flight data — both are simple deterministic heuristics, not the physics-based or asset-modeled simulation implied by frameworks like the Asset Administration Shell (IEC 63278) or ISO 23247 (which is scoped to manufacturing digital twins and does not claim to cover urban operations systems like this one). This system has not been formally assessed against IEEE 3144-2025 (Digital Twin Maturity Model and Assessment Methodology in Industry) or ISO/IEC 30186:2025 (Digital twin — Maturity model and guidance for a maturity assessment); based on its current architecture, an honest self-assessment against either framework would likely place it at an early-to-mid maturity tier, not a fully mature one.
            </p>
          </div>

          <div className="mt-5 overflow-x-auto border border-[var(--line)] bg-[var(--bg-surface)] p-4">
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--dim)]">
              Diagram 3 · Where this system sits on the ISO/IEC 30173:2023 spectrum
            </div>
            <svg viewBox="0 0 960 200" className="w-full min-w-[720px]" role="img" aria-label="Digital twin maturity ladder diagram">
              <DiagramDefs />
              <DiagramBox x={20} y={40} w={280} h={70} title="Digital Model" subtitle="no automatic data flow, either direction" mono="e.g. a static architectural BIM model" variant="muted" />
              <DiagramBox x={340} y={40} w={280} h={70} title="Digital Shadow" subtitle="automatic one-way flow: physical → digital" mono="◀ this system is here" variant="accent" />
              <DiagramBox x={660} y={40} w={280} h={70} title="Digital Twin" subtitle="automatic two-way flow, incl. control back" mono="requires closed-loop actuation" variant="muted" />

              <DiagramArrow x1={300} y1={75} x2={338} y2={75} />
              <DiagramArrow x1={620} y1={75} x2={658} y2={75} dashed />

              <text x={20} y={150} fontSize={10} fontWeight={700} fill="var(--ink)" style={{ fontFamily: MONO_STACK }}>
                To become a Digital Twin, not a Digital Shadow:
              </text>
              <text x={20} y={168} fontSize={9.5} fill="var(--dim)" style={{ fontFamily: MONO_STACK }}>
                1) a formal asset model for the monitored infrastructure (AAS-style)   2) an actuation path back to at least one real control system
              </text>
              <text x={20} y={183} fontSize={9.5} fill="var(--dim)" style={{ fontFamily: MONO_STACK }}>
                3) physics- or agent-based simulation for at least one subsystem (e.g. real hydraulic routing, replacing today's threshold-based flood scenario)
              </text>
            </svg>
          </div>

          <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.7] text-[var(--dim)]">
            None of this is a criticism of the system as it stands — a well-labeled, honest Digital Shadow that an operator can trust is worth more than an overclaimed &ldquo;digital twin&rdquo; that hides its assumptions. The classification above exists so the term is never used more strongly than the architecture supports.
          </p>
        </section>

        {/* ─── Section 07: University partners ───────────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            07 · University partners
          </div>
          <h2
            className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]"
            lang="th"
          >
            พันธมิตรมหาวิทยาลัย
          </h2>
          <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
            <p lang="th">
              ศูนย์บริหารจัดการมหาวิทยาลัยอัจฉริยะ (Smart Campus Management Center — SCMC) มหาวิทยาลัยเชียงใหม่ เผยแพร่ข้อมูลอุบัติเหตุและข้อมูลยานพาหนะสาธารณะผ่าน Tableau Public — ฝังไว้ด้านล่างโดยตรงจากต้นทาง และให้ฟีดตำแหน่งรถรับส่งภายในมหาวิทยาลัยแบบ GPS สดผ่าน MQTT ที่ใช้แสดงผลบนแผนที่หลักของระบบ
            </p>
            <p className="text-[13px] leading-[1.7] text-[var(--dim)]">
              Chiang Mai University&rsquo;s Smart Campus Management Center (SCMC) publishes accident and campus-vehicle datasets on Tableau Public, embedded live below straight from the source, and a live GPS shuttle feed over MQTT that powers the CMU Shuttle layer on the main map.
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

        {/* ─── Section 08: Downloads ─────────────────────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            08 · Downloads
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

        {/* ─── Section 09: Leadership — two cards ────────────────── */}
        <section className="border-t border-[var(--line)] py-8">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]">
            09 · Project sponsor &amp; system architect
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
                รศ. ดร. ปุ่น เที่ยงบูรณธรรม
                <span className="ml-2.5 font-normal text-[15px] text-[var(--dim)]">
                  (Assoc. Prof. Pun Thiengburanathum, PhD)
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
  );
}
