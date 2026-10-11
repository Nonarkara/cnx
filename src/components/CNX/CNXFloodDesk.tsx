"use client";

// The flood desk: answer first, evidence after, every part with its own
// source and age. Presentational only — CNXFloodPanel fetches the parts.
//
//   1. Drill banner (only on ?scenario=<id>) — the scenario is never shown
//      without "ซ้อมแผน / DRILL" above it, and its rows say "simulated".
//   2. The answer: one headline (worst signal, or "incomplete" when a part
//      is missing), then one line per part — rivers, dams, measured rain,
//      forecast rain, Flood Hub. An unavailable part is a line that says so,
//      with its reason; it is never dropped and never painted calm.
//   3. Evidence lists for the parts that answered.
//
// "Below threshold" is never green. A green chip on a flood desk reads as an
// all-clear, and nothing on this desk can certify one.

import type { ReactNode } from "react";
import { useLang } from "../../hooks/useLang";
import {
  ageText,
  bankPhrase,
  buildDeskAnswer,
  gaugeName,
  gradable,
  tightestFirst,
  type DeskInputs,
  type DeskLine,
} from "../../lib/cnx/flood-desk";
import { isCurrentGaugeReading } from "../../lib/cnx/verdict";
import { currentRainSummary, RAIN_BAND_TH } from "../../lib/cnx/rain-core";
import { DAM_BAND_EN, DAM_BAND_TH, type DamStation } from "../../lib/cnx/dam-core";
import { outlookTime, outlookTimeEn } from "../../lib/cnx/outlook";
import type { CnxFloodResponse, SeverityLevel } from "../../types/cnx";

type T = (th: string, en: string | null | undefined) => string;

const CHIP: Record<SeverityLevel, string> = {
  critical: "sev-fill-critical",
  alert: "sev-fill-alert",
  watch: "sev-fill-watch",
  good: "border border-[var(--line)] text-[var(--ink)]",
  unknown: "border border-[var(--line)] text-status-unknown",
};

function levelLabel(t: T, level: SeverityLevel): string {
  return {
    critical: t("วิกฤต", "Critical"),
    alert: t("เตือนภัย", "Alert"),
    watch: t("เฝ้าระวัง", "Watch"),
    good: t("ไม่ถึงเกณฑ์", "Below threshold"),
    unknown: t("ประเมินไม่ได้", "Not graded"),
  }[level];
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`shrink-0 px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] ${className}`}>{children}</span>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">{children}</div>;
}

export interface FloodDeskProps extends DeskInputs {
  flood: CnxFloodResponse | null;
  nowMs: number;
}

export function FloodDesk(props: FloodDeskProps) {
  const { t, lang } = useLang();
  const answer = buildDeskAnswer(props, props.nowMs);
  const isDrill = props.flood?.provenance === "scenario";
  return (
    <div>
      {isDrill && props.flood && <DrillBlock flood={props.flood} t={t} />}

      <section aria-label={t("คำตอบ", "Answer")} className="border-b border-[var(--line)] px-3 py-3">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--dim)]">
            {isDrill ? t("ข้อมูลจริง ณ ตอนนี้", "Live, right now") : t("น้ำท่วม ณ ตอนนี้", "Flood picture, now")}
          </span>
          <Chip className={CHIP[answer.level]}>
            {answer.level === "good" ? t("ไม่พบสัญญาณ", "No signal") : answer.level === "unknown" ? t("ไม่ครบ", "Incomplete") : levelLabel(t, answer.level)}
          </Chip>
        </div>
        <p className="text-[13px] font-semibold leading-snug text-[var(--ink)]">{t(answer.th, answer.en)}</p>
      </section>

      <ul className="border-b border-[var(--line)]">
        {answer.lines.map((line) => (
          <DeskRow key={line.key} line={line} nowMs={props.nowMs} t={t} lang={lang} />
        ))}
      </ul>

      <Evidence {...props} t={t} lang={lang} />
    </div>
  );
}

