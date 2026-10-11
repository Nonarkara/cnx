// Architecture diagrams for the About/Research document.
//
// Legibility rule: every diagram is drawn on an 800-unit-wide viewBox and
// rendered at a minimum of 800 CSS px (the frame scrolls sideways on a
// phone), so one SVG unit is never smaller than one CSS pixel. The
// smallest font is 11 units, so rendered text is ≥11 px at 375 px width
// and at desktop width alike. Box heights come from their line counts.
//
// One language per mode: every label comes through t(th, en). File names
// and identifiers (air-quality.ts, CNX_FLIGHTS_KV) are code and stay as is.

type T = (th: string, en: string) => string;

const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const LINE = 15;
const TITLE_BASELINE = 18;
const BOTTOM_PAD = 9;
const FRAME = "mt-5 overflow-x-auto border border-[var(--line)] bg-[var(--bg-surface)] p-4";
const SVG_CLASS = "block w-full min-w-[800px]";
const CAPTION = "mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dim)]";

type Variant = "default" | "accent" | "danger" | "muted";

function boxHeight(lineCount: number): number {
  return TITLE_BASELINE + LINE * lineCount + BOTTOM_PAD;
}

/** One box: a bold title, plain lines, then accent-coloured code lines. */
function DiagramBox({
  x,
  y,
  w,
  title,
  lines = [],
  mono = [],
  variant = "default",
}: {
  x: number;
  y: number;
  w: number;
  title: string;
  lines?: string[];
  mono?: string[];
  variant?: Variant;
}) {
  const stroke = variant === "accent" ? "var(--cool)" : variant === "danger" ? "var(--danger)" : "var(--line)";
  const fill = variant === "accent" ? "var(--cool-dim)" : variant === "danger" ? "rgba(239,68,68,0.08)" : "var(--bg-raised)";
  const titleColor = variant === "danger" ? "var(--danger)" : "var(--ink)";
  const h = boxHeight(lines.length + mono.length);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={variant === "accent" ? 1.5 : 1} />
      <text x={x + 10} y={y + TITLE_BASELINE} fontSize={12} fontWeight={700} fill={titleColor} style={{ fontFamily: MONO_STACK }}>
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={`l${i}`} x={x + 10} y={y + TITLE_BASELINE + LINE * (i + 1)} fontSize={11} fill="var(--dim)" style={{ fontFamily: MONO_STACK }}>
          {l}
        </text>
      ))}
      {mono.map((m, i) => (
        <text
          key={`m${i}`}
          x={x + 10}
          y={y + TITLE_BASELINE + LINE * (lines.length + i + 1)}
          fontSize={11}
          fill="var(--cool)"
          style={{ fontFamily: MONO_STACK }}
        >
          {m}
        </text>
      ))}
    </g>
  );
}

/** Straight arrow between two points. */
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

function Note({ x = 10, y, children, bold }: { x?: number; y: number; children: string; bold?: boolean }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={bold ? 12 : 11}
      fontWeight={bold ? 700 : 400}
      fill={bold ? "var(--ink)" : "var(--dim)"}
      style={{ fontFamily: MONO_STACK }}
    >
      {children}
    </text>
  );
}

