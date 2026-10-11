// About document, sections 07 and 08: where the board stands against the
// digital-twin and early-warning standards, and who answers for it and what
// it keeps. Every claim here was checked against the code; the full gap
// analysis is docs/DIGITAL-TWIN-STANDARDS.md (items 6 and 7).
//
// Names appear only where the project has given them (sponsor and architect,
// section 11). Every other role says "to be assigned" until someone is.
//
// One language per mode: each string is a [th, en] pair and one is rendered.

import { NOTE, PROSE, Section } from "./CNXAboutSection";

type Pair = readonly [th: string, en: string];

interface Pillar {
  name: Pair;
  does: Pair;
  doesNot: Pair;
  owner: Pair;
}

const PILLARS: readonly Pillar[] = [
  {
    name: ["1 · ความรู้เรื่องความเสี่ยงภัยพิบัติ", "1 · Disaster risk knowledge"],
    does: [
      "ศูนย์พักพิงทางการพร้อมความจุและระดับความแม่นยำของตำแหน่ง และ “สัญญา” ของทุกชั้นข้อมูลน้ำ ที่บอกว่าวัดอะไร คลาดเคลื่อนไปทางไหน และห้ามใช้สรุปอะไร",
      "Official shelters with their capacity and how precisely each is located; a contract for every water layer stating what it measures, which way it errs and what it must not be used to conclude.",
    ],
    doesNot: [
      "ไม่จัดทำแผนที่ภัยหรือแผนที่ความเสี่ยงทางการ และไม่ประเมินความเปราะบางรายครัวเรือน",
      "Publish official hazard or risk maps, or assess vulnerability household by household.",
    ],
    owner: ["สำนักงานจังหวัดเชียงใหม่", "Chiang Mai Provincial Office"],
  },
  {
    name: ["2 · การตรวจจับ เฝ้าระวัง และพยากรณ์", "2 · Detection, monitoring and forecasting"],
    does: [
      "ประกาศเตือนทางการของกรมอุตุนิยมวิทยาสำหรับเชียงใหม่ ซึ่งอ่านจากฟีด CAP 1.2 ของกรมฯ แสดงเป็นอันดับแรก ตามด้วยระดับน้ำ ฝน และปริมาณน้ำในเขื่อนที่วัดจริง ค่า PM2.5 (กรมควบคุมมลพิษ, DustBoy) และจุดความร้อนจากดาวเทียม (FIRMS, กรมป่าไม้) วางคู่กับพยากรณ์จากแบบจำลอง 48 ชั่วโมงและ Google Flood Hub — ทุกค่าติดป้ายว่าวัดจริงหรือแบบจำลอง พร้อมอายุข้อมูล",
      "Official TMD warnings for Chiang Mai, read from TMD's CAP 1.2 feed, come first. Then measured river levels, rain gauges, reservoir storage, PM2.5 (PCD, DustBoy) and satellite hotspots (FIRMS, RFD), beside 48-hour model forecasts and Google Flood Hub — each labelled measured or model, with its age.",
    ],
    doesNot: [
      "ไม่ออกพยากรณ์ในนามของตนเอง และไม่นำเกณฑ์ของกระดานไปแสดงเหมือนเป็นประกาศของทางราชการ",
      "Issue forecasts on its own authority, or present its own thresholds as a government announcement.",
    ],
    owner: [
      "กรมอุตุนิยมวิทยา · กรมชลประทานและ สสน. · กรมควบคุมมลพิษ · GISTDA · กรมป่าไม้",
      "TMD · RID and HII · PCD · GISTDA · RFD",
    ],
  },
  {
    name: ["3 · การกระจายและสื่อสารคำเตือน", "3 · Warning dissemination and communication"],
    does: [
      "ส่งออกคำเตือนเพื่อสนับสนุนการตัดสินใจของกระดานเองในรูปแบบ CAP 1.2 ที่ /api/cnx/cap.xml โดยกำหนดขอบเขตเป็น Restricted สำหรับผู้เชื่อมต่อระบบและเจ้าหน้าที่ ทุกคำเตือนบอกสิ่งที่ต้องทำ ความไม่แน่นอน และแหล่งที่มา",
      "Exports its own decision-support warnings as CAP 1.2 at /api/cnx/cap.xml, scope Restricted, for integrators and officers. Every warning carries an action, its uncertainty and its source.",
    ],
    doesNot: [
      "ไม่แจ้งเตือนประชาชนโดยตรง ไม่มี SMS ข้อความ LINE ไซเรน หรือ Cell Broadcast และฟีด CAP ของกระดานระบุชัดว่าไม่ใช่ประกาศเตือนภัยทางการต่อสาธารณะ",
      "Alert the public: no SMS, LINE messages, sirens or Cell Broadcast. Its CAP feed states that it is not an official public warning.",
    ],
    owner: [
      "กรมป้องกันและบรรเทาสาธารณภัย (Cell Broadcast) · สำนักงานจังหวัดเชียงใหม่",
      "DDPM (Cell Broadcast) · Chiang Mai Provincial Office",
    ],
  },
  {
    name: ["4 · การเตรียมพร้อมและความสามารถในการรับมือ", "4 · Preparedness and response capability"],
    does: [
      "รายการสิ่งที่ต้องทำในแต่ละระดับการเตือน สายด่วน (ปภ. 1784, การแพทย์ฉุกเฉิน 1669) และศูนย์พักพิงในแต่ละอำเภอบนภาพคาดการณ์ 48 ชั่วโมง",
      "A checklist for each alert level, hotlines (DDPM 1784, EMS 1669), and the shelters in each district on the 48-hour outlook.",
    ],
    doesNot: [
      "ไม่สั่งอพยพหรือสั่งการเจ้าหน้าที่ภาคสนาม — นั่นเป็นการตัดสินใจของผู้บัญชาการเหตุการณ์",
      "Order evacuations or dispatch crews. Those are command decisions.",
    ],
    owner: ["ศูนย์ ปภ. เขต · ที่ว่าการอำเภอ", "DDPM regional centre · district (amphoe) offices"],
  },
];