function DeskRow({ line, nowMs, t, lang }: { line: DeskLine; nowMs: number; t: T; lang: "th" | "en" }) {
  const age = line.status === "ok" ? ageText(line, nowMs, lang) : null;
  const kind = { measured: t("วัดจริง", "Measured"), report: t("รายงาน", "Report"), model: t("แบบจำลอง", "Model") }[line.kind];
  const chip =
    line.status === "unavailable" ? <Chip className="sev-fill-unknown">{t("ไม่มีข้อมูล", "Unavailable")}</Chip>
    : line.status === "loading" ? <Chip className={CHIP.unknown}>{t("กำลังโหลด", "Loading")}</Chip>
    : <Chip className={CHIP[line.level]}>{levelLabel(t, line.level)}</Chip>;
  return (
    <li data-line={line.key} data-status={line.status} className="border-b border-[var(--line)] px-3 py-2 last:border-b-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-semibold text-[var(--ink)]">{t(line.titleTh, line.titleEn)}</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">{kind}</span>
        <span className="flex-1" />
        {chip}
      </div>
      <p className={`mt-0.5 text-[12px] leading-snug ${line.status === "ok" ? "text-[var(--ink)]" : "text-[var(--dim)]"}`}>{t(line.th, line.en)}</p>
      <p className="mt-0.5 font-mono text-[11px] text-[var(--dim)]">
        {t(line.sourceTh, line.sourceEn)}
        {age && <span className={age.stale ? "text-status-watch" : ""}> · {age.text}</span>}
      </p>
    </li>
  );
}

