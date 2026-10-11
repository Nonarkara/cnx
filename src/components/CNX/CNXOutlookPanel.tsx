"use client";

// "48 ชั่วโมงข้างหน้า" — the forecast answer first: which districts the
// model expects heavy rain or bad air in, when it peaks, what to do, and the
// official shelters to send people to. Evidence (each shelter's capacity,
// utilities and how precisely it is mapped) waits behind a disclosure.

import type { ProvinceOutlook, RainOutlook, AirOutlook, OutlookLevel } from "../../lib/cnx/outlook";
import { airActionTh, outlookTime, rainActionTh } from "../../lib/cnx/outlook";
import { precisionLabel, type SheltersFile } from "../../lib/cnx/shelters";

const LEVEL_TH: Record<OutlookLevel, string> = { watch: "เฝ้าระวัง", alert: "เตือนภัย", critical: "วิกฤต" };
const LEVEL_CLASS: Record<OutlookLevel, string> = {
  watch: "bg-[var(--sev-watch,#f99d1b)] text-black",
  alert: "bg-[var(--sev-alert,#ea580c)] text-black",
  critical: "bg-[var(--sev-critical,#dc2626)] text-white",
};

interface Props {
  outlook: ProvinceOutlook;
  shelters: SheltersFile | null;
  /** Fly the map to a district and show its shelters. */
  onShowOnMap: (target: { lat: number; lon: number; amphoeTh: string | null }) => void;
}

function Chip({ level }: { level: OutlookLevel }) {
  return <span className={`shrink-0 px-1.5 py-0.5 text-[11px] font-bold ${LEVEL_CLASS[level]}`}>{LEVEL_TH[level]}</span>;
}

function MapButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 shrink-0 border border-[var(--line)] px-3 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--cool-dim)]">
      {label}
    </button>
  );
}