const HEAD: Record<"pillar" | "does" | "doesNot" | "owner", Pair> = {
  pillar: ["เสาหลัก", "Pillar"],
  does: ["สิ่งที่กระดานทำ", "What the board does"],
  doesNot: ["สิ่งที่ไม่ทำ", "What it does not do"],
  owner: ["ผู้รับผิดชอบ", "Owner"],
};

const TBA: Pair = ["รอการแต่งตั้ง", "To be assigned"];

const ROLES: readonly { role: Pair; holder: Pair }[] = [
  {
    role: ["ผู้สนับสนุนโครงการ", "Project sponsor"],
    holder: ["รวพ. (RCAD) · รศ. ดร. ปุ่น เที่ยงบูรณธรรม (หัวข้อ 11)", "RCAD · Assoc. Prof. Pun Thiengburanathum (section 11)"],
  },
  {
    role: ["ผู้ออกแบบสถาปัตยกรรมและวิศวกรหลัก", "System architect and lead engineer"],
    holder: ["ดร.นน อัครประเสริฐกุล · สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (หัวข้อ 11)", "Dr Non Arkaraprasertkul · depa (section 11)"],
  },
  { role: ["เจ้าของระบบ — รับผิดชอบต่อสิ่งที่กระดานบอกเจ้าหน้าที่", "System owner — accountable for what the board tells officers"], holder: TBA },
  { role: ["ผู้ดูแลระบบเทคนิค — ดูแลให้เว็บและเครื่องรีเลย์ทำงานอยู่เสมอ", "Technical operator — keeps the site and the relay machine running"], holder: TBA },
  { role: ["เจ้าหน้าที่เวร — อ่านกระดานระหว่างเกิดเหตุและส่งเรื่องต่อตามลำดับขั้น", "Duty officer — reads the board during an event and escalates"], holder: TBA },
  {
    role: ["ผู้ดูแลข้อมูล", "Data stewards"],
    holder: [
      "ข้อมูลของแต่ละฟีดเป็นของหน่วยงานที่เผยแพร่: น้ำ — กรมชลประทาน สสน. และหน่วยงานที่ ThaiWater ระบุ; อากาศ — กรมควบคุมมลพิษ GISTDA และ มช. (DustBoy); ไฟ — กรมป่าไม้ และ NASA FIRMS; ประกาศเตือนภัยทางการ — กรมอุตุนิยมวิทยา ส่วนผู้ดูแลข้อมูลแต่ละด้านภายในโครงการ: รอการแต่งตั้ง",
      "Each feed's data belongs to the agency that publishes it: water to RID, HII and the other agencies ThaiWater credits; air to PCD, GISTDA and CMU (DustBoy); fire to RFD and NASA FIRMS; official weather warnings to TMD. A steward inside the project for each domain: to be assigned.",
    ],
  },
  { role: ["ผู้ติดต่อด้านการคุ้มครองข้อมูลส่วนบุคคล", "Data protection contact"], holder: TBA },
  {
    role: ["รอบการทบทวน", "Review cadence"],
    holder: [
      "ยังไม่ได้กำหนด ปัจจุบันการเปลี่ยนแปลงถูกตรวจด้วยชุดทดสอบอัตโนมัติและบันทึกการตรวจก่อนเผยแพร่ ยังไม่มีการทบทวนตามรอบเวลา",
      "To be set. Changes are checked today by an automated test suite and recorded release audits, not by a scheduled review.",
    ],
  },
];