function DrillBlock({ flood, t }: { flood: CnxFloodResponse; t: T }) {
  const label = flood.drill ?? { th: "ซ้อมแผน — ข้อมูลจำลอง", en: "DRILL — simulated data" };
  const sim = t("จำลอง", "Simulated");
  return (
    <section aria-label={t(label.th, label.en)} className="border-b-2 border-[var(--sev-watch)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip className="sev-fill-watch">{t(label.th, label.en)}</Chip>
        {flood.drill?.id && <span className="font-mono text-[11px] text-[var(--dim)]">{flood.drill.id}</span>}
      </div>
      {flood.provenanceNote && <p className="mt-1 text-[12px] leading-snug text-[var(--ink)]">{t(flood.provenanceNote.th, flood.provenanceNote.en)}</p>}
      <ul className="mt-1.5">
        {flood.gauges.map((g) => (
          <li key={g.stationId} className="flex items-center gap-2 border-b border-[var(--line)] py-1 last:border-b-0">
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">{g.name} · {g.stationId}</span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{g.levelM.toFixed(2)}{g.bankFullM ? ` / ${g.bankFullM.toFixed(2)} m` : " m"}</span>
            <Chip className={CHIP.unknown}>{sim}</Chip>
          </li>
        ))}
        {flood.reservoirs.map((r) => (
          <li key={r.damId} className="flex items-center gap-2 border-b border-[var(--line)] py-1 last:border-b-0">
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">{r.name}</span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{Math.round(r.fillFraction * 100)}%</span>
            <Chip className={CHIP.unknown}>{sim}</Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Evidence(props: FloodDeskProps & { t: T; lang: "th" | "en" }) {
  const { t, lang, nowMs } = props;
  const river = props.river.status === "ok" && props.river.data.provenance === "live"
    ? props.river.data.gauges.filter((g) => isCurrentGaugeReading(g.observedAt, nowMs))
    : [];
  const graded = river.filter(gradable).sort(tightestFirst).slice(0, 6);
  const ungraded = river.filter((g) => !gradable(g)).length;
  const dams = props.dams.status === "ok" && props.dams.data.provenance === "live" ? props.dams.data : null;
  const mediumFull = dams ? dams.medium.filter((m) => m.band === "over" || m.band === "near-full").slice(0, 6) : [];
  const rain = props.rain.status === "ok" ? currentRainSummary(props.rain.data, nowMs) : null;
  const forecast = props.outlook?.available ? props.outlook.rain.slice(0, 5) : [];

  return (
    <div>
      {graded.length > 0 && (
        <section className="border-b border-[var(--line)] px-3 py-2">
          <SectionTitle>{t("สถานีใกล้ตลิ่งที่สุด", "Gauges closest to their bank")}</SectionTitle>
          <ul>
            {graded.map((g) => {
              const name = gaugeName(g);
              const bank = bankPhrase(g);
              return (
                <li key={g.id} className="flex items-center gap-2 border-b border-[var(--line)] py-1 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{t(name.th, name.en)}</div>
                    <div className="font-mono text-[11px] text-[var(--dim)]">{t(bank.th, bank.en)}</div>
                  </div>
                  <Chip className={CHIP[g.severity]}>{levelLabel(t, g.severity)}</Chip>
                </li>
              );
            })}
          </ul>
          {ungraded > 0 && (
            <p className="mt-1 text-[11px] text-[var(--dim)]">
              {t(`อีก ${ungraded} สถานีไม่มีข้อมูลตลิ่ง — ประเมินไม่ได้ ไม่ใช่ปลอดภัย`, `${ungraded} more gauges publish no bank data — not graded, not safe`)}
            </p>
          )}
        </section>
      )}

      {dams && dams.large.length > 0 && (
        <section className="border-b border-[var(--line)] px-3 py-2">
          <SectionTitle>{t("เขื่อนลุ่มน้ำปิง · % ของระดับเก็บกักปกติ", "Ping-basin dams · % of normal storage")}</SectionTitle>
          <ul className="space-y-1.5">
            {dams.large.map((d) => <DamRowView key={d.id} d={d} t={t} />)}
          </ul>
          {mediumFull.length > 0 && (
            <>
              <div className="mb-1 mt-2 text-[11px] font-semibold text-[var(--dim)]">{t("อ่างขนาดกลางใกล้/เกินระดับเก็บกัก", "Medium reservoirs near or above normal storage")}</div>
              <ul>
                {mediumFull.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 py-0.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">{d.nameTh}{d.amphoeTh ? ` · ${t(`อ.${d.amphoeTh}`, d.amphoeTh)}` : ""}</span>
                    <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{d.pctNormal === null ? "—" : `${d.pctNormal.toFixed(0)}%`}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {rain && rain.districts.length > 0 && (
        <section className="border-b border-[var(--line)] px-3 py-2">
          <SectionTitle>{t("อำเภอที่วัดฝนหนักได้ 24 ชม.", "Districts with heavy measured rain, 24 h")}</SectionTitle>
          <ul>
            {rain.districts.slice(0, 5).map((d) => (
              <li key={d.th} className="flex items-center gap-2 py-0.5">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">{t(`อ.${d.th}`, d.en || d.th)}</span>
                <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{d.max.toFixed(1)} {t("มม.", "mm")}</span>
                <Chip className={d.band === "very-heavy" ? CHIP.alert : CHIP.watch}>{t(RAIN_BAND_TH[d.band], d.band === "very-heavy" ? "Very heavy" : "Heavy")}</Chip>
              </li>
            ))}
          </ul>
        </section>
      )}

      {forecast.length > 0 && (
        <section className="border-b border-[var(--line)] px-3 py-2">
          <SectionTitle>{t("อำเภอที่คาดฝนหนัก 24 ชม. (แบบจำลอง)", "Districts forecast heavy rain, 24 h (model)")}</SectionTitle>
          <ul>
            {forecast.map((r) => (
              <li key={r.district.nameTh} className="flex items-center gap-2 py-0.5">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink)]">{t(`อ.${r.district.nameTh}`, r.district.nameEn)}</span>
                <span className="font-mono text-[11px] tabular-nums text-[var(--dim)]">{lang === "th" ? outlookTime(r.district.peakRainAt) : outlookTimeEn(r.district.peakRainAt)}</span>
                <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{r.district.rain24h.toFixed(0)} {t("มม.", "mm")}</span>
                <Chip className={CHIP[r.level]}>{levelLabel(t, r.level)}</Chip>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DamRowView({ d, t }: { d: DamStation; t: T }) {
  const fill = d.pctNormal === null ? null : Math.min(100, d.pctNormal);
  const bar = d.severity === "alert" ? "bg-[var(--sev-alert)]" : d.severity === "watch" ? "bg-[var(--sev-watch)]" : "bg-[var(--dim)]";
  const flows = `${t("ไหลเข้า", "in")} ${d.inflowMcm ?? "—"} · ${t("ระบาย", "out")} ${d.releaseMcm ?? "—"} ${t("ล้าน ลบ.ม./วัน", "MCM/day")}`;
  return (
    <li>
      <div className="flex items-center gap-2">
        <span className="w-[120px] shrink-0 truncate text-[12px] font-semibold text-[var(--ink)]">{t(d.nameTh, d.nameEn || d.nameTh)}</span>
        <div className="relative h-2 flex-1 border border-[var(--line)] bg-[var(--bg)]" role="img" aria-label={fill === null ? t("ไม่ทราบ", "Unknown") : `${d.pctNormal}%`}>
          {fill !== null && <div className={`h-full ${bar}`} style={{ width: `${fill}%` }} />}
        </div>
        <span className="w-[44px] text-right font-mono text-[11px] tabular-nums text-[var(--ink)]">{d.pctNormal === null ? "—" : `${d.pctNormal.toFixed(0)}%`}</span>
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-[var(--dim)]">
        {t(DAM_BAND_TH[d.band], DAM_BAND_EN[d.band])} · {flows}{d.spilling ? ` · ${t("ระบายทางน้ำล้น", "spilling")}` : ""}
      </div>
    </li>
  );
}
