"use client";

// "48 ชั่วโมงข้างหน้า" — the forecast answer first: which districts the
// model expects heavy rain or bad air in, when it peaks, what to do, and the
// official shelters to send people to. Evidence (each shelter's capacity,
// utilities and how precisely it is mapped) waits behind a disclosure.

import type { ProvinceOutlook, RainOutlook, AirOutlook, OutlookLevel } from "../../lib/cnx/outlook";
import { airActionEn, airActionTh, outlookTime, outlookTimeEn, rainActionEn, rainActionTh } from "../../lib/cnx/outlook";
import { precisionLabel, type SheltersFile } from "../../lib/cnx/shelters";
import { useLang } from "../../hooks/useLang";

const LEVEL_LABEL: Record<OutlookLevel, [string, string]> = { watch: ["เฝ้าระวัง", "Watch"], alert: ["เตือนภัย", "Warning"], critical: ["วิกฤต", "Critical"] };
const LEVEL_CLASS: Record<OutlookLevel, string> = {
  watch: "sev-fill-watch",
  alert: "sev-fill-alert",
  critical: "sev-fill-critical",
};

interface Props {
  outlook: ProvinceOutlook;
  shelters: SheltersFile | null;
  /** Fly the map to a district and show its shelters. */
  onShowOnMap: (target: { lat: number; lon: number; amphoeTh: string | null }) => void;
}

function Chip({ level }: { level: OutlookLevel }) {
  const { t } = useLang();
  return <span className={`shrink-0 px-1.5 py-0.5 text-[11px] font-bold ${LEVEL_CLASS[level]}`}>{t(...LEVEL_LABEL[level])}</span>;
}

function MapButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 shrink-0 border border-[var(--line)] px-3 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--cool-dim)]">
      {label}
    </button>
  );
}