const CONTINUITY: Pair = [
  "เที่ยวบินขึ้นสถานะ “ข้อมูลเสื่อมสภาพ” ภายใน 3 นาที และภายในไม่เกิน 6 ชั่วโมง ทุกฟีดที่มาทางเครื่องรีเลย์ — เที่ยวบิน ผู้โดยสารขาเข้า ระดับน้ำ สถานีวัดฝน ปริมาณน้ำในเขื่อน การวัดหมอกควันจากภาพกล้อง และรายงานจากประชาชน — จะขึ้นว่าข้อมูลเก่าแล้วกลายเป็น “ไม่มีข้อมูล” ไม่มีการแสดงค่าเก่าเหมือนเป็นค่าปัจจุบัน ส่วนข่าวและโซเชียลที่มาทางรีเลย์จะหายไป เมื่อไม่มีค่าระดับน้ำ แกนน้ำท่วมของผลประเมินภาพรวมจะ “มองไม่เห็น” และรับรองว่า “ปลอดภัย” ไม่ได้ ขณะที่จุดความร้อน ค่าฝุ่นจากกรมควบคุมมลพิษและจากแบบจำลอง ค่าจาก DustBoy, Flood Hub, สนามพยากรณ์ และรายชื่อกล้อง ยังทำงานต่อบน Cloudflare เมื่อเปิดเครื่องรีเลย์อีกครั้ง แต่ละฟีดจะกลับมาในรอบถัดไปของมัน โดยไม่มีการเติมข้อมูลช่วงที่ขาดหาย และขณะนี้ยังไม่มีเครื่องรีเลย์สำรองเครื่องที่สอง",
  "Flights show as degraded within 3 minutes. Within 6 hours at most, every relay-fed feed — flights, inbound arrivals, river levels, rain gauges, reservoir storage, camera haze vision and citizen reports — reads as stale and then unavailable, never as an old value presented as current, and the relay's share of the news and social feed drops out. With no river reading, the flood axis of the verdict is blind and cannot certify “safe”. Fire hotspots, PCD and model air quality, DustBoy, Flood Hub, the forecast field and the camera catalogue keep running on Cloudflare. When the relay restarts, each feed returns on its next run; the gap is not back-filled. There is no second relay host yet.",
];

