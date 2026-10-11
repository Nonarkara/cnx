"use client";

// CNX Fire Safety Panel — the governor's #1 priority.
//
// Two sources render side-by-side:
//   - Royal Forest Department (RFD) hotspots — official MODIS/VIIRS
//     detection points from wildfire.forest.go.th/getdb.php, with the
//     Thai forest-tenure classification (DNP / NRF / ALOW / CMF / FIO).
//   - NASA FIRMS — global VIIRS/MODIS — already wired from earlier work.
//
// Plus the AOD (aerosol optical depth) overlay from Open-Meteo CAMS.
//
// Office notice logic: when RFD hotspots inside forest reserves
//   (DNP / NRF) > 5 in last 24 h, escalate to "critical". This is the
//   metric the governor needs at a glance.

import { useMemo, useState } from "react";
import { Flame, Wind, ExternalLink, MapPin, Satellite } from "lucide-react";
import type { CnxFiresResponse } from "../../types/cnx";
import type { RfdFiresResponse } from "../../lib/cnx/fire-rfd";
import type { AerosolResponse } from "../../lib/cnx/aerosol";
import { inChiangMaiProvince } from "../../lib/cnx/province-boundary";
import { useLang } from "../../hooks/useLang";
import { pick, type Lang } from "../../lib/i18n";

type Tab = "rfd" | "firms" | "aerosol";

const TENURE_LABEL: Record<string, { th: string; en: string }> = {
  DNP: { th: "ป่าอนุรักษ์", en: "Conservation" },
  NRF: { th: "ป่าสงวนฯ", en: "National Reserve" },
  ALOW: { th: "ป่าส่วนราชการ", en: "Govt Use" },
  CMF: { th: "ป่าชุมชน", en: "Community Forest" },
  FIO: { th: "อ.อ.ป.", en: "FIO Plantation" },
  SD: { th: "นิคมสร้างตนเอง", en: "Self-help" },
  CP: { th: "นิคมสหกรณ์", en: "Cooperative" },
  DOL: { th: "ที่ น.ส.ล.", en: "Land Docs" },
  TD: { th: "ที่ราชพัสดุ", en: "Crown Land" },
  ALRO: { th: "ส.ป.ก.", en: "ALRO" },
  OTHER: { th: "พื้นที่อื่น ๆ", en: "Other" },
};

const SEVERITY_CLASSES: Record<string, string> = {
  unknown: "bg-[var(--line)] text-[var(--dim)]",
  good: "sev-fill-good",
  watch: "sev-fill-watch",
  alert: "sev-fill-alert",
  critical: "sev-fill-critical",
};

const SEVERITY_LABEL: Record<string, { th: string; en: string }> = {
  unknown: { th: "ไม่ทราบ", en: "UNKNOWN" },
  good: { th: "ปกติ", en: "OK" },
  watch: { th: "เฝ้าระวัง", en: "WATCH" },
  alert: { th: "เตือนภัย", en: "ALERT" },
  critical: { th: "วิกฤต", en: "CRIT" },
};

function severityLabel(s: string, lang: Lang) {
  const label = SEVERITY_LABEL[s];
  return label ? pick(lang, label.th, label.en) : s;
}

interface PanelProps {
  firms: CnxFiresResponse | null;
  rfd: RfdFiresResponse | null;
  aerosol: AerosolResponse | null;
}

