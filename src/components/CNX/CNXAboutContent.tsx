"use client";

// Shared About/Research content — rendered both by the standalone
// /cnx/about route (for direct links/sharing) and by CNXAboutModal
// (the in-app pop-up opened from the top bar's Research button, so
// visitors do not have to leave the war room in a new tab/window).
//
// One language per mode (Palette B3). Every section carries a full Thai
// and a full English version and renders exactly one; nothing is stacked
// as a subtitle. Diagrams live in CNXAboutDiagrams, the one-night findings
// table in CNXAboutFindings.

import type { ReactNode } from "react";
import { useLang } from "../../hooks/useLang";
import { FlightRelayDiagram, MaturityDiagram, PipelineDiagram } from "./CNXAboutDiagrams";
import FindingsTable from "./CNXAboutFindings";

const KICKER = "font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]";
const H2 = "mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]";
const PROSE = "mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]";
const LINK = "text-[var(--cool)] underline decoration-[var(--line)] underline-offset-2 hover:decoration-[var(--cool)]";
const NOTE = "max-w-[70ch] text-[13px] leading-[1.7] text-[var(--dim)]";

function Section({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--line)] py-8">
      <div className={KICKER}>{kicker}</div>
      <h2 className={H2}>{title}</h2>
      {children}
    </section>
  );
}

const MAHOLAN = (
  <a href="https://cctv.maholan.net" target="_blank" rel="noreferrer" className={LINK}>
    Maholan flood CCTV wall
  </a>
);
const THAIWATER = (
  <a href="https://www.thaiwater.net" target="_blank" rel="noreferrer" className={LINK}>
    ThaiWater
  </a>
);

function WebAppSection({ th }: { th: boolean }) {
  return (
    <section id="web-app" className="my-6 scroll-mt-20 border border-[var(--line)] bg-[var(--bg-surface)] p-5">
      <div className="flex items-center gap-3">
        <div className="cnx-brand-plate flex h-14 w-14 shrink-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/cnx-app-mark.png" alt="" width={48} height={48} className="block h-12 w-12 object-contain" />
        </div>
        <h2 className="text-lg font-bold">{th ? "ใช้บน Android และ iPhone ได้ในรูปแบบเว็บแอป" : "Available on Android & iPhone as a web app"}</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--dim)]">
        {th
          ? "เปิดห้องปฏิบัติการเชียงใหม่ในเบราว์เซอร์บนมือถือ แล้วเพิ่มไว้ที่หน้าจอโฮมเพื่อเข้ากระดานสดได้ทันที ต้องต่ออินเทอร์เน็ตจึงจะเห็นข้อมูลสด"
          : "Open CNX War Room in your phone’s browser. Add it to your Home Screen for quick access to the live board. An internet connection is required for live data."}
      </p>
      <div className="mt-3 grid gap-3 text-sm leading-6 sm:grid-cols-2">
        {th ? (
          <>
            <p><strong>Android:</strong> เปิดใน Chrome แล้วกดเมนูเบราว์เซอร์ → เพิ่มลงในหน้าจอหลัก / ติดตั้งแอป</p>
            <p><strong>iPhone:</strong> เปิดใน Safari แตะ แชร์ → เพิ่มไปยังหน้าจอโฮม → เพิ่ม</p>
          </>
        ) : (
          <>
            <p><strong>Android:</strong> Open in Chrome, then use the browser menu → Add to Home screen / Install app.</p>
            <p><strong>iPhone:</strong> Open in Safari, tap Share → Add to Home Screen → Add.</p>
          </>
        )}
      </div>
      <a href="/cnx" className="mt-4 inline-flex min-h-11 items-center border border-[var(--line)] px-4 text-sm font-bold text-[var(--cool)] hover:border-[var(--cool)]">
        {th ? "เปิดกระดานสด" : "Open the live board"}
      </a>
    </section>
  );
}

function ColourSection({ th }: { th: boolean }) {
  const plate = (
    <a href="https://colors.nonarkara.org/#plate-002" className={LINK}>
      Wada plate 002 — Yellow Orange · Dark Tyrian Blue
    </a>
  );
  return (
    <Section kicker={th ? "สี · ที่มาของชุดสี" : "Colour · where the palette comes from"} title={th ? "ระบบสีของกระดาน" : "The board’s colour system"}>
      {th ? (
        <>
          <p className="mt-3 max-w-[74ch] text-[15px] leading-[1.75]">
            ระบบสีของกระดานคือ {plate} จากนิทรรศการที่ colors.nonarkara.org ซึ่งรวบรวมคู่สีของซันโซ วาดะ โดยการตีความเชิงดิจิทัล การกำหนดบทบาท และการอ่านสีเป็นของ ดร.นน อัครประเสริฐกุล สีหลักเป็นพื้นผิวสัญญาณโทนอุ่น (ราว 62%) สีคู่เป็นโทนเย็น (ราว 38%) ห่างกันตามสัดส่วนทองคำ สีตัวอักษรบนพื้นแต่ละสีเลือกจากค่าความต่างที่วัดจริง ไม่ได้ใช้ต่อกันมาเฉย ๆ ส่วนสีทองดอยสุเทพยังคงเป็นสีทองของพระธาตุ — ใช้เป็นสีเน้นเท่านั้น ไม่ใช้บอกสถานะ
          </p>
          <p className="mt-2 max-w-[74ch] text-[13px] leading-[1.7] text-[var(--dim)]">
            คู่สีต้นฉบับ: ซันโซ วาดะ · การตีความเชิงดิจิทัล บทบาท และการอ่านสี: ดร.นน อัครประเสริฐกุล · สัญญาอนุญาต: MIT
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 max-w-[74ch] text-[15px] leading-[1.75]">
            The board’s colour system is {plate}, from the exhibition at colors.nonarkara.org: Sanzo Wada’s colour combinations, with the digital interpretation, roles and reading by Dr Non Arkaraprasertkul. The dominant carries the warm signal surface (about 62%), the counter the cool (about 38%), golden-ratio apart; ink on each field is chosen by measured contrast, not inherited. Doi Suthep gold stays the chedi’s gilding — accents only, never a status role.
          </p>
          <p className="mt-2 max-w-[74ch] text-[13px] leading-[1.7] text-[var(--dim)]">
            Source relationship: Sanzo Wada. Digital interpretation, roles, and reading: Dr Non Arkaraprasertkul. License: MIT.
          </p>
        </>
      )}
    </Section>
  );
}

