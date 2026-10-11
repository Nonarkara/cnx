// "Findings · 29 Sep 2026" — the archived one-night record in the About
// document. Split out of CNXAboutContent to keep that file small. Each row
// carries a Thai and an English version; the caller renders one.

import type { Lang } from "../../lib/i18n";

type Row = { signal: [string, string]; came: [string, string]; read: [string, string] };

const ROWS: Row[] = [
  {
    signal: ["DustBoy (มช.)", "DustBoy (CMU)"],
    came: [
      "เซ็นเซอร์ 165 ตัวใน 8 จังหวัด: เชียงใหม่ 80 เชียงราย 32 พะเยา 16 แม่ฮ่องสอน 13 ลำปาง 8 ลำพูน 7 แพร่ 6 น่าน 3 ทุกแถวประทับเวลา 17:00 น. วันที่ 28 ก.ย. อายุข้อมูล 8 ชม. ออนไลน์: 0",
      "165 sensors, 8 provinces. Chiang Mai 80, Chiang Rai 32, Phayao 16, Mae Hong Son 13, Lampang 8, Lamphun 7, Phrae 6, Nan 3. Every row timestamped 17:00 ICT 28 Sep. Age 8 h. Online: 0.",
    ],
    read: [
      "ฟีดสาธารณะคือข้อมูลชุดเดียวที่ส่งมารายชั่วโมง ไม่ใช่นาฬิกาอิสระ 165 เรือน เมื่อเกิน 3 ชม. กระดานจะแจ้งว่าข้อมูลเก่า และไม่นำค่าเมื่อเย็นวานมาแสดงเป็น PM2.5 ของคืนนี้",
      "The public feed is one hourly batch, not 165 independent clocks. After 3 h the board says stale. It does not carry yesterday evening forward as tonight's PM2.5.",
    ],
  },
  {
    signal: ["Air4Thai (คพ.)", "PCD Air4Thai"],
    came: ["ไม่มีสถานีในเชียงใหม่ที่มีข้อมูลสดเลย", "0 fresh Chiang Mai monitors."],
    read: [
      "เครือข่ายตรวจวัดทางการเงียบในชั่วโมงเดียวกับที่เครือข่ายของมหาวิทยาลัยหยุดนิ่ง",
      "The official ground network was quiet at the same hour the university network froze.",
    ],
  },
  {
    signal: ["แบบจำลอง CAMS", "CAMS model"],
    came: [
      "13 µg/m³ ที่กริดตัวเมือง จุดเจ็ดจุดบนแผนที่คือค่าจากกริดเดียวนี้ที่ปรับสเกล",
      "13 µg/m³ at the city cell. The seven map dots are scaled copies of that one cell.",
    ],
    read: [
      "ค่าฝุ่นค่าเดียวบนกระดาน และเป็นแบบจำลองพยากรณ์ ไม่ใช่การวัดเจ็ดจุด และไม่ใช่ค่าจากภาคพื้นดิน",
      "The only PM number on the board, and it is a forecast model. It is not seven measurements and it is not a ground reading.",
    ],
  },
  {
    signal: ["MODIS AOD", "MODIS AOD"],
    came: [
      "0.196 ที่ 550 nm ช่วงเฝ้าระวังคือ 0.10–0.25 ระดับวิกฤตเริ่มที่ 0.40",
      "0.196 at 550 nm. Watch band is 0.10–0.25. Critical starts at 0.40.",
    ],
    read: ["ค่าจากดาวเทียมอยู่ในช่วงเฝ้าระวัง ไม่ใช่เหตุการณ์ควัน", "The satellite is in the watch band, not a smoke event."],
  },
  {
    signal: ["AERONET", "AERONET"],
    came: [
      "23 วันที่คัดกรองเมฆแล้ว ระหว่าง 29 ส.ค.–27 ก.ย. ค่า AOD รายวันล่าสุด 0.061 ที่ 500 nm (27 ก.ย.) วันที่ 29 ส.ค. อยู่ที่ 0.099 ค่า Ångström exponent ราว 1.13 ทั้งสองวัน",
      "23 cloud-screened days, 29 Aug–27 Sep. Latest daily AOD 0.061 at 500 nm (27 Sep). The 29 Aug day was 0.099. Ångström exponent about 1.13 on both.",
    ],
    read: [
      "เครื่องวัดแสงภาคพื้นดินเห็นอนุภาคละเอียด ไม่ใช่กลุ่มควันหนา วันที่มีเมฆจะไม่มีข้อมูลเลย",
      "The ground photometer has been looking at fine particles, not a thick smoke plume. Cloudy days are simply missing.",
    ],
  },
  {
    signal: ["จุดความร้อน กรมป่าไม้", "RFD hotspots"],
    came: ["0 จุดในกรอบเชียงใหม่ตลอด 7 วัน", "0 in the Chiang Mai box over 7 days."],
    read: ["ฟีดของกรมป่าไม้เองก็เงียบ", "The forest department's own feed is quiet."],
  },
  {
    signal: ["NASA FIRMS", "NASA FIRMS"],
    came: [
      "คืนนั้นไม่มีคีย์แผนที่ ระบบจึงใช้จุดตัวอย่าง 14 จุดแทน",
      "No map key that night, so the fallback was 14 illustrated points.",
    ],
    read: [
      "จุดทั้ง 14 ไม่ได้ถูกวาด ไม่ถูกนับคะแนน และไม่ถูกจำลองเป็นกลุ่มควัน — ป้ายสถานะขึ้นว่า “ไม่มีข้อมูลสด” และจำนวนไฟในผลประเมินว่างเปล่า ตอนนี้ตั้งค่าคีย์แล้ว รอบดาวเทียมสดจะรายงานกรณีตรวจไม่พบไฟเป็นศูนย์เอง แทนการใช้ข้อมูลสำรอง",
      "Those 14 were not drawn, not scored, and not advected into a plume — the pill read “no live” and the verdict fire count was empty. A key is configured now; the live pass reports its own zero-detections case rather than falling back.",
    ],
  },
  {
    signal: ["เส้นทางควัน", "Smoke trajectory"],
    came: ["คืนนั้นไม่มีแหล่งที่มา จำนวนช่วงเส้นทาง: 0", "Provenance unavailable that night. Segments: 0."],
    read: [
      "กลุ่มควัน 6 ชั่วโมงจะวาดเฉพาะเมื่อมีรอบ VIIRS สดภายใน 350 กม. (ระยะที่ครอบคลุมถึงรัฐฉาน) คำนวณจากลมแบบเส้นตรง ไม่ใช่การพยากรณ์",
      "A 6-hour plume is only drawn from a live VIIRS pass inside 350 km (the window that reaches Shan State). Straight-line wind, not a forecast.",
    ],
  },
  {
    signal: ["กล้อง", "Cameras"],
    came: [
      "เข้าถึงได้ 4 จาก 9 ตัว ภาพนิ่งจาก Windy หลายภาพเก่าเป็นชั่วโมงถึงหลายวัน",
      "4 of 9 reachable. Several Windy stills are hours to days old.",
    ],
    read: [
      "ภาพนิ่งที่เก่าหลายวันถือว่าออฟไลน์ ตัวให้คะแนนหมอกควันจากกล้องไม่รายงานมา 45 นาที จึงไม่แสดงผลประเมินจากกล้อง",
      "A days-old still is offline. The webcam haze scorer had not reported in 45 minutes, so no camera verdict is shown.",
    ],
  },
  {
    signal: ["ผลประเมินภาพรวม", "Verdict"],
    came: [
      "คะแนน 0 ระดับปลอดภัย แหล่งที่มาผสม — สถานะที่กระดานไม่รายงานแล้ว เพราะแกนน้ำท่วมที่มองไม่เห็นรับรองว่าปลอดภัยไม่ได้",
      "Score 0, level safe, provenance mixed — a state the board no longer reports, because a blind flood axis cannot certify safe.",
    ],
    read: [
      "“ผสม” เพราะแบบจำลองตอบกลับ แต่รอบดาวเทียมตรวจไฟไม่ตอบ “ปลอดภัย” ไม่ได้แปลว่า “วัดอากาศที่พื้นดินแล้วสะอาด”",
      "Mixed because the model answered and the satellite fire pass did not. Safe is not “the air was measured clean on the ground.”",
    ],
  },
];

export default function FindingsTable({ lang }: { lang: Lang }) {
  const i = lang === "th" ? 0 : 1;
  const head = lang === "th" ? ["สัญญาณ", "สิ่งที่ได้กลับมา", "การอ่านผล"] : ["Signal", "What came back", "Read"];
  return (
    <div className="mt-4 overflow-x-auto border border-[var(--line)]">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="bg-[var(--bg-raised)] font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {ROWS.map((r) => (
            <tr key={r.signal[1]}>
              <td className="px-3 py-2 font-semibold">{r.signal[i]}</td>
              <td className="px-3 py-2">{r.came[i]}</td>
              <td className="px-3 py-2">{r.read[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