export default function CnxFirePanel({ firms, rfd, aerosol }: PanelProps) {
  const [tab, setTab] = useState<Tab>("firms");
  const { t } = useLang();

  return (
    <div className="flex h-full flex-col overflow-hidden border-b border-[var(--line)] bg-[var(--bg-raised)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Flame className="h-3.5 w-3.5 text-[var(--danger)]" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            {t("จุดความร้อนและละอองลอย", "Hotspots and aerosol")}
          </span>
        </div>
        {aerosol && (
          <span
            className={`px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] ${aerosol.level ? SEVERITY_CLASSES[aerosol.level] : "text-[var(--dim)]"}`}
          >
            AOD {aerosol.aod550 ?? "—"}
          </span>
        )}
      </header>

      <div className="flex shrink-0 border-b border-[var(--line)]">
        {(
          [
            { id: "rfd", label: "RFD", count: rfd?.provenance === "live" ? rfd.totalCount : undefined },
            { id: "firms", label: t("FIRMS · 24 ชม.", "FIRMS · 24 h"), count: firms?.provenance === "live" ? (firms.provinceCount ?? firms.totalCount) : undefined },
            { id: "aerosol", label: "AOD", count: undefined },
          ] as const
        ).map((tabDef, i) => (
          <button
            key={tabDef.id}
            aria-pressed={tab === tabDef.id}
            onClick={() => setTab(tabDef.id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1 text-[11px] font-semibold ${
              i < 2 ? "border-r border-[var(--line)]" : ""
            } ${tab === tabDef.id ? "bg-[var(--bg)] text-[var(--ink)]" : "text-[var(--dim)] hover:text-[var(--ink)]"}`}
          >
            {tabDef.id === "rfd" && <Satellite className="h-3 w-3" />}
            {tabDef.id === "firms" && <Flame className="h-3 w-3" />}
            {tabDef.id === "aerosol" && <Wind className="h-3 w-3" />}
            {tabDef.label}
            {typeof tabDef.count === "number" && (
              <span className="font-mono text-[11px] tabular-nums text-[var(--dim)]">{tabDef.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "rfd" && <RfdTab rfd={rfd} />}
        {tab === "firms" && <FirmsTab firms={firms} />}
        {tab === "aerosol" && <AerosolTab aerosol={aerosol} />}
      </div>
    </div>
  );
}

function RfdTab({ rfd }: { rfd: RfdFiresResponse | null }) {
  const { t } = useLang();
  const topTypes = useMemo(() => {
    if (!rfd) return [] as { type: string; count: number }[];
    return Object.entries(rfd.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([type, count]) => ({ type, count }));
  }, [rfd]);
  if (!rfd) return <div className="p-3 text-[11px] text-[var(--dim)]">{t("กำลังโหลดจุดความร้อนกรมป่าไม้…", "Loading RFD hotspots…")}</div>;
  if (rfd.provenance === "unavailable") return <div className="p-3 text-[11px] text-[var(--dim)]">{t("จุดความร้อนกรมป่าไม้: —", "RFD hotspot count: —")}. {rfd.note ?? t("ไม่มีข้อมูล · ไม่ได้แปลว่าไม่มีจุดความร้อน", "Feed unavailable; this does not establish zero hotspots.")}</div>;
  return (
    <div>
      <div className="border-b border-[var(--line)] px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
            {t("จุดความร้อนกรมป่าไม้ (7 วัน)", "RFD hotspots (7 d)")}
          </span>
          <div className="text-right">
            <div className="font-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">{rfd.totalCount}</div>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
              {t("ในป่า", "forest")} {(rfd.forestShare * 100).toFixed(0)}%
            </div>
          </div>
        </div>
        <div className="space-y-1">
          {topTypes.map((tt) => (
            <div key={tt.type} className="flex items-center gap-2">
              <span className="w-[110px] truncate text-[11px] font-semibold text-[var(--ink)]">
                {TENURE_LABEL[tt.type] ? t(TENURE_LABEL[tt.type].th, TENURE_LABEL[tt.type].en) : tt.type}
              </span>
              <div className="relative h-2 flex-1 border border-[var(--line)] bg-[var(--bg)]">
                <div
                  className={`h-full ${
                    tt.type === "DNP" || tt.type === "NRF"
                      ? "bg-[var(--sev-critical)]"
                      : tt.type === "ALOW" || tt.type === "CMF"
                      ? "bg-[var(--sev-alert)]"
                      : "bg-[var(--sev-watch)]"
                  }`}
                  style={{ width: `${Math.min(100, (tt.count / Math.max(1, rfd.totalCount)) * 100)}%` }}
                />
              </div>
              <span className="w-[28px] text-right font-mono text-[11px] tabular-nums text-[var(--ink)]">{tt.count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-3 py-2">
        {rfd.hotspots.length === 0 ? (
          <p className="text-[11px] text-[var(--dim)]">
            {t("ไม่มีจุดความร้อนกรมป่าไม้ในพื้นที่ติดตามช่วง 7 วันที่ผ่านมา (อาจเป็นเพราะบริการต้นทางขัดข้อง หรือจังหวัดอยู่ในช่วงสงบ)", "No RFD hotspots in the CNX bbox for the last 7 days. (Possibly the upstream service is offline or the province is in a quiet period.)")}
          </p>
        ) : (
          <div className="space-y-1">
            {rfd.hotspots.slice(0, 12).map((h, i) => (
              <a
                key={i}
                href={`https://wildfire.forest.go.th/firemap?datestart=${h.yymmdd}&dateend=${h.yymmdd}&province=${encodeURIComponent("เชียงใหม่")}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col border-b border-[var(--line)] py-1 last:border-b-0 hover:bg-[var(--cool-dim)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 truncate text-[11px] font-semibold text-[var(--ink)]">
                    <MapPin className="h-2.5 w-2.5 text-[var(--danger)]" />
                    {h.aumper} · {h.tumbon}
                  </span>
                  <ExternalLink className="h-2.5 w-2.5 shrink-0 text-[var(--dim)]" />
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--dim)]">
                  <span>{h.yymmdd} {h.time}</span>
                  <span>{TENURE_LABEL[h.type] ? t(TENURE_LABEL[h.type].th, TENURE_LABEL[h.type].en) : h.type}</span>
                  <span>{h.confidence}%</span>
                  {h.frp && <span>FRP {h.frp.toFixed(1)} MW</span>}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FirmsTab({ firms }: { firms: CnxFiresResponse | null }) {
  const { lang, t } = useLang();
  if (!firms) return <div className="p-3 text-[12px] text-[var(--dim)]">{t("กำลังอ่านข้อมูลดาวเทียม NASA…", "Reading NASA satellite data…")}</div>;
  if (firms.provenance !== "live") {
    return (
      <div className="p-3 text-[11px] leading-relaxed text-[var(--dim)]">
        {t("ยังไม่มีข้อมูลดาวเทียมปัจจุบันที่ยืนยันได้ จึงไม่แสดงจุดจำลองเป็นเหตุการณ์จริง · ข้อมูลที่ขาดไม่ได้แปลว่าไม่มีไฟ", "No confirmed current satellite data, so no simulated points are shown as real events · missing data does not mean no fire")}
      </div>
    );
  }
  return (
    <div className="px-3 py-2">
      <div className="mb-2 flex items-center justify-between border-b border-[var(--line)] pb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
          {t("จุดตรวจจับ NASA · 24 ชม.", "NASA detections · 24 h")}
        </span>
        <div className="text-right">
          <div className="font-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">{firms.provinceCount ?? firms.totalCount}</div>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
            {t("ในเขตป่า", "forest tenure")} {firms.forestShare === undefined ? t("ไม่ทราบ", "unknown") : `${(firms.forestShare * 100).toFixed(0)}%`}
          </div>
        </div>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-[var(--dim)]">{firms.provinceCount != null ? t(`ในจังหวัดเชียงใหม่ ${firms.provinceCount} จุด · นอกจังหวัดในพื้นที่ติดตาม ${firms.totalCount - firms.provinceCount} จุด`, `${firms.provinceCount} in Chiang Mai province · ${firms.totalCount - firms.provinceCount} outside the province in the watch area`) : t("จุดตรวจจับในพื้นที่ติดตาม · ยังไม่แยกขอบเขตจังหวัด", "Detections in the watch area · not yet split by province boundary")} · {t("ไม่ใช่จำนวนไฟที่ยังลุกไหม้", "not a count of fires still burning")}</p>
      <div className="space-y-1">
        {firms.hotspots.slice(0, 10).map((h) => (
          <div
            key={h.id}
            className="grid grid-cols-[1fr,auto,auto] items-center gap-2 border-b border-[var(--line)] py-1 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-[11px] text-[var(--ink)]">{h.id.slice(0, 14)}</div>
              <p className="text-[11px] text-[var(--dim)]">{inChiangMaiProvince(h.longitude, h.latitude) ? t("ในจังหวัดเชียงใหม่", "Inside Chiang Mai province") : t("นอกจังหวัดเชียงใหม่", "Outside Chiang Mai province")}</p>
              <div className="font-mono text-[11px] text-[var(--dim)]">
                {h.latitude.toFixed(3)}, {h.longitude.toFixed(3)} · {h.satellite}
              </div>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">
              {h.brightness === null ? "\u2014" : `${h.brightness.toFixed(0)}K`}
            </span>
            <span
              className={`px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] ${SEVERITY_CLASSES[h.severity]}`}
            >
              {severityLabel(h.severity, lang)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AerosolTab({ aerosol }: { aerosol: AerosolResponse | null }) {
  const { lang, t } = useLang();
  if (!aerosol) return <div className="p-3 text-[11px] text-[var(--dim)]">{t("กำลังโหลด AOD…", "Loading AOD…")}</div>;
  return (
    <div className="px-3 py-2">
      <div className="mb-3 border-b border-[var(--line)] pb-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
            {t("AOD จากแบบจำลอง CAMS (550 nm)", "CAMS model AOD (550 nm)")}
          </span>
          <span className={`px-2 py-0.5 font-mono text-[11px] ${aerosol.level ? SEVERITY_CLASSES[aerosol.level] : "text-[var(--dim)]"}`}>
            {aerosol.level ? severityLabel(aerosol.level, lang) : t("ไม่มีข้อมูล", "unavailable")}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-mono text-[22px] font-bold tabular-nums text-[var(--ink)]">
            {aerosol.aod550?.toFixed(3) ?? "—"}
          </span>
          <span className="font-mono text-[11px] text-[var(--dim)]">
            {t("ช่วง", "range")} {aerosol.aodMin?.toFixed(3) ?? "—"}–{aerosol.aodMax?.toFixed(3) ?? "—"}
          </span>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-[var(--dim)]">
        {t("ความลึกเชิงแสงของละอองลอย (AOD) ที่ 550 nm จาก Copernicus Atmosphere Monitoring Service (CAMS) ผ่าน Open-Meteo: เป็นจุดกริดของแบบจำลอง ไม่ใช่ค่าเฉลี่ยจังหวัดที่วัดจริง แถบสีบอกละอองลอยทั้งคอลัมน์อากาศเท่านั้น ไม่ได้ยืนยัน PM2.5 ระดับพื้นดินหรือความเสี่ยงสุขภาพ", "Aerosol Optical Depth at 550 nm from Copernicus Atmosphere Monitoring Service (CAMS) on Open-Meteo: sampled model grid points, not a measured province average. Display bands describe column aerosol only; they do not establish surface PM2.5 or health risk.")}
      </p>
      <a
        href="https://air-quality-api.open-meteo.com/"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 text-[11px] text-[var(--cool)] hover:underline"
      >
        <ExternalLink className="h-2.5 w-2.5" />
        {t("แหล่งข้อมูล Open-Meteo CAMS", "Open-Meteo CAMS source")}
      </a>
      <div className="mt-3 text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--dim)]">
        {t("ไทล์ชั้นแผนที่", "Map overlay tile")}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-[var(--dim)]">{aerosol.tileUrl}</div>
    </div>
  );
}