function RainRow({ r, onShowOnMap }: { r: RainOutlook; onShowOnMap: Props["onShowOnMap"] }) {
  return (
    <li className="border-t border-[var(--line)] py-2.5 first:border-t-0">
      <div className="flex items-start gap-2">
        <Chip level={r.level} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">
            อ.{r.district.nameTh} · ฝน {r.district.rain24h.toFixed(0)} มม. ใน 24 ชม.
          </p>
          <p className="text-[12px] text-[var(--dim)]">
            หนักสุด {r.district.peakRainMmH.toFixed(1)} มม./ชม. ช่วง {outlookTime(r.district.peakRainAt)}
            {r.measured24h !== null && <> · วัดได้แล้ว {r.measured24h.toFixed(1)} มม. ใน 24 ชม.ที่ผ่านมา</>}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-[var(--ink)]">▸ {rainActionTh(r)}</p>
          {r.shelters.length > 0 && (
            <details className="mt-1 text-[12px]">
              <summary className="min-h-9 cursor-pointer py-1 font-semibold text-[var(--cool)]">ศูนย์พักพิง {r.shelters.length} แห่งใน อ.{r.district.nameTh}</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {r.shelters.map((s) => (
                  <li key={s.id} className="leading-snug">
                    <span className="font-semibold">{s.nameTh}</span>
                    {s.tambonTh && <span className="text-[var(--dim)]"> · ต.{s.tambonTh}</span>}
                    <span className="block text-[var(--dim)]">
                      รับได้ {s.capacity?.toLocaleString("th-TH") ?? "ไม่ระบุ"} คน · ห้องน้ำ {s.toilets ?? "ไม่ระบุ"} · {precisionLabel[s.precision].th}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <MapButton onClick={() => onShowOnMap({ ...r.point, amphoeTh: r.district.nameTh })} label="ดูบนแผนที่" />
      </div>
    </li>
  );
}

function AirRow({ a, onShowOnMap }: { a: AirOutlook; onShowOnMap: Props["onShowOnMap"] }) {
  return (
    <li className="border-t border-[var(--line)] py-2.5 first:border-t-0">
      <div className="flex items-start gap-2">
        <Chip level={a.level} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">อ.{a.district.nameTh} · PM2.5 สูงสุด {a.peak} µg/m³</p>
          <p className="text-[12px] text-[var(--dim)]">ช่วง {outlookTime(a.peakAt)} · แบบจำลอง CAMS</p>
          <p className="mt-1 text-[13px] leading-snug text-[var(--ink)]">▸ {airActionTh(a)}</p>
        </div>
        <MapButton onClick={() => onShowOnMap({ ...a.point, amphoeTh: null })} label="ดูบนแผนที่" />
      </div>
    </li>
  );
}

export default function CnxOutlookPanel({ outlook, shelters, onShowOnMap }: Props) {
  const fetchedAgo = outlook.fetchedAt ? Math.max(0, Math.round((Date.now() - Date.parse(outlook.fetchedAt)) / 3_600_000)) : null;
  return (
    <section aria-labelledby="outlook-48h" className="flex flex-col gap-3 border-b border-[var(--line)] p-3">
      <header className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="outlook-48h" className="text-[16px] font-bold">48 ชั่วโมงข้างหน้า</h2>
        <span className="text-[12px] text-[var(--dim)]">
          พยากรณ์จากแบบจำลอง ไม่ใช่ค่าวัด{fetchedAgo !== null ? ` · ดึงเมื่อ ${fetchedAgo} ชม.ก่อน` : ""}
        </span>
      </header>

      {!outlook.available ? (
        <p className="text-[13px] text-[var(--dim)]">ยังไม่มีข้อมูลพยากรณ์ — แบบจำลองไม่ตอบ ซึ่งไม่ใช่การพยากรณ์ว่าปลอดภัย</p>
      ) : (
        <>
          <div>
            <h3 className="text-[13px] font-bold text-[var(--dim)]">ฝนและน้ำป่า</h3>
            {outlook.rain.length ? (
              <ul>{outlook.rain.map((r) => <RainRow key={r.district.nameTh} r={r} onShowOnMap={onShowOnMap} />)}</ul>
            ) : (
              <p className="mt-1 text-[13px] leading-snug">
                ไม่มีอำเภอที่แบบจำลองคาดฝนหนัก (≥35 มม./24 ชม.)
                {outlook.wettest && <> · มากสุด อ.{outlook.wettest.nameTh} {outlook.wettest.rain24h.toFixed(0)} มม.</>}
                <span className="block text-[12px] text-[var(--dim)]">ไม่ใช่การยืนยันว่าไม่มีพายุเฉพาะจุด — ฝนที่วัดได้จริงและระดับน้ำยังเป็นหลัก</span>
              </p>
            )}
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-[var(--dim)]">ฝุ่นควัน PM2.5</h3>
            {!outlook.hasPm25 ? (
              <p className="mt-1 text-[13px] text-[var(--dim)]">แบบจำลองฝุ่น CAMS ไม่ตอบ — ไม่มีพยากรณ์ฝุ่นในรอบนี้</p>
            ) : outlook.air.length ? (
              <ul>{outlook.air.slice(0, 4).map((a) => <AirRow key={a.district.nameTh} a={a} onShowOnMap={onShowOnMap} />)}</ul>
            ) : (
              <p className="mt-1 text-[13px] leading-snug">
                ไม่คาดว่า PM2.5 จะเกิน 25 µg/m³ ในอำเภอใด
                {outlook.dirtiest?.pm25Peak != null && <> · สูงสุด อ.{outlook.dirtiest.nameTh} {outlook.dirtiest.pm25Peak} µg/m³</>}
                <span className="block text-[12px] text-[var(--dim)]">แบบจำลองมักประเมินควันในหุบเขาต่ำไป — ดูค่าวัดจาก DustBoy ประกอบ</span>
              </p>
            )}
          </div>
        </>
      )}

      {shelters && (
        <div className="flex items-center gap-2 border-t border-[var(--line)] pt-2">
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-[var(--dim)]">
            ศูนย์พักพิงชั่วคราวทางการ {shelters.counts.total} แห่ง ({shelters.source.publisher}) · พิกัดตรงอาคาร {shelters.counts.place} แห่ง ที่เหลือเป็นตำแหน่งโดยประมาณ
          </p>
          <MapButton onClick={() => onShowOnMap({ lat: 18.95, lon: 98.95, amphoeTh: null })} label="ศูนย์พักพิงทั้งหมด" />
        </div>
      )}
    </section>
  );
}