const PRIVACY: readonly Pair[] = [
  [
    "ไม่มีบัญชีผู้ใช้ การเข้าสู่ระบบ หรือแบบฟอร์ม กระดานไม่ขอ ไม่เก็บ และไม่บันทึกข้อมูลส่วนบุคคลของผู้ใช้",
    "No accounts, sign-ins or forms. The board does not ask for, collect or store personal data about the people who use it.",
  ],
  [
    "ไม่มีคุกกี้ ระบบวิเคราะห์การใช้งาน หรือตัวติดตามโฆษณา ค่าที่เลือกสองอย่าง — ภาษาและโหมดสว่าง/มืด — เก็บไว้ในเบราว์เซอร์ของคุณเองเท่านั้น ไม่ถูกส่งไปยังเซิร์ฟเวอร์",
    "No cookies, analytics or advertising trackers. Two preferences — language and light or dark mode — stay in your own browser's storage and are never sent to the server.",
  ],
  [
    "หมายเลข IP ของคุณใช้เป็นกุญแจจำกัดจำนวนครั้งการเรียกใช้ในช่วงสั้น ๆ เท่านั้น และผู้ให้บริการโฮสต์ (Cloudflare Workers) เก็บบันทึกการทำงานของระบบโดยตัดข้อความค้นหาใน URL ออก คำถามที่พิมพ์ในช่อง “ถาม” ได้รับคำตอบแล้วไม่ถูกเก็บไว้",
    "Your IP address is used only as a short-lived rate-limiting key, and the host (Cloudflare Workers) keeps operational request logs with query strings removed. Questions typed into Ask are answered and not stored.",
  ],
  [
    "กล้องแสดงเป็นตำแหน่งและสถานะว่าออนไลน์หรือไม่ ถ้ากล้องมีภาพสดสาธารณะ ภาพจะเล่นจากเซิร์ฟเวอร์ของเจ้าของกล้องตรงมายังเบราว์เซอร์ของคุณ กระดานไม่ส่งต่อ ไม่บันทึก และไม่เก็บวิดีโอ",
    "Cameras are shown as positions and whether each is live. Where a public stream exists it plays from its owner's server straight to your browser; the board does not proxy, record or store video.",
  ],
  [
    "ระบบวัดหมอกควันจากภาพกล้องเก็บเฉพาะค่าสถิติของภาพ — ความสว่าง ความคมชัด ค่าหมอก และลายนิ้วมือดิจิทัลสำหรับข้ามภาพซ้ำ — ไว้ 30 วันบนเครื่องรีเลย์ ไม่เก็บตัวภาพ",
    "Camera haze vision keeps image statistics — brightness, contrast, a haze measure and a fingerprint to skip repeated frames — for 30 days on the relay machine. It does not keep the images.",
  ],
  [
    "รายงานจากประชาชนคือโพสต์สาธารณะและข่าวที่พูดถึงฝุ่นหรือควัน กระดานเก็บหัวข้อ ลิงก์ เวลา และสถานที่ที่ข้อความระบุ โดยปักหมุดตามระดับความแม่นยำของสถานที่นั้น ไม่บันทึกว่าใครเป็นผู้เขียน",
    "Citizen reports are public posts and news items that mention haze or smoke. The board keeps the title, link, time and the place the text names, pinned at that place's precision. It does not record who wrote them.",
  ],
  [
    "หากจะขยายการใช้รายงานจากประชาชนหรือการวิเคราะห์ภาพกล้องเกินกว่านี้ ต้องประเมินผลกระทบด้านการคุ้มครองข้อมูลส่วนบุคคลก่อน",
    "If citizen reports or camera analytics grow beyond this, a data protection impact assessment comes first.",
  ],
];

const CELL = "border-t border-[var(--line)] px-3 py-2 align-top";
const TH_CELL = "px-3 py-2 text-left font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--dim)]";
const H3 = "mt-6 text-[16px] font-bold";