function FindingsSection({ th }: { th: boolean }) {
  return (
    <Section kicker={th ? "ผลการสังเกต · 29 ก.ย. 2569 เวลา 01:07 น." : "Findings · 29 Sep 2026, 01:07 ICT"} title={th ? "คืนนั้นกระดานบอกอะไร" : "What the board said that night"}>
      <div className="mt-3 max-w-[74ch] space-y-3 text-[15px] leading-[1.75]">
        <p>
          {th
            ? "บันทึกจากฟีดจริงบนเครื่องที่รัน v1.2.0 เวลา 01:07 น. ของวันที่ 29 กันยายน 2569 ไม่ใช่ฤดูเผาสูงสุด (มี.ค.–เม.ย.) แต่เป็นคืนที่แหล่งข้อมูลไม่เห็นพ้องกัน และความไม่เห็นพ้องนั้นคือข้อค้นพบ"
            : "Taken from the live feeds on a machine running v1.2.0 at 01:07 ICT on 29 September 2026. This was not peak burning season (March–April). The sources disagreed, and the disagreement is the finding."}
        </p>
        <div className="mt-3 border-l-2 border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
            {th ? "บันทึกย้อนหลัง · ไม่ใช่สถานะปัจจุบัน" : "Archived snapshot · not the current state"}
          </div>
          <p className="mt-1 text-[12px] leading-[1.6] text-[var(--dim)]">
            {th
              ? "ตารางนี้บันทึกคืนเดียว ไม่ใช่สถานะปัจจุบัน หลายแถวอธิบายการตั้งค่าที่เปลี่ยนไปแล้ว — ตอนนี้มีคีย์แผนที่แล้ว และฟีดเส้นทางควันกับผลประเมินภาพรวมทำงานสดแล้ว ค่าของกระดานตอนนี้ให้ดูที่หน้าหลัก"
              : "Every row below is a record of one night. Several describe a configuration that has since changed — a map key now exists, and the smoke-trajectory feed and the verdict are live. For what the board says right now, read the wall itself."}
          </p>
        </div>
      </div>
      <FindingsTable lang={th ? "th" : "en"} />
      <p className="mt-4 max-w-[74ch] text-[15px] leading-[1.75]">
        {th
          ? "สิ่งที่คืนนั้นสอน: ตอนเซ็นเซอร์พื้นดินเงียบพร้อมกันทั้งลุ่มน้ำ แบบจำลอง 13 µg/m³ กับค่า AOD ที่ต่ำไม่ได้แปลว่าวัดฝุ่นบนถนนได้แล้ว มันแปลว่าเรายังไม่มีค่าจากภาคพื้นดิน และระบบต้องพูดแบบนั้น"
          : "What that night taught: when the ground network goes dark together, a model at 13 µg/m³ and a low aerosol optical depth do not become a street-level measurement. They mean we do not have a ground reading, and the board has to say so."}
      </p>
    </Section>
  );
}

function WhatSection({ th }: { th: boolean }) {
  return (
    <Section kicker={th ? "01 · ระบบนี้คืออะไร" : "01 · What this is"} title={th ? "ระบบนี้คืออะไร" : "What this system is"}>
      <div className={PROSE}>
        {th ? (
          <>
            <p>
              คือ “หน้าต่างบานเดียว” ที่รวมข้อมูลสาธารณะของจังหวัดเชียงใหม่ไว้ในที่เดียว: ระดับน้ำแม่ปิงและเขื่อนแม่งัด จุดความร้อนจากกรมป่าไม้และดาวเทียม ค่าฝุ่น PM2.5 ทุกอำเภอ เที่ยวบินเข้า-ออกสนามบินเชียงใหม่แบบเรียลไทม์ ข่าวและโซเชียล 8 ภาษาตามต้นทางผู้โดยสาร กล้องสาธารณะ เมืองสามมิติของตึก กำแพง และวัด 59,344 หลัง และชุดข้อมูลเปิดภาครัฐทั้งหมด 311 ชุดของจังหวัด — อัปเดตเองตลอดเวลา ไม่ต้องรอรายงานกระดาษ
            </p>
            <p>จอใหญ่ในศูนย์บัญชาการ (IOC) เห็นภาพรวมทั้งจังหวัดพร้อมกัน ส่วนมือถือของผู้ปฏิบัติงานเห็น “คำสั่งที่ต้องทำตอนนี้” เป็นอย่างแรกเสมอ</p>
          </>
        ) : (
          <>
            <p>
              A single window that gathers Chiang Mai’s public data in one place — Ping river telemetry and the Mae Ngat dam, Royal Forest Department hotspots and NASA FIRMS satellite detections, PM2.5 for every amphoe (25 districts), real-time flights at Chiang Mai airport, news and social media in 8 languages chosen from inbound flight origins, public cameras, a 3D city of 59,344 buildings, walls and temples, and the province’s full 311-record open-data catalogue — all updating itself, with no waiting for a paper report.
            </p>
            <p>The big screen in the operations centre (IOC) sees the whole province at once; an operator’s phone always leads with the action to take now.</p>
          </>
        )}
      </div>
    </Section>
  );
}