/** Diagram 1 — five fallback shapes across the Worker modules. */
export function PipelineDiagram({ t }: { t: T }) {
  const header = (x: number, label: string) => (
    <text x={x} y={16} fontSize={11} fontWeight={700} fill="var(--dim)" style={{ fontFamily: MONO_STACK, letterSpacing: 1 }}>
      {label}
    </text>
  );
  return (
    <div className={FRAME}>
      <div className={CAPTION}>
        {t(
          "แผนภาพ 1 · รูปแบบการสำรองข้อมูล 5 แบบ ไม่ใช่ระบบชั้นเดียวแบบเดียวกันทั้งหมด",
          "Diagram 1 · Five different fallback shapes, not one uniform tier system",
        )}
      </div>
      <svg viewBox="0 0 800 476" className={SVG_CLASS} role="img" aria-label={t("แผนภาพเส้นทางข้อมูลของระบบ", "CNX data pipeline diagram")}>
        <DiagramDefs />
        {header(10, t("แหล่งข้อมูล", "SOURCES"))}
        {header(230, t("CLOUDFLARE WORKER — สำรองแยกตามโมดูล", "CLOUDFLARE WORKER — PER-MODULE FALLBACK"))}
        {header(600, t("ส่วนแสดงผล", "SURFACES"))}

        {/* Sources: x 10–190, one line each (h 42) */}
        <DiagramBox x={10} y={30} w={180} title={t("API สาธารณะแบบสด", "Live public APIs")} lines={[t("Open-Meteo, FIRMS ฯลฯ", "Open-Meteo, FIRMS, RFD…")]} />
        <DiagramBox x={10} y={82} w={180} title="OSM Overpass" lines={[t("เส้นทางรถเมล์ สายน้ำ", "bus routes, waterways")]} />
        <DiagramBox x={10} y={134} w={180} title="data.go.th (CKAN)" lines={[t("เตรียมไฟล์ไว้ล่วงหน้า", "baked at build time")]} />
        <DiagramBox x={10} y={186} w={180} title={t("Longdo, GDELT, ข่าว", "Longdo, GDELT, News")} lines={[t("กล้อง โซเชียล RSS", "cameras, social, RSS")]} />

        {/* Fallback patterns: x 230–560 */}
        <DiagramBox
          x={230}
          y={30}
          w={330}
          title={t("A · สด → สำรองด้วยสถานการณ์จำลอง", "A · Live → scenario fallback")}
          lines={[t("ลองต้นทางก่อน ล้มเหลวจึงใช้ชุดจำลองที่ติดป้าย", "try upstream; on failure, labelled scenario")]}
          mono={["air-quality.ts · fires.ts", "flood.ts · aerosol.ts"]}
        />
        <DiagramBox
          x={230}
          y={112}
          w={330}
          title={t("B · แคช → ไฟล์ที่อบไว้ → สด", "B · Cache → baked file → live")}
          lines={[t("อ่านไฟล์ของตัวเองผ่าน ASSETS ก่อน", "ASSETS binding reads its own static file first")]}
          mono={["bus-routes.ts · waterways.ts"]}
        />
        <DiagramBox
          x={230}
          y={179}
          w={330}
          title={t("C · ดิสก์ / ASSETS → จำนวนคงที่", "C · Disk / ASSETS → fixed count")}
          lines={[t("ถ้าล้มเหลวทั้งหมด คืนยอดรวมที่กำหนดไว้ตายตัว", "on total failure, returns a hard-coded total")]}
          mono={[t("open-data-th.ts (311 ชุด)", "open-data-th.ts (311 datasets)")]}
        />
        <DiagramBox
          x={230}
          y={246}
          w={330}
          title={t("D · Relay → KV → ธง degraded ชัดเจน", "D · Relay → KV → explicit degraded flag")}
          lines={[t("โมดูลเดียวที่คืนค่า degraded: true จริง", "the only module that returns degraded: true")]}
          mono={[t("opensky.ts · flights-kv.ts (แผนภาพ 2)", "opensky.ts · flights-kv.ts (diagram 2)")]}
          variant="accent"
        />
        <DiagramBox
          x={230}
          y={313}
          w={330}
          title={t("E · รวมข้อมูล ไม่ใช่สำรอง", "E · Merge, not fallback")}
          lines={[t("รวมรายการสดกับที่คัดไว้ แล้วตัดรายการซ้ำ", "live + curated items concatenated, deduped")]}
          mono={["cctv.ts · social.ts"]}
        />
        <DiagramBox
          x={230}
          y={380}
          w={330}
          title={t("ระบบค้นคืน (“ถาม”)", "Retrieval (“Ask”)")}
          lines={[t("ค้นด้วยคำสำคัญ TF-IDF — ไม่ใช้ LLM", "TF-IDF keyword search — no LLM, no embeddings")]}
          mono={[t("rag.ts · เอกสารสดราว 330–390 ชิ้น", "rag.ts, ~330–390 live docs")]}
        />

        {/* Surfaces: x 600–790, one line each (h 42) */}
        <DiagramBox x={600} y={30} w={190} title={t("ชั้นแผนที่", "Map layers")} lines={["deck.gl + MapLibre"]} />
        <DiagramBox x={600} y={82} w={190} title={t("ป้ายแถบบน", "Top-bar pills")} lines={[t("PM2.5 · ไฟป่า · เที่ยวบิน", "PM2.5 · fires · flights")]} />
        <DiagramBox x={600} y={134} w={190} title={t("ตัวเปิดดูข้อมูลเปิด", "Open Data browser")} lines={[t("แผงข้อมูลเปิดใน /cnx", "/cnx open-data panel")]} />
        <DiagramBox x={600} y={186} w={190} title={t("ถาม (ค้นแบบ RAG)", "Ask (RAG search)")} lines={[t("ตอบจากคำสำคัญ มีที่มา", "keyword answers, sourced")]} />
        <DiagramBox x={600} y={238} w={190} title={t("แถบกล้อง / โซเชียล", "CCTV / social rail")} lines={[t("สด + ป้ายสาธิต", "live + DEMO-labelled")]} />

        {/* Sources → patterns (approximate, illustrative) */}
        <DiagramArrow x1={190} y1={51} x2={228} y2={66} />
        <DiagramArrow x1={190} y1={103} x2={228} y2={140} />
        <DiagramArrow x1={190} y1={155} x2={228} y2={207} />
        <DiagramArrow x1={190} y1={207} x2={228} y2={341} />
        <DiagramArrow x1={190} y1={207} x2={228} y2={408} />

        {/* Patterns → surfaces */}
        <DiagramArrow x1={560} y1={66} x2={598} y2={51} />
        <DiagramArrow x1={560} y1={140} x2={598} y2={103} />
        <DiagramArrow x1={560} y1={207} x2={598} y2={155} />
        <DiagramArrow x1={560} y1={274} x2={598} y2={207} />
        <DiagramArrow x1={560} y1={341} x2={598} y2={259} />
        <DiagramArrow x1={560} y1={408} x2={598} y2={207} dashed />

        <Note y={466}>
          {t(
            "ทุกแผงใช้หนึ่งในห้ารูปแบบข้างต้น บวกการรวมข้อมูลโดยตรงอีกหนึ่งแบบ — ไม่ใช่สายแคชเดียวทั่วทั้งระบบ",
            "Every panel is one of the five patterns above, plus one direct merge — not a single universal cache chain.",
          )}
        </Note>
      </svg>
    </div>
  );
}