function RainRow({ r, onShowOnMap }: { r: RainOutlook; onShowOnMap: Props["onShowOnMap"] }) {
  const { t } = useLang();
  const d = r.district;
  const rain24 = d.rain24h.toFixed(0);
  const shelterCount = r.shelters.length;
  return (
    <li className="border-t border-[var(--line)] py-2.5 first:border-t-0">
      <div className="flex items-start gap-2">
        <Chip level={r.level} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">
            {t(`อ.${d.nameTh} · ฝน ${rain24} มม. ใน 24 ชม.`, `${d.nameEn} · ${rain24} mm of rain in 24 h`)}
          </p>
          <p className="text-[12px] text-[var(--dim)]">
            {t(`หนักสุด ${d.peakRainMmH.toFixed(1)} มม./ชม. ช่วง ${outlookTime(d.peakRainAt)}`, `Peak ${d.peakRainMmH.toFixed(1)} mm/h around ${outlookTimeEn(d.peakRainAt)}`)}
            {r.measured24h !== null && t(` · วัดได้แล้ว ${r.measured24h.toFixed(1)} มม. ใน 24 ชม.ที่ผ่านมา`, ` · ${r.measured24h.toFixed(1)} mm measured in the past 24 h`)}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-[var(--ink)]">▸ {t(rainActionTh(r), rainActionEn(r))}</p>
          {shelterCount > 0 && (
            <details className="mt-1 text-[12px]">
              <summary className="min-h-9 cursor-pointer py-1 font-semibold text-[var(--cool)]">{t(`ศูนย์พักพิง ${shelterCount} แห่งใน อ.${d.nameTh}`, `${shelterCount} ${shelterCount === 1 ? "shelter" : "shelters"} in ${d.nameEn}`)}</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {r.shelters.map((s) => (
                  <li key={s.id} className="leading-snug">
                    {/* Shelter and subdistrict names exist only in Thai in the official list. */}
                    <span lang="th" className="font-semibold">{s.nameTh}</span>
                    {s.tambonTh && <span className="text-[var(--dim)]"> · {t(`ต.${s.tambonTh}`, `Tambon ${s.tambonTh}`)}</span>}
                    <span className="block text-[var(--dim)]">
                      {t(
                        `รับได้ ${s.capacity?.toLocaleString("th-TH") ?? "ไม่ระบุ"} คน · ห้องน้ำ ${s.toilets ?? "ไม่ระบุ"} · ${precisionLabel[s.precision].th}`,
                        `Holds ${s.capacity?.toLocaleString("en-GB") ?? "not stated"} people · Toilets ${s.toilets ?? "not stated"} · ${precisionLabel[s.precision].en}`,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <MapButton onClick={() => onShowOnMap({ ...r.point, amphoeTh: d.nameTh })} label={t("ดูบนแผนที่", "Show on map")} />
      </div>
    </li>
  );
}

function AirRow({ a, onShowOnMap }: { a: AirOutlook; onShowOnMap: Props["onShowOnMap"] }) {
  const { t } = useLang();
  return (
    <li className="border-t border-[var(--line)] py-2.5 first:border-t-0">
      <div className="flex items-start gap-2">
        <Chip level={a.level} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{t(`อ.${a.district.nameTh} · PM2.5 สูงสุด ${a.peak} µg/m³`, `${a.district.nameEn} · PM2.5 peak ${a.peak} µg/m³`)}</p>
          <p className="text-[12px] text-[var(--dim)]">{t(`ช่วง ${outlookTime(a.peakAt)} · แบบจำลอง CAMS`, `Around ${outlookTimeEn(a.peakAt)} · CAMS model`)}</p>
          <p className="mt-1 text-[13px] leading-snug text-[var(--ink)]">▸ {t(airActionTh(a), airActionEn(a))}</p>
        </div>
        <MapButton onClick={() => onShowOnMap({ ...a.point, amphoeTh: null })} label={t("ดูบนแผนที่", "Show on map")} />
      </div>
    </li>
  );
}

export default function CnxOutlookPanel({ outlook, shelters, onShowOnMap }: Props) {
  const { lang, t } = useLang();
  const fetchedAgo = outlook.fetchedAt ? Math.max(0, Math.round((Date.now() - Date.parse(outlook.fetchedAt)) / 3_600_000)) : null;
  const wettest = outlook.wettest;
  const dirtiest = outlook.dirtiest;
  return (
    <section lang={lang} aria-labelledby="outlook-48h" className="flex flex-col gap-3 border-b border-[var(--line)] p-3">
      <header className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="outlook-48h" className="text-[16px] font-bold">{t("48 ชั่วโมงข้างหน้า", "Next 48 hours")}</h2>
        <span className="text-[12px] text-[var(--dim)]">
          {t(
            `พยากรณ์จากแบบจำลอง ไม่ใช่ค่าวัด${fetchedAgo !== null ? ` · ดึงเมื่อ ${fetchedAgo} ชม.ก่อน` : ""}`,
            `Model forecast, not a measurement${fetchedAgo !== null ? ` · fetched ${fetchedAgo} h ago` : ""}`,
          )}
        </span>
      </header>

      {!outlook.available ? (
        <p className="text-[13px] text-[var(--dim)]">{t("ยังไม่มีข้อมูลพยากรณ์ — แบบจำลองไม่ตอบ ซึ่งไม่ใช่การพยากรณ์ว่าปลอดภัย", "No forecast yet — the model did not answer, which is not a forecast that all is safe.")}</p>
      ) : (
        <>
          <div>
            <h3 className="text-[13px] font-bold text-[var(--dim)]">{t("ฝนและน้ำป่า", "Rain and flash floods")}</h3>
            {outlook.rain.length ? (
              <ul>{outlook.rain.map((r) => <RainRow key={r.district.nameTh} r={r} onShowOnMap={onShowOnMap} />)}</ul>
            ) : (
              <p className="mt-1 text-[13px] leading-snug">
                {t("ไม่มีอำเภอที่แบบจำลองคาดฝนหนัก (≥35 มม./24 ชม.)", "No district is forecast heavy rain (≥35 mm/24 h)")}
                {wettest && t(` · มากสุด อ.${wettest.nameTh} ${wettest.rain24h.toFixed(0)} มม.`, ` · wettest: ${wettest.nameEn} ${wettest.rain24h.toFixed(0)} mm`)}
                <span className="block text-[12px] text-[var(--dim)]">{t("ไม่ใช่การยืนยันว่าไม่มีพายุเฉพาะจุด — ฝนที่วัดได้จริงและระดับน้ำยังเป็นหลัก", "Not a guarantee against a local storm — measured rain and river levels still come first.")}</span>
              </p>
            )}
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-[var(--dim)]">{t("ฝุ่นควัน PM2.5", "Smoke and PM2.5")}</h3>
            {!outlook.hasPm25 ? (
              <p className="mt-1 text-[13px] text-[var(--dim)]">{t("แบบจำลองฝุ่น CAMS ไม่ตอบ — ไม่มีพยากรณ์ฝุ่นในรอบนี้", "The CAMS smoke model did not answer — no PM2.5 forecast this cycle.")}</p>
            ) : outlook.air.length ? (
              <ul>{outlook.air.slice(0, 4).map((a) => <AirRow key={a.district.nameTh} a={a} onShowOnMap={onShowOnMap} />)}</ul>
            ) : (
              <p className="mt-1 text-[13px] leading-snug">
                {t("ไม่คาดว่า PM2.5 จะเกิน 25 µg/m³ ในอำเภอใด", "No district is forecast above 25 µg/m³ PM2.5")}
                {dirtiest?.pm25Peak != null && t(` · สูงสุด อ.${dirtiest.nameTh} ${dirtiest.pm25Peak} µg/m³`, ` · highest: ${dirtiest.nameEn} ${dirtiest.pm25Peak} µg/m³`)}
                <span className="block text-[12px] text-[var(--dim)]">{t("แบบจำลองมักประเมินควันในหุบเขาต่ำไป — ดูค่าวัดจาก DustBoy ประกอบ", "The model tends to under-read valley smoke — read it with DustBoy measurements.")}</span>
              </p>
            )}
          </div>
        </>
      )}

      {shelters && (
        <div className="flex items-center gap-2 border-t border-[var(--line)] pt-2">
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-[var(--dim)]">
            {t(
              `ศูนย์พักพิงชั่วคราวทางการ ${shelters.counts.total} แห่ง (${shelters.source.publisher}) · พิกัดตรงอาคาร ${shelters.counts.place + (shelters.counts.official ?? 0)} แห่ง ที่เหลือเป็นตำแหน่งโดยประมาณ`,
              `${shelters.counts.total} official temporary shelters (${shelters.source.publisher}) · ${shelters.counts.place + (shelters.counts.official ?? 0)} mapped to the building, the rest approximate`,
            )}
          </p>
          <MapButton onClick={() => onShowOnMap({ lat: 18.95, lon: 98.95, amphoeTh: null })} label={t("ศูนย์พักพิงทั้งหมด", "All shelters")} />
        </div>
      )}
    </section>
  );
}