function SourcesSection({ th }: { th: boolean }) {
  return (
    <Section kicker={th ? "02 · ข้อมูลมาจากไหน" : "02 · Where the data comes from"} title={th ? "ข้อมูลมาจากไหน" : "Where the data comes from"}>
      <div className={PROSE}>
        {th ? (
          <>
            <p>
              ระบบไม่สร้างข้อมูลเอง — มันไปรับข้อมูลจากหน่วยงานที่วัดจริง แล้วนำมาเรียงให้อ่านง่าย: กรมป่าไม้ (จุดความร้อน 25 อำเภอ พร้อมแยกประเภทเขตป่าสงวน/อุทยาน/พื้นที่ราษฎร์), GISTDA ให้ค่า PM2.5 รายอำเภอและภาพดาวเทียม AOD, NASA FIRMS ให้จุดไฟ MODIS/VIIRS, Google Flood Hub ให้การพยากรณ์น้ำท่วมแบบจำลองที่จุดวัดเสมือน (virtual gauge) บนแม่น้ำปิง (CC BY 4.0), NASA GIBS ให้ชั้นภาพถ่ายดาวเทียม (รวมฮิมาวาริ-9 อินฟราเรดและ AOD), RainViewer ให้เรดาร์ฝนสด, Open-Meteo CAMS ให้ค่า AQI ทั่วโลก, OpenSky Network และ adsb.lol ให้เที่ยวบินเข้า-ออกสนามบิน CNX แบบ ADS-B, Google News RSS และ GDELT 2.0 ให้ข่าว 8 ภาษา (จีน/ญี่ปุ่น/เกาหลี/รัสเซีย/เยอรมัน/ฝรั่งเศส/อินเดีย/ออสเตรเลีย), OSM Overpass ให้เส้นทางรถเมล์/สายน้ำ/อาคาร 3 มิติ 59,344 หลัง / กำแพงเมือง 14 ชิ้น / วัด 474 วัด, ศูนย์บริหารจัดการมหาวิทยาลัยอัจฉริยะ มหาวิทยาลัยเชียงใหม่ (SCMC) ให้ตำแหน่งรถรับส่งภายในมหาวิทยาลัยแบบ GPS สด, Longdo ให้กล้องสาธารณะ, กล้องน้ำท่วม/ถนนสาธารณะผ่าน {MAHOLAN} (อ่านเฉพาะข้อมูลตำแหน่งและสถานะกล้อง ไม่ดึงภาพวิดีโอมาแสดง แต่ละกล้องระบุหน่วยงานเจ้าของ โดยส่วนใหญ่คือกรมทางหลวง), {THAIWATER} ให้ระดับน้ำที่วัดได้จริงจากสถานีวัดบนแม่น้ำปิงและลำน้ำสาขา (เผยแพร่โดยคลังข้อมูลน้ำแห่งชาติ ข้อมูลจากกรมชลประทาน กรมฝนหลวงและการบินเกษตร สสน. และ กฟผ. — เปิดใช้ได้โดยไม่ต้องใช้คีย์ และตัวเลขเดียวบนกระดานนี้ที่มีหน่วยงานรับรองคือระดับวิกฤตที่ประกาศไว้ของสถานี P.1 สะพานนวรัฐ) และ data.go.th ให้ชุดข้อมูลราชการของจังหวัด 311 ชุด (ภาพ ณ วันที่ 15 ก.ย. 2569 จากการค้นหาแบบกรอง — ไม่ใช่จำนวนทั้งหมด)
            </p>
            <p>ทุกแผงบนหน้าจอมีป้ายบอกแหล่งที่มากำกับเสมอ — กดดูรายละเอียดได้ทุกจุด รายการเต็มอยู่ในเอกสารดาวน์โหลดท้ายหน้านี้</p>
            <p className="text-[13px] text-[var(--dim)]">
              กระดานอ่านระดับน้ำที่วัดจริงในลุ่มน้ำปิงและสถานีวัดฝนในเชียงใหม่จาก ThaiWater โดยแสดงเวลาที่วัดและเกณฑ์ที่ประกาศไว้เสมอ สถานีแม่ปิงที่ยังนิ่งไม่ได้แปลว่าลำห้วยบนเขาหรือถนนปลอดภัย ค่าที่ขาดหายหรือหมดอายุยังถือว่า “ไม่ทราบ” จุดของ Flood Hub เป็นผลจากแบบจำลองที่จุดวัดเสมือน ไม่ใช่เครื่องวัดจริง และพยากรณ์เฉพาะน้ำท่วมจากลำน้ำ — ไม่ครอบคลุมน้ำท่วมฉับพลันระดับถนน ซึ่งเป็นแบบที่ทำให้เมืองไทยต้องปิดจริง ๆ
            </p>
            <p>
              เมืองสามมิติบนแผนที่สร้างจากข้อมูล OpenStreetMap — อาคาร 59,344 หลัง (แยกเป็น <code>buildings-core.geojson</code> ย่านเมืองเก่า/ดอยสุเทพ และ <code>buildings-wide.geojson</code> เขตเมืองรอบนอก), กำแพงเมืองเก่า 14 ชิ้น, และวัด 474 แห่ง ถูกแยกเป็นไฟล์ต่างหากตามระดับซูม — MapLibre จึงสลับชั้นตามระยะซูมแทนที่จะโหลดทั้งหมดทีเดียว
            </p>
          </>
        ) : (
          <>
            <p>
              The system measures nothing itself — it relays the agencies that do: Royal Forest Department (25-amphoe hotspots, forest-tenure classified), GISTDA (per-amphoe PM2.5 + AOD satellite tiles), NASA FIRMS (MODIS + VIIRS), Google Flood Hub (riverine model forecasts at virtual HYBAS gauges on the Ping, CC BY 4.0), NASA GIBS (Himawari-9 infrared and MODIS AOD tiles), RainViewer (live precipitation radar), Open-Meteo CAMS (global AQI), OpenSky Network and adsb.lol (ADS-B flights), Google News RSS + GDELT 2.0 (news in 8 languages, auto-driven by inbound flight origins), OSM Overpass (bus routes, waterways, 3D buildings), Chiang Mai University’s Smart Campus Management Center (live shuttle GPS over MQTT), Longdo (CCTV), public flood and road cameras via the {MAHOLAN} (catalogue metadata only — no video is mirrored; each camera is credited to the agency that runs it, mostly the Department of Highways), {THAIWATER} (measured river levels at real gauges on the Ping and its tributaries, published by the National Hydroinformatics Data Center; observations credited to RID, FOP, HII and EGAT — keyless public feed, and the one figure on this board with an authority behind it is P.1’s published critical level), and a dated snapshot of 311 datasets from the province’s open-data catalogue on data.go.th (taken 15 Sep 2026 from a filtered search — not the full count).
            </p>
            <p>Every panel on screen carries its source label — tap any of them for details. The full list is in the downloadable document at the end of this page.</p>
            <p className="text-[13px] text-[var(--dim)]">
              The board reads measured Ping-basin river levels and Chiang Mai rain gauges from ThaiWater. Gauge observation times and published thresholds remain visible. A quiet Ping gauge does not establish that hillside streams or streets are safe; missing or expired observations remain unknown. FloodHub’s points are model output at virtual gauges, not physical instruments, and they forecast riverine flooding only — not the street-level flash flooding that actually closes a Thai city.
            </p>
            <p>
              The 3D city on the map is built from OpenStreetMap — 59,344 buildings (split into <code>buildings-core.geojson</code> for the old city and Doi Suthep and <code>buildings-wide.geojson</code> for the outer city), 14 old-city wall segments and 474 temples, each kept in its own file by zoom level, so MapLibre swaps layers as you zoom instead of loading everything at once.
            </p>
          </>
        )}
      </div>
    </Section>
  );
}