export function StandardsSection({ th }: { th: boolean }) {
  const i = th ? 0 : 1;
  return (
    <Section kicker={th ? "07 · จุดยืนต่อมาตรฐาน" : "07 · Standards position"} title={th ? "กระดานนี้อยู่ตรงไหนเมื่อเทียบกับมาตรฐาน" : "Where the board stands against the standards"}>
      <div className={PROSE}>
        <p>
          {th
            ? "เกณฑ์ด้านการเตือนภัยล่วงหน้าคือข้อริเริ่ม Early Warnings for All ของสหประชาชาติ (UNDRR และ WMO) ซึ่งมีสี่เสาหลัก ตารางด้านล่างบอกว่าในแต่ละเสาหลัก กระดานนี้ทำอะไร ตั้งใจไม่ทำอะไร และใครเป็นผู้รับผิดชอบเสาหลักนั้นในเชียงใหม่ การแบ่งความรับผิดชอบเป็นไปตามแผนการป้องกันและบรรเทาสาธารณภัยแห่งชาติ พ.ศ. 2564–2570 ซึ่งกรมป้องกันและบรรเทาสาธารณภัยเป็นหน่วยงานหลัก กระดานนี้เป็นเครื่องมือช่วยตัดสินใจของผู้รับผิดชอบเหล่านั้น ไม่ได้มาแทนที่หน่วยงานใด"
            : "The early-warning yardstick is the UN Early Warnings for All initiative (UNDRR and WMO) and its four pillars. For each pillar, the table says what this board does, what it deliberately does not do, and who owns that pillar in Chiang Mai. Ownership follows Thailand's National Disaster Prevention and Mitigation Plan 2021–2027, under which DDPM leads. The board is a decision aid for those owners; it replaces none of them."}
        </p>
      </div>
      <div className="mt-4 overflow-x-auto border border-[var(--line)] bg-[var(--bg-surface)]">
        <table className="w-full min-w-[680px] border-collapse text-[13px] leading-[1.6]">
          <thead>
            <tr>
              <th scope="col" className={`${TH_CELL} w-[22%]`}>{HEAD.pillar[i]}</th>
              <th scope="col" className={`${TH_CELL} w-[34%]`}>{HEAD.does[i]}</th>
              <th scope="col" className={`${TH_CELL} w-[26%]`}>{HEAD.doesNot[i]}</th>
              <th scope="col" className={`${TH_CELL} w-[18%]`}>{HEAD.owner[i]}</th>
            </tr>
          </thead>
          <tbody>
            {PILLARS.map((p) => (
              <tr key={p.name[1]}>
                <th scope="row" className={`${CELL} text-left font-bold`}>{p.name[i]}</th>
                <td className={CELL}>{p.does[i]}</td>
                <td className={CELL}>{p.doesNot[i]}</td>
                <td className={CELL}>{p.owner[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={PROSE}>
        <p>
          {th
            ? "ISO/IEC 30173:2023 — ตามนิยามในข้อ 3.1.1 กระดานนี้คือดิจิทัลทวินของเมืองเพื่อการเฝ้าระวังและเตือนภัยล่วงหน้า ที่ซิงโครไนซ์ทางเดียวและไม่สั่งการกลับ (หัวข้อ 06) มาตรฐานไม่ได้บังคับให้ต้องควบคุมระบบจริงกลับ และลำดับขั้นแบบจำลอง–เงา–ทวินมาจาก Kritzinger และคณะ (2018) ไม่ได้มาจากมาตรฐาน หน้านี้อ้างอิงเฉพาะส่วนตัวอย่างทางการของ ISO/IEC 30173 ถึงข้อ 3.1.2 เท่านั้น"
            : "ISO/IEC 30173:2023 — under the definition in §3.1.1 the board is a monitoring and early-warning city digital twin with one-way synchronisation and no actuation (section 06). The standard does not require control back to the physical system, and the model–shadow–twin ladder comes from Kritzinger et al. (2018), not from the standard. Only the official preview of ISO/IEC 30173, up to §3.1.2, was read for this page."}
        </p>
        <p>
          {th
            ? "ITU-T Y.4600 (08/2022) อธิบายทวินของเมืองอัจฉริยะที่จำลองกลยุทธ์ด้วยแบบจำลองเชิงเอเจนต์ การจำลองแบบนั้นอยู่นอกขอบเขตของกระดานนี้โดยตั้งใจ แบบจำลองของกระดานคือกฎประเมินภัยที่ให้ผลแน่นอนและพยากรณ์ที่เผยแพร่แล้ว"
            : "ITU-T Y.4600 (08/2022) describes a smart-city twin that simulates strategies with agent-based models. That simulation is out of scope here by design: the board's models are deterministic hazard rules and published forecasts."}
        </p>
        <p>
          {th
            ? "จากหลักการ Gemini ทั้งเก้าข้อ (Centre for Digital Built Britain, 2018) กระดานนี้ผ่านข้อความเข้าใจเชิงลึก คุณภาพ และวิวัฒนาการ ส่วนข้อประโยชน์สาธารณะ การสร้างคุณค่า ความมั่นคงปลอดภัย ความเปิดกว้าง การเชื่อมต่อระหว่างระบบ และการดูแลรักษาข้อมูล ผ่านบางส่วน"
            : "Of the nine Gemini Principles (Centre for Digital Built Britain, 2018), the board meets Insight, Quality and Evolution; Public good, Value creation, Security, Openness, Federation and Curation are partly met."}
        </p>
      </div>
      <p className={`mt-3 ${NOTE}`}>
        {th
          ? "การวิเคราะห์ช่องว่างฉบับเต็ม ซึ่งระบุมาตรฐานทุกฉบับพร้อมรุ่น วันที่ และส่วนที่อ่านจริง อยู่ในเอกสาร docs/DIGITAL-TWIN-STANDARDS.md ของซอร์สโค้ด"
          : "The full gap analysis — every standard with its version, date and what was actually read — is docs/DIGITAL-TWIN-STANDARDS.md in the source repository."}
      </p>
    </Section>
  );
}

export function GovernanceSection({ th }: { th: boolean }) {
  const i = th ? 0 : 1;
  return (
    <Section kicker={th ? "08 · การกำกับดูแลและความเป็นส่วนตัว" : "08 · Governance and privacy"} title={th ? "ใครรับผิดชอบกระดานนี้ และกระดานเก็บอะไรไว้บ้าง" : "Who answers for the board, and what it keeps"}>
      <div className="mt-4 max-w-[74ch] border border-[var(--line)] bg-[var(--bg-surface)] p-5">
        <dl className="grid gap-x-5 gap-y-3 text-[14px] leading-[1.65] sm:grid-cols-[minmax(0,15rem)_1fr]">
          {ROLES.map((r) => (
            <div key={r.role[1]} className="contents">
              <dt className="font-bold">{r.role[i]}</dt>
              <dd className={r.holder === TBA ? "text-[var(--dim)]" : undefined}>{r.holder[i]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <h3 className={H3}>{th ? "ถ้าเครื่องรีเลย์หยุดทำงาน 24 ชั่วโมง" : "If the relay machine is down for 24 hours"}</h3>
      <div className={PROSE}>
        <p>{CONTINUITY[i]}</p>
      </div>

      <h3 className={H3}>
        {th ? "ความเป็นส่วนตัว — พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562" : "Privacy — Thailand's Personal Data Protection Act B.E. 2562 (2019)"}
      </h3>
      <ul className="mt-3 max-w-[70ch] list-disc space-y-2 pl-5 text-[15px] leading-[1.75]">
        {PRIVACY.map((p) => (
          <li key={p[1]}>{p[i]}</li>
        ))}
      </ul>
    </Section>
  );
}