/** Diagram 2 — why flights go through an off-Cloudflare relay. */
export function FlightRelayDiagram({ t }: { t: T }) {
  return (
    <div className={FRAME}>
      <div className={CAPTION}>
        {t("แผนภาพ 2 · ทำไมข้อมูลเที่ยวบินต้องส่งผ่านเครื่องนอก Cloudflare", "Diagram 2 · Why flights need an off-Cloudflare relay")}
      </div>
      <svg viewBox="0 0 800 280" className={SVG_CLASS} role="img" aria-label={t("แผนภาพการส่งต่อข้อมูลเที่ยวบิน", "Flight data relay diagram")}>
        <DiagramDefs />
        <DiagramBox
          x={10}
          y={20}
          w={180}
          title="OpenSky Network"
          lines={[t("states/all + โทเคน OAuth2", "states/all + OAuth2 token")]}
          mono={["→ Cloudflare 522", t("ขอบเครือข่ายเชื่อมไม่ได้", "edge cannot connect")]}
          variant="danger"
        />
        <DiagramBox
          x={10}
          y={102}
          w={180}
          title="adsb.lol"
          lines={[t("ฟีด ADS-B จากชุมชน", "community ADS-B feed")]}
          mono={["→ nginx 429", t("จำกัดตาม IP ที่ใช้ร่วม", "shared-IP rate limit")]}
          variant="danger"
        />
        <DiagramBox
          x={215}
          y={61}
          w={190}
          title={t("เครื่อง relay", "Relay machine")}
          lines={[t("launchd · ทุก 30 วินาที", "launchd · every 30 s"), t("อยู่นอก Cloudflare", "not on Cloudflare")]}
          mono={["scripts/relay-flights.mjs"]}
          variant="accent"
        />
        <DiagramBox
          x={430}
          y={69}
          w={190}
          title="/api/cnx/flights/ingest"
          lines={[t("POST + รหัสลับร่วม", "POST + shared secret")]}
          mono={[t("ตรวจรูปแบบข้อมูล", "validates payload shape")]}
        />
        <DiagramBox x={635} y={20} w={155} title="Cloudflare KV" lines={[t("อายุ 300 วินาที", "300 s TTL")]} mono={["CNX_FLIGHTS_KV"]} variant="accent" />
        <DiagramBox
          x={635}
          y={117}
          w={155}
          title="fetchCnxSnapshot()"
          lines={[t("อ่าน KV ก่อน", "reads KV first")]}
          mono={[t("เก่าเกิน 3 นาที →", "stale > 3 min →"), "degraded: true"]}
        />

        <DiagramArrow x1={190} y1={56} x2={213} y2={85} />
        <DiagramArrow x1={190} y1={138} x2={213} y2={112} />
        <DiagramArrow x1={405} y1={97} x2={428} y2={97} />
        <DiagramArrow x1={620} y1={85} x2={633} y2={48} />
        <DiagramArrow x1={712} y1={77} x2={712} y2={115} />
        <DiagramArrow x1={633} y1={153} x2={622} y2={112} dashed />

        <Note y={215}>{t("มีเพียงอินเทอร์เน็ตของเครื่อง relay เท่านั้นที่ใช้เชื่อมต่อ OpenSky/adsb.lol —", "Only the relay machine's own connection is used to reach OpenSky/adsb.lol —")}</Note>
        <Note y={231}>{t("ตัว Worker ไม่เคยพยายามเชื่อมต่อเองในระบบจริง", "the Worker itself never tries in production.")}</Note>
        <Note y={251}>{t("การผูก: env.CNX_FLIGHTS_KV (wrangler.cnx.jsonc) · Worker: cnx-dashboard", "Binding: env.CNX_FLIGHTS_KV (wrangler.cnx.jsonc) · Worker: cnx-dashboard")}</Note>
        <Note y={267}>{t("เส้นทาง: cnx.nonarkara.org, www.cnx.nonarkara.org", "Routes: cnx.nonarkara.org, www.cnx.nonarkara.org")}</Note>
      </svg>
    </div>
  );
}