function ThinkingSection({ th }: { th: boolean }) {
  return (
    <Section kicker={th ? "03 · ระบบคิดอย่างไร" : "03 · How it thinks"} title={th ? "ระบบคิดอย่างไร" : "How the system thinks"}>
      <div className={PROSE}>
        {th ? (
          <>
            <p>
              หลักการเดียวกันทั้งระบบ: <strong>ตัวเลขไม่ใช่คำตอบ — คำกริยาคือคำตอบ</strong> ระบบแปลงตัวเลขเป็นการปฏิบัติหนึ่งอย่างเสมอ เช่น จุดความร้อนเกิน 5 จุดในเขตอุทยาน = “แจ้งเจ้าหน้าที่ดับไฟ ประสานกำนันผู้ใหญ่บ้าน” ฝุ่น PM2.5 เกิน 75 µg/m³ = “ออกประกาศงดกิจกรรมกลางแจ้ง สวมหน้ากาก”
            </p>
            <p>
              ค่าฝุ่นบนแถบด้านบนคือค่าเฉลี่ยของสถานีกรมควบคุมมลพิษที่ยังสดในจังหวัด ถ้าไม่มีสถานีสด ระบบใช้แบบจำลอง CAMS และติดป้ายว่าเป็นแบบจำลอง DustBoy เป็นคนละตัวเลข ไม่ถูกยุบรวม และค่าที่เก่ากว่า 3 ชั่วโมงถูกตัดทิ้ง จุดความร้อนในเขตป่าสงวนยังสำคัญกว่าจุดในพื้นที่เกษตร ช่วงมี.ค.–เม.ย. ระบบเร่งจังหวะเตือนเอง
            </p>
            <p>
              จุดวิเคราะห์หลักของระบบคือ “สมุดบัญชีแม่ปิง” — ลุ่มน้ำเดียวกันท่วมเดือนตุลาคม (มรสุมตะวันตกเฉียงใต้) และแล้งเดือนเมษายน (ฤดูเผา + พายุฤดูร้อน) เขื่อนแม่งัดคือบัญชีที่คั่นกลาง ทุกการระบายคือการแลก ความเสี่ยงน้ำท่วมท้ายน้ำคืนนี้กับน้ำชลประทานฤดูแล้งปีหน้า
            </p>
          </>
        ) : (
          <>
            <p>
              One principle everywhere: <strong>a number is not an answer — a verb is.</strong> Every reading becomes one action. More than 5 hotspots inside a national park = “alert the fire crews and coordinate with the kamnan and village heads”; PM2.5 above 75 µg/m³ = “issue an outdoor-activity advisory; wear masks”.
            </p>
            <p>
              The masthead PM2.5 is the average of fresh PCD monitors in the province; if none are fresh it falls back to the CAMS model and is labelled as a model. DustBoy stays a separate number and is not merged in, and a reading older than 3 hours is dropped. Hotspots inside Royal Forest / National Reserve lands still outrank agricultural burns; during March–April the alert cadence tightens.
            </p>
            <p>
              The keystone read is the Ping Ledger: the same basin floods in October (southwest monsoon) and burns dry in April (burning season plus summer storms). The Mae Ngat dam is the ledger between the two — every release trades tonight’s downstream flood risk against next year’s dry-season irrigation water.
            </p>
          </>
        )}
      </div>
    </Section>
  );
}

function HonestySection({ th }: { th: boolean }) {
  return (
    <Section kicker={th ? "04 · กติกาความซื่อสัตย์" : "04 · The honesty rules"} title={th ? "กติกาความซื่อสัตย์" : "The honesty rules"}>
      <div className={PROSE}>
        {th ? (
          <>
            <p>
              1) ทุกตัวเลขติดป้ายว่าเป็นข้อมูล <strong>สด / จำลอง / แบบจำลอง</strong> — ไม่มีตัวเลขแต่งขึ้น 2) ภาพกล้องที่ยังไม่ใช่ของจริงติดป้าย <strong>สาธิต</strong> สีเหลืองอำพันเสมอ พร้อมลิงก์ต้นทางและตำแหน่งจริง 3) เมื่อไม่มีข้อมูล ระบบบอกว่า “ข้อมูลไม่พอ” — ไม่แสดงสีเขียวหลอก 4) ชุดข้อมูลที่อ่านไม่ได้ถูกบันทึกไว้ให้เห็น ไม่ถูกซ่อน
            </p>
            <p>
              ตัวอย่างที่เป็นรูปธรรม: รถบัสสนามบิน RTC บนแผนที่คือ <strong>การจำลองจากตารางเวลา</strong> ไม่ใช่ GPS จริง (วิ่งคงที่ 35 กม./ชม. ตามเส้นทาง) — ในขณะที่รถรับส่งมหาวิทยาลัยเชียงใหม่คือ <strong>GPS สดจริง</strong> จากมหาวิทยาลัย ทั้งสองแยกป้ายกำกับชัดเจนบนปุ่มควบคุมแผนที่ ส่วนตัวเลข “ผู้โดยสารประมาณการ” มาจากจำนวนที่นั่งเครื่องบินจริงคูณด้วยอัตราภาระบรรทุกสมมติ (82% สำหรับข้อมูลผู้โดยสารขาเข้า หรือค่าที่นั่งเฉลี่ยตามขนาดเครื่องสำหรับข้อมูลเที่ยวบินขาออก) — เที่ยวบินและประเทศต้นทางเป็นข้อมูลจริง มีเพียงจำนวนผู้โดยสารเท่านั้นที่เป็นค่าประมาณ
            </p>
          </>
        ) : (
          <>
            <p>
              1) Every number is labelled <strong>live / scenario / model</strong> — nothing is invented. 2) Footage that is not yet real always wears the amber <strong>DEMO</strong> badge, with its source link and real location. 3) When there is no data, the board says “not enough data” — never a false green. 4) Datasets that cannot be read are listed, not hidden.
            </p>
            <p>
              Concretely: the RTC airport buses on the map are a <strong>timetable simulation</strong> (a constant 35 km/h along the published route), not live GPS — while the CMU campus shuttles are <strong>real, live GPS</strong> from the university’s own feed; both are labelled accordingly on the map controls. “Estimated visitors” multiplies real seat capacity by an assumed load factor (82% for inbound arrivals, or a size-based average for outbound flights) — the flight counts and origin countries are real; only the passenger count is an estimate.
            </p>
          </>
        )}
      </div>
    </Section>
  );
}

type T = (th: string, en: string) => string;

function ArchitectureSection({ th, t }: { th: boolean; t: T }) {
  return (
    <Section kicker={th ? "05 · สถาปัตยกรรมเป็นแผนภาพ" : "05 · Architecture, in diagrams"} title={th ? "สถาปัตยกรรมเป็นแผนภาพ" : "The architecture, in diagrams"}>
      <div className={PROSE}>
        {th ? (
          <>
            <p>
              ไม่มีเซิร์ฟเวอร์ที่ต้องเฝ้า: หน้าเว็บทำงานบน Cloudflare Workers (ผ่าน OpenNext, Next.js 15) ตัวเว็บไปดึงฟีดสดเองทุกนาที ข้อมูลที่เปลี่ยนช้า (ขอบเขต 25 อำเภอ สายน้ำลุ่มปิง เส้นทางรถเมล์ อาคาร 3 มิติ แค็ตตาล็อกราชการ 311 ชุด) ถูก “อบ” เป็นไฟล์ไว้ล่วงหน้าด้วยสคริปต์ที่รันซ้ำได้เสมอ
            </p>
            <p>
              แต่ระบบสำรองข้อมูลไม่ได้ใช้แบบเดียวกันหมดทุกจุด — โมดูลส่วนใหญ่ลองดึงข้อมูลสดก่อน แล้วตกไปใช้ “สถานการณ์จำลอง” ที่ติดป้ายชัดเจนเมื่อดึงไม่สำเร็จ, สามโมดูล (เส้นทางรถเมล์ สายน้ำ ข้อมูลเปิด) อ่านไฟล์ที่อบไว้ล่วงหน้าผ่าน Cloudflare Workers เป็นหลัก แล้วเรียก API สดเป็นทางเลือกสุดท้าย, และเที่ยวบิน (ซึ่งซับซ้อนที่สุด) ใช้วิธีที่ต่างออกไปทั้งหมด — ดูแผนภาพที่สองด้านล่าง
            </p>
          </>
        ) : (
          <>
            <p>
              There is no server to babysit: the site runs on Cloudflare Workers (via OpenNext, Next.js 15) and fetches the live feeds itself every minute. Slow-changing data (the 25 amphoe boundaries, Ping-basin waterways, bus routes, 3D buildings, the 311-record government catalogue) is “baked” into files ahead of time by scripts that can always be re-run.
            </p>
            <p>
              The fallback is not the same everywhere, though — most modules try live data first and fall back to a clearly labelled “scenario” when the fetch fails; three modules (bus routes, waterways, open data) read their pre-baked files through Cloudflare Workers first and call the live API only as a last resort; and flights, the most complex case, work differently altogether — see the second diagram below.
            </p>
          </>
        )}
      </div>

      <PipelineDiagram t={t} />

      <div className="mt-6 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]">
        {th ? (
          <>
            <p>
              เที่ยวบินคือกรณีพิเศษ: OpenSky และ adsb.lol ทั้งคู่ <strong>เข้าไม่ถึงจากเครือข่าย Cloudflare เอง</strong> — ยืนยันด้วย Worker ทดสอบแยกต่างหาก: OpenSky คืนรหัส 522 ของ Cloudflare (ขอบเครือข่ายเปิดการเชื่อมต่อไปยังต้นทางไม่ได้เลย ~19 วินาที) ทั้งสำหรับ endpoint ข้อมูลเที่ยวบินและ endpoint ยืนยันตัวตน ส่วน adsb.lol ตอบกลับ 429 จาก nginx (จำกัดตาม IP ที่ Cloudflare ใช้ร่วมกันทั่วโลก) ไม่ว่าจะใส่ key หรือไม่ก็ตาม — จึงไม่มีทางแก้ด้วยการยืนยันตัวตนได้เลย
            </p>
            <p>
              ทางแก้คือเครื่อง Mac เครื่องหนึ่ง (นอกเครือข่าย Cloudflare) รันสคริปต์ผ่าน launchd ดึงข้อมูลเที่ยวบินทุก 30 วินาที แล้วส่งเข้า Cloudflare KV ผ่าน endpoint ที่มีรหัสลับกำกับ — Worker จึงอ่านจาก KV ก่อนเสมอ ถ้าข้อมูลเก่าเกิน 3 นาที (แปลว่า relay หยุดทำงาน) ระบบจะรายงานว่า “ข้อมูลเสื่อมสภาพ” อย่างชัดเจน แทนที่จะแสดงตำแหน่งเครื่องบินเก่าค้างไว้
            </p>
          </>
        ) : (
          <>
            <p>
              Flights are a special case: neither OpenSky nor adsb.lol is <strong>reachable from Cloudflare’s own network</strong> — confirmed with a separate throwaway test Worker. OpenSky returns Cloudflare error 522 (the edge cannot even open a TCP connection to OpenSky’s origin, ~19 s) for both its flight-data and its authentication endpoints; adsb.lol returns 429 from nginx (a shared-IP rate limit tied to Cloudflare’s egress ranges), regardless of credentials. No amount of authentication fixes a network-level block.
            </p>
            <p>
              The fix is a Mac outside Cloudflare’s network running a launchd script that pulls flight data every 30 seconds and pushes it into Cloudflare KV through a shared-secret endpoint. The Worker always reads KV first; if the data is more than 3 minutes old (meaning the relay has stopped), the board reports “degraded” explicitly instead of leaving old aircraft positions on the map.
            </p>
          </>
        )}
      </div>

      <FlightRelayDiagram t={t} />

      <p className={`mt-3 ${NOTE}`}>
        {th
          ? "ทั้งระบบโคลนได้จาก GitHub และดีพลอยได้ฟรีบน Cloudflare แพ็กเกจฟรี — ดูเอกสารติดตั้งด้านล่าง"
          : "The whole system clones from GitHub and deploys free on Cloudflare’s free tier — see the setup document below."}
      </p>
    </Section>
  );
}