/** Diagram 3 — where the system sits on the ISO/IEC 30173 spectrum. */
export function MaturityDiagram({ t }: { t: T }) {
  return (
    <div className={FRAME}>
      <div className={CAPTION}>
        {t(
          "แผนภาพ 3 · ระบบนี้อยู่ตรงไหนบนสเปกตรัมของ ISO/IEC 30173:2023",
          "Diagram 3 · Where this system sits on the ISO/IEC 30173:2023 spectrum",
        )}
      </div>
      <svg viewBox="0 0 800 200" className={SVG_CLASS} role="img" aria-label={t("แผนภาพระดับวุฒิภาวะดิจิทัลทวิน", "Digital twin maturity ladder diagram")}>
        <DiagramDefs />
        <DiagramBox
          x={10}
          y={20}
          w={240}
          title={t("แบบจำลองดิจิทัล", "Digital Model")}
          lines={[t("ไม่มีการไหลของข้อมูล", "no automatic data flow,"), t("อัตโนมัติทั้งสองทิศทาง", "in either direction")]}
          mono={[t("เช่น แบบจำลอง BIM แบบคงที่", "e.g. a static BIM model")]}
          variant="muted"
        />
        <DiagramBox
          x={280}
          y={20}
          w={240}
          title={t("เงาดิจิทัล", "Digital Shadow")}
          lines={[t("ข้อมูลไหลอัตโนมัติทางเดียว:", "automatic one-way flow:"), t("ของจริง → ดิจิทัล", "physical → digital")]}
          mono={[t("◀ ระบบนี้อยู่ตรงนี้", "◀ this system is here")]}
          variant="accent"
        />
        <DiagramBox
          x={550}
          y={20}
          w={240}
          title={t("ดิจิทัลทวิน", "Digital Twin")}
          lines={[t("ข้อมูลไหลอัตโนมัติสองทาง", "automatic two-way flow,"), t("รวมการสั่งการกลับ", "incl. control back")]}
          mono={[t("ต้องมีการสั่งการแบบวงปิด", "requires closed-loop actuation")]}
          variant="muted"
        />

        <DiagramArrow x1={250} y1={56} x2={278} y2={56} />
        <DiagramArrow x1={520} y1={56} x2={548} y2={56} dashed />

        <Note y={122} bold>{t("สิ่งที่ต้องมีเพื่อเป็นดิจิทัลทวิน ไม่ใช่เงาดิจิทัล:", "To become a Digital Twin, not a Digital Shadow:")}</Note>
        <Note y={142}>{t("1) แบบจำลองสินทรัพย์ที่เป็นทางการของโครงสร้างพื้นฐานที่เฝ้าดู (แบบ AAS)", "1) a formal asset model for the monitored infrastructure (AAS-style)")}</Note>
        <Note y={158}>{t("2) ช่องทางสั่งการกลับไปยังระบบควบคุมจริงอย่างน้อยหนึ่งระบบ", "2) an actuation path back to at least one real control system")}</Note>
        <Note y={174}>{t("3) การจำลองเชิงฟิสิกส์หรือแบบเอเจนต์ของระบบย่อยอย่างน้อยหนึ่งระบบ", "3) physics- or agent-based simulation for at least one subsystem")}</Note>
        <Note x={30} y={190}>
          {t(
            "(เช่น คำนวณการไหลของน้ำจริง แทนสถานการณ์น้ำท่วมแบบใช้เกณฑ์ในปัจจุบัน)",
            "(e.g. real hydraulic routing, replacing today's threshold-based flood scenario)",
          )}
        </Note>
      </svg>
    </div>
  );
}