function TwinSection({ th, t }: { th: boolean; t: T }) {
  return (
    <Section kicker={th ? "06 · นี่คือ “ดิจิทัลทวิน” หรือไม่" : "06 · Is this a “digital twin”?"} title={th ? "แดชบอร์ดนี้คือ “ดิจิทัลทวิน” หรือไม่" : "Is this dashboard a “digital twin”?"}>
      <div className={PROSE}>
        {th ? (
          <>
            <p>
              คำว่า “ดิจิทัลทวิน” (digital twin) ถูกใช้อย่างหลวมในวงการเมืองอัจฉริยะ มาตรฐาน <strong>ISO/IEC 30173:2023</strong> (Digital twin — Concepts and terminology) ให้นิยามที่เข้มงวดกว่านั้น โดยสืบทอดแนวคิดจากงานวิชาการของ Kritzinger และคณะ (2018) ที่แบ่งระดับไว้ 3 ขั้น: <strong>แบบจำลองดิจิทัล (Digital Model)</strong> — ไม่มีการไหลของข้อมูลอัตโนมัติกับของจริงเลย, <strong>เงาดิจิทัล (Digital Shadow)</strong> — รับข้อมูลจากของจริงอัตโนมัติทิศทางเดียว (จริง → ดิจิทัล) แต่ไม่ส่งคำสั่งกลับ, และ <strong>ดิจิทัลทวินแท้จริง (Digital Twin)</strong> — ต้องมีการไหลข้อมูลสองทิศทางอัตโนมัติ คือระบบดิจิทัลส่งผลควบคุมกลับไปยังของจริงได้ด้วย
            </p>
            <p>
              ตามนิยามนี้ ห้องปฏิบัติการเชียงใหม่จัดอยู่ในระดับ <strong>“เงาดิจิทัล”</strong> — ไม่ใช่ดิจิทัลทวินแท้จริง ระบบรับข้อมูลจริงหลายแหล่ง (เที่ยวบิน ระดับน้ำ ฝุ่น รถรับส่งมหาวิทยาลัย) มาปรับปรุงแบบจำลองเชิงพื้นที่-เวลาโดยอัตโนมัติ แต่ไม่มีช่องทางใดในสถาปัตยกรรมที่ระบบจะสั่งการกลับไปควบคุมสัญญาณไฟจราจร ประตูระบายน้ำ หรือระบบจริงอื่นใด — การไหลของข้อมูลเป็นทิศทางเดียวตลอดทั้งระบบ
            </p>
            <p>
              การจำลองรถบัส RTC (ตามตารางเวลา ไม่ใช่ GPS จริง) และตัวประมาณผู้โดยสาร (จากที่นั่งเครื่องบิน × อัตราสมมติ) เป็นเพียง<strong>กฎเกณฑ์อย่างง่าย</strong> ไม่ใช่แบบจำลองเชิงฟิสิกส์หรือแบบจำลองสินทรัพย์ (asset model) ตามแนวทาง Asset Administration Shell (IEC 63278) และกรอบงาน ISO 23247 ก็ใช้โดยตรงไม่ได้ เพราะออกแบบมาสำหรับดิจิทัลทวินในอุตสาหกรรมการผลิตโดยเฉพาะ ไม่ใช่ระบบปฏิบัติการเมือง
            </p>
            <p>
              ระบบนี้ยังไม่เคยถูกประเมินอย่างเป็นทางการตามมาตรฐานวุฒิภาวะ เช่น IEEE 3144-2025 หรือ ISO/IEC 30186:2025 — แต่จากสถาปัตยกรรมที่เป็นอยู่ (ไม่มี asset model, ไม่มีการควบคุมย้อนกลับ, ไม่มีแบบจำลองเชิงฟิสิกส์) การประเมินตามกรอบเหล่านี้อย่างตรงไปตรงมาน่าจะอยู่ในระดับวุฒิภาวะเริ่มต้นถึงปานกลางเท่านั้น
            </p>
          </>
        ) : (
          <>
            <p>
              “Digital twin” gets used loosely in smart-city marketing. <strong>ISO/IEC 30173:2023</strong> (Digital twin — Concepts and terminology) is stricter, formalising a distinction that traces back to Kritzinger et al. (2018): a <strong>Digital Model</strong> has no automatic data flow in either direction; a <strong>Digital Shadow</strong> has automatic one-way flow from the physical asset to its digital representation; a <strong>Digital Twin</strong> proper requires automatic two-way flow, including control signals back to the physical asset.
            </p>
            <p>
              By that definition, this system is a <strong>Digital Shadow</strong>, not a digital twin in the strict sense: it automatically ingests real-world state (flights, water levels, PM2.5, CMU shuttle GPS) into a live spatial-temporal model, but nothing in the architecture sends a command back to a traffic signal, a sluice gate, or any other physical system — the data flow is one-directional throughout.
            </p>
            <p>
              The RTC bus “simulation” is a timetable-driven rule (a constant 35 km/h along a fixed route, not live GPS or a physics engine), and the visitor/arrival estimates apply a fixed seat-count or load-factor assumption to real flight data — both are <strong>simple deterministic heuristics</strong>, not the physics-based or asset-modelled simulation implied by frameworks like the Asset Administration Shell (IEC 63278). ISO 23247 does not apply directly either: it is scoped to manufacturing digital twins, not urban operations systems like this one.
            </p>
            <p>
              This system has not been formally assessed against IEEE 3144-2025 (Digital Twin Maturity Model and Assessment Methodology in Industry) or ISO/IEC 30186:2025 (Digital twin — Maturity model and guidance for a maturity assessment); based on its current architecture (no asset model, no closed-loop control, no physics model), an honest self-assessment against either framework would likely place it at an early-to-mid maturity tier, not a fully mature one.
            </p>
          </>
        )}
      </div>

      <MaturityDiagram t={t} />

      <p className={`mt-3 ${NOTE}`}>
        {th
          ? "ทั้งหมดนี้ไม่ใช่การตำหนิระบบในสภาพปัจจุบัน — เงาดิจิทัลที่ติดป้ายชัดเจนและซื่อสัตย์จนผู้ปฏิบัติงานไว้ใจได้ มีค่ามากกว่า “ดิจิทัลทวิน” ที่อ้างเกินจริงและซ่อนสมมติฐานไว้ การจัดระดับข้างต้นมีไว้เพื่อไม่ให้ใช้คำนี้แรงเกินกว่าที่สถาปัตยกรรมรองรับ"
          : "None of this is a criticism of the system as it stands — a well-labelled, honest Digital Shadow that an operator can trust is worth more than an overclaimed “digital twin” that hides its assumptions. The classification above exists so the term is never used more strongly than the architecture supports."}
      </p>
    </Section>
  );
}

function PartnersSection({ th }: { th: boolean }) {
  const ext = "text-[var(--cool)] underline-offset-2 hover:underline";
  return (
    <Section kicker={th ? "07 · พันธมิตรมหาวิทยาลัย" : "07 · University partners"} title={th ? "พันธมิตรมหาวิทยาลัย" : "University partners"}>
      <div className={PROSE}>
        <p>
          {th
            ? "ศูนย์บริหารจัดการมหาวิทยาลัยอัจฉริยะ (SCMC) มหาวิทยาลัยเชียงใหม่ เผยแพร่ข้อมูลอุบัติเหตุและข้อมูลยานพาหนะในมหาวิทยาลัยผ่าน Tableau Public — ฝังไว้ด้านล่างโดยตรงจากต้นทาง และให้ฟีดตำแหน่งรถรับส่งภายในมหาวิทยาลัยแบบ GPS สดผ่าน MQTT ที่ใช้แสดงผลชั้นรถรับส่ง มช. บนแผนที่หลักของระบบ"
            : "Chiang Mai University’s Smart Campus Management Center (SCMC) publishes accident and campus-vehicle datasets on Tableau Public, embedded live below straight from the source, and a live GPS shuttle feed over MQTT that powers the CMU Shuttle layer on the main map."}
        </p>
      </div>
      <div className="mt-4 border border-[var(--line)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--bg-surface)] px-3 py-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
            {th ? "อุบัติเหตุ — SCMC มช." : "Accident — CMU SCMC"}
          </span>
          <a
            href="https://public.tableau.com/app/profile/scmc/viz/Accident_17206129265280/Accident"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--cool)] hover:underline"
          >
            {th ? "เปิดใน Tableau Public ↗" : "Open on Tableau Public ↗"}
          </a>
        </div>
        <iframe
          title={th ? "แดชบอร์ดอุบัติเหตุ — SCMC มช." : "CMU SCMC — Accident dashboard"}
          src="https://public.tableau.com/views/Accident_17206129265280/Accident?:showVizHome=no&:embed=true&:language=en-US"
          className="h-[600px] w-full"
          loading="lazy"
        />
      </div>
      <p className="mt-2 font-mono text-[11px] text-[var(--dim)]">
        {th ? "แหล่งอื่นจาก SCMC:" : "More from SCMC:"}{" "}
        <a href="https://public.tableau.com/app/profile/scmc/viz/Accident_17206129265280" target="_blank" rel="noreferrer" className={ext}>
          {th ? "ข้อมูลการลงทะเบียนยานพาหนะ" : "Vehicle registration data"}
        </a>{" "}
        ·{" "}
        <a href="https://public.tableau.com/app/profile/scmc" target="_blank" rel="noreferrer" className={ext}>
          {th ? "โปรไฟล์ SCMC" : "SCMC profile"}
        </a>
      </p>
    </Section>
  );
}

const DOWNLOADS: { href: string; file: string; title: [string, string]; desc: [string, string] }[] = [
  {
    href: "/docs/cnx-sources.md",
    file: "cnx-sources.md",
    title: ["แหล่งข้อมูลทั้งหมด", "All data sources"],
    desc: ["ทุกฟีด ทุกลิงก์ ทุกสัญญาอนุญาต — ตารางเดียวครบ", "Every feed, every link, every licence — one table."],
  },
  {
    href: "/docs/cnx-methodology.md",
    file: "cnx-methodology.md",
    title: ["ระบบคิดอย่างไร", "Methodology"],
    desc: ["ทุกเกณฑ์ ทุกสูตร: ระดับน้ำ, AQI ไทย 2566, จุดความร้อน, บัญชีน้ำปิง", "Every threshold and formula: river levels, Thai AQI 2023, hotspots, the Ping ledger."],
  },
  {
    href: "/docs/cnx-setup.md",
    file: "cnx-setup.md",
    title: ["ติดตั้งระบบเอง", "Clone & run"],
    desc: ["โคลนจาก GitHub → ดึงข้อมูล → ดีพลอยฟรีบน Cloudflare — ทีละขั้น", "Clone from GitHub → fetch the data → deploy free on Cloudflare — step by step."],
  },
];

function DownloadsSection({ th }: { th: boolean }) {
  const i = th ? 0 : 1;
  return (
    <Section kicker={th ? "08 · ดาวน์โหลด" : "08 · Downloads"} title={th ? "ดาวน์โหลดเอกสาร" : "Download the documents"}>
      <div className={PROSE}>
        <div className="grid gap-2 sm:grid-cols-3">
          {DOWNLOADS.map((d) => (
            <a key={d.href} href={d.href} download className="border border-[var(--line)] p-3 transition-colors hover:border-[var(--cool)]">
              <div className="text-[14px] font-bold">{d.title[i]}</div>
              <div className="font-mono text-[11px] tracking-[0.04em] text-[var(--cool)]">{d.file}</div>
              <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--dim)]">{d.desc[i]}</p>
            </a>
          ))}
        </div>
        <p className="text-[13px] text-[var(--dim)]">
          {th ? "ซอร์สโค้ดทั้งหมด:" : "Full source code:"}{" "}
          <a href="https://github.com/Nonarkara/cnx" className="text-[var(--cool)] underline-offset-2 hover:underline">
            github.com/Nonarkara/cnx
          </a>
        </p>
      </div>
    </Section>
  );
}

function LeadershipSection({ th, t }: { th: boolean; t: T }) {
  const rcad = t(
    "RCAD — สำนักงานเร่งรัดการวิจัยและนวัตกรรมเพื่อเพิ่มความสามารถการแข่งขันและการพัฒนาพื้นที่ (องค์การมหาชน)",
    "RCAD — Office for Accelerating Research and Innovation for Competitiveness and Area Development (Public Organization)",
  );
  const card = "border border-[var(--line)] bg-[var(--bg-surface)] p-5";
  const role = "font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cool)]";
  const bio = "mt-2 text-[14px] leading-[1.7] text-[var(--ink)]";
  const foot = "mt-4 border-t border-[var(--line)] pt-3 font-mono text-[11px] text-[var(--dim)]";
  return (
    <Section kicker={th ? "09 · ผู้สนับสนุนโครงการและผู้ออกแบบระบบ" : "09 · Project sponsor & system architect"} title={th ? "ผู้สนับสนุนและผู้ออกแบบระบบ" : "Sponsor and system architect"}>
      <div className="mt-3 max-w-[70ch] space-y-4 text-[15px] leading-[1.75]">
        <div className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className={role}>{th ? "ผู้สนับสนุนโครงการ" : "Project Sponsor"}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/rcad.svg" alt={rcad} title={rcad} style={{ height: 32, width: "auto" }} className="block object-contain" />
          </div>
          <h3 className="mt-2 text-[20px] font-bold text-[var(--ink)]">
            {th ? "รศ. ดร. ปุ่น เที่ยงบูรณธรรม" : "Assoc. Prof. Pun Thiengburanathum, PhD"}
          </h3>
          <p className={bio}>
            {th
              ? "รองผู้อำนวยการหน่วยบริหารและจัดการทุนด้านการพัฒนาพื้นที่ (บพท.) — ปัจจุบัน บพท. ยุบรวมเป็นส่วนงานหนึ่งของสำนักงานเร่งรัดการวิจัยและนวัตกรรมเพื่อเพิ่มความสามารถการแข่งขันและการพัฒนาพื้นที่ (องค์การมหาชน) หรือ รวพ. (RCAD) — อดีตอาจารย์ประจำคณะวิศวกรรมศาสตร์ มหาวิทยาลัยเชียงใหม่ ผู้เชี่ยวชาญด้านการพัฒนาเมืองและการขนส่ง สนับสนุนโครงการห้องปฏิบัติการเชียงใหม่ในฐานะผู้สนับสนุนของ รวพ."
              : "Deputy Director of the Program Management Unit on Area-Based Development (PMU-A), now a division of RCAD, and former faculty member of the Faculty of Engineering, Chiang Mai University — an expert in urban development and transport, sponsoring the Chiang Mai war room on RCAD’s behalf. RCAD is the Office for Accelerating Research and Innovation for Competitiveness and Area Development (Public Organization), a public organisation under the Ministry of Higher Education, Science, Research and Innovation, established by Royal Decree announced 31 December 2025 (B.E. 2568). The English name renders the Thai official name; RCAD is the abbreviation used on its website."}
          </p>
          <div className={foot}>
            {th ? "องค์กร:" : "Organisation:"}{" "}
            <a href="https://www.nxpo.or.th/rcad/" target="_blank" rel="noopener noreferrer" className="text-[var(--cool)] underline-offset-2 hover:underline">
              {th ? "รวพ. (RCAD) · nxpo.or.th/rcad" : "RCAD · nxpo.or.th/rcad"}
            </a>
          </div>
        </div>

        <div className={card}>
          <div className={role}>{th ? "หัวหน้าสถาปัตยกรรมดิจิทัลทวินและเมืองอัจฉริยะ" : "Digital Twin & Smart City Architecture Lead"}</div>
          <h3 className="mt-1 text-[20px] font-bold text-[var(--ink)]">{th ? "ดร.นน อัครประเสริฐกุล" : "Dr Non Arkaraprasertkul"}</h3>
          <p className={bio}>
            {th
              ? "ผู้เชี่ยวชาญอาวุโส ฝ่ายส่งเสริมเมืองอัจฉริยะ สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (depa) กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม — ผู้ออกแบบสถาปัตยกรรมและขับเคลื่อนการพัฒนาระบบห้องปฏิบัติการดิจิทัลทวินของจังหวัดเชียงใหม่ ลพบุรี และภูเก็ต"
              : "Senior Expert in Smart City Promotion at the Digital Economy Promotion Agency (depa), Ministry of Digital Economy and Society, Thailand. Principal architect and lead engineer of the Chiang Mai, Lopburi, and Phuket provincial digital twin war room platforms."}
          </p>
          <div className={foot}>
            {th
              ? "การศึกษา: B.Arch. (เกียรตินิยมอันดับหนึ่ง จุฬาฯ), M.A. (MIT), M.Sc. (Oxford), A.M., Ph.D. (Harvard)"
              : "Education: B.Arch. (First-class honours, Chulalongkorn), M.A. (MIT), M.Sc. (Oxford), A.M., Ph.D. (Harvard)"}
          </div>
        </div>
      </div>
    </Section>
  );
}

export default function CNXAboutContent() {
  const { lang, t } = useLang();
  const th = lang === "th";
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  return (
    <div className="mx-auto max-w-[880px] px-5 py-8">
      <div className="cnx-brand-plate mb-6 w-fit max-w-full p-4 sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/cnx-lockup.png"
          alt={t("ห้องปฏิบัติการเชียงใหม่", "CNX War Room · Chiang Mai Operations War Room")}
          width={1000}
          height={500}
          className="block h-auto w-[360px] max-w-full object-contain"
        />
      </div>
      {/* Title block */}
      <div className={KICKER}>{t("เอกสารอธิบายระบบ", "How the system works")}</div>
      <h1 className="mt-1 text-[34px] font-bold leading-[1.15] tracking-[-0.02em]">
        {t("ห้องปฏิบัติการเชียงใหม่", "Chiang Mai Operations War Room")}
      </h1>
      <p className="mt-3 max-w-[70ch] text-[16px] leading-[1.75]">
        {t(
          "เอกสารนี้อธิบายว่าระบบทำงานอย่างไร ด้วยภาษาที่ไม่ต้องเป็นนักเทคนิคก็อ่านเข้าใจ — ข้อมูลมาจากไหน ระบบตัดสินใจอย่างไร และทำไมถึงเชื่อถือได้",
          "A plain-language explanation of the system: where every number comes from, how the system reaches its judgments, and why it can be trusted.",
        )}
      </p>
      <p className="font-mono text-[11px] text-[var(--dim)]">{t(`เอกสารฉบับ v${version}`, `Document v${version}`)}</p>

      <WebAppSection th={th} />
      <ColourSection th={th} />
      <FindingsSection th={th} />
      <WhatSection th={th} />
      <SourcesSection th={th} />
      <ThinkingSection th={th} />
      <HonestySection th={th} />
      <ArchitectureSection th={th} t={t} />
      <TwinSection th={th} t={t} />
      <PartnersSection th={th} />
      <DownloadsSection th={th} />
      <LeadershipSection th={th} t={t} />

      <footer className="border-t border-[var(--line)] py-6 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dim)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/cnx-monochrome.png" alt={t("ห้องปฏิบัติการเชียงใหม่", "CNX War Room")} width={64} height={48} className="cnx-brand-mono mb-3 block h-10 w-16 object-contain" />
        {t(
          "จังหวัดเชียงใหม่ · RCAD · สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (depa) · Smart City Thailand — ข้อมูลจากหน่วยงานที่ระบุในเอกสารแหล่งข้อมูล",
          "Chiang Mai Province · RCAD · Digital Economy Promotion Agency (depa) · Smart City Thailand — data from the agencies named in the sources document",
        )}
      </footer>
    </div>
  );
}
