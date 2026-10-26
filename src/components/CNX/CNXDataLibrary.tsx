"use client";

// CNX Data Workbench — every data.go.th dataset for Chiang Mai, parsed
// into browsable tables. Modelled on Lopburi's /lopburi/data. Rendered by
// both the pop-up (CNXDataLibraryModal) and the standalone /cnx/data page.
//
// One language per mode. Dataset titles and publisher names stay as
// published on data.go.th (Thai); the interface around them follows the
// mode, and domain labels come from the index's own th/en pair.

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { useLang } from "../../hooks/useLang";
import {
  compactCount,
  filterDatasets,
  type LibraryChip,
  type LibraryDatasetSummary,
  type LibraryIndex,
  type LibraryTab,
} from "../../lib/cnx/data-library";
import DataLibraryDetail from "./CNXDataLibraryDetail";

type T = (th: string, en: string | null | undefined) => string;

const CHIPS: { key: LibraryChip; th: string; en: string }[] = [
  { key: "all", th: "ทั้งหมด", en: "All" },
  { key: "location", th: "พร้อมเชิงพื้นที่", en: "Location" },
  { key: "time", th: "มีอนุกรมเวลา", en: "Time series" },
  { key: "numeric", th: "ตัวเลข", en: "Numeric" },
];

function Stat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 text-[13px] leading-snug">
      <span className="font-mono text-[18px] font-bold tabular-nums">{value}</span>
      <span className="font-medium">{label}</span>
      <span className="text-[11px] text-[var(--dim)]">({sub})</span>
    </div>
  );
}

function StatusBadge({ d, t }: { d: LibraryDatasetSummary; t: T }) {
  const map = {
    ready: [t("ตาราง", "table"), "border-[var(--cool)] text-[var(--cool)]"],
    files: [t("ไฟล์เท่านั้น", "files only"), "border-[var(--line)] text-[var(--dim)]"],
    link: [t("ลิงก์เท่านั้น", "links only"), "border-[var(--line)] text-[var(--dim)]"],
  } as const;
  const [label, cls] = map[d.status];
  return <span className={`border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] ${cls}`}>{label}</span>;
}

export default function CNXDataLibrary() {
  const { t } = useLang();
  const [index, setIndex] = useState<LibraryIndex | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<LibraryTab>("ready");
  const [chip, setChip] = useState<LibraryChip>("all");
  const [domain, setDomain] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    const controller = new AbortController();
    void fetchJsonOrNull<LibraryIndex>("/data/cnx/data-library/index.json", { signal: controller.signal }).then((d) => {
      if (controller.signal.aborted) return;
      if (d) setIndex(d);
      else setFailed(true);
    });
    return () => {
      controller.abort();
    };
  }, [attempt]);

  // Search matches both label languages whatever the mode.
  const labels = useMemo(() => Object.fromEntries((index?.domains ?? []).map((d) => [d.key, `${d.th} ${d.en}`])), [index]);
  const domainByKey = useMemo(() => new Map((index?.domains ?? []).map((d) => [d.key, d])), [index]);
  const visible = useMemo(
    () => (index ? filterDatasets(index.datasets, { tab, chip, domain, query }, labels) : []),
    [index, tab, chip, domain, query, labels],
  );
  const tourism = useMemo(
    () => (index?.datasets ?? []).filter((d) => d.domain === "tourism" && d.status === "ready").sort((a, b) => b.rows - a.rows).slice(0, 4),
    [index],
  );

  useEffect(() => setLimit(60), [tab, chip, domain, query]);

  if (failed) {
    return (
      <div role="status" className="p-8 text-[14px] text-[var(--dim)]">
        <p>{t("โหลดแค็ตตาล็อกข้อมูลไม่สำเร็จ ยังไม่มีรายการให้แสดง", "Could not load the data catalogue. No records are available.")}</p>
        <button
          type="button"
          onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}
          className="mt-3 min-h-11 border border-[var(--line)] px-3 text-[var(--cool)]"
        >
          {t("ลองอีกครั้ง", "Retry")}
        </button>
      </div>
    );
  }
  if (!index) {
    return <p className="p-8 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dim)]">{t("กำลังโหลดคลังข้อมูล…", "Loading the data workbench…")}</p>;
  }

  const s = index.stats;
  const maxDomain = Math.max(...index.domains.map((d) => d.datasets), 1);
  const cap = index.previewRowCap.toLocaleString();

  return (
    <div className="mx-auto max-w-[1040px] px-5 py-4">
      {/* ─── Header ───────────────────────────────────────────── */}
      <header>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">{t("คลังข้อมูลเชียงใหม่", "Chiang Mai data library")}</h1>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[12px] text-[var(--dim)]">
          <span>{t(`เตรียมเมื่อ ${index.generatedAt.slice(0, 10)}`, `Prepared ${index.generatedAt.slice(0, 10)}`)}</span>
          <a href="https://data.go.th" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[var(--cool)] underline">{t("ที่มา data.go.th ↗", "Source data.go.th ↗")}</a>
        </p>
      </header>

      {/* ─── Stats ────────────────────────────────────────────── */}
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 border-y border-[var(--line)] py-3">
        <Stat value={String(s.datasets)} label={t("ชุดข้อมูลทั้งหมด", "Datasets")} sub={t(`ไฟล์และลิงก์ ${s.resources.toLocaleString()} รายการ`, `${s.resources.toLocaleString()} files & links`)} />
        <Stat value={String(s.readyDatasets)} label={t("ชุดที่เป็นตารางพร้อมใช้", "Ready as tables")} sub={t(`อ่านแล้ว ${s.tables} ตาราง`, `${s.tables} tables parsed`)} />
        <Stat value={compactCount(s.rows)} label={t("แถวข้อมูลรวม", "Total rows")} sub={t("รวมทุกตาราง", "across all tables")} />
        <Stat value={String(s.spatial)} label={t("มีข้อมูลเชิงพื้นที่", "Spatial")} sub={t("มีพิกัดหรือรูปแปลง", "with coordinates / shapes")} />
        <Stat value={String(s.timeIndexed)} label={t("มีอนุกรมเวลา", "Time series")} sub={t("วัน / เดือน / ปี", "date / month / year")} />
        <Stat value={String(s.numeric)} label={t("วิเคราะห์ตัวเลขได้", "Numeric")} sub={t("พบคอลัมน์ตัวเลข", "numeric fields detected")} />
        <Stat value={String(s.filesOnly)} label={t("เป็นไฟล์เอกสาร/ภาพ", "Documents & images")} sub={t("PDF · ภาพ · shapefile", "PDF · images · shapefiles")} />
        <Stat value={String(s.linkOnly + s.unreadableResources)} label={t("อ่านไม่ได้ — แสดงไว้ตรวจสอบ", "Unreadable — listed")} sub={t("ลิงก์และไฟล์ที่อ่านไม่ได้", "links & unreadable files")} />
      </div>

      {/* ─── List ─────────────────────────────────────────────── */}
      <section className="mt-4" aria-label={t("ค้นหาและกรองชุดข้อมูล", "Search and filter datasets")}>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["ready", t(`ตารางที่เตรียมแล้ว · ${s.readyDatasets}`, `Prepared tables · ${s.readyDatasets}`)],
              ["all", t(`แหล่งข้อมูลทั้งหมด · ${s.datasets}`, `All sources · ${s.datasets}`)],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className={`min-h-11 border px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] ${tab === k ? "border-[var(--cool)] text-[var(--cool)]" : "border-[var(--line)] text-[var(--dim)]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-3 flex min-h-11 items-center gap-2 border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2.5">
          <Search aria-hidden="true" className="h-4 w-4 text-[var(--dim)]" />
          <input
            aria-label={t("ค้นหาชุดข้อมูล หน่วยงาน หรือรูปแบบไฟล์", "Search datasets, publishers or file formats")}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ค้นหาชุดข้อมูล หน่วยงาน หรือรูปแบบไฟล์…", "Search datasets, publishers or file formats…")}
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-[var(--dim)]"
          />
          <span className="font-mono text-[11px] text-[var(--dim)]">{visible.length}</span>
        </label>

        <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span>{t("หมวดข้อมูล", "Data domain")}</span>
          <select aria-label={t("หมวดข้อมูล", "Data domain")} value={domain ?? ""} onChange={event => setDomain(event.target.value || null)} className="min-h-11 max-w-full border border-[var(--line)] bg-[var(--bg-raised)] px-2 text-[13px] text-[var(--ink)]">
            <option value="">{t("ทุกหมวด", "All domains")} ({s.datasets})</option>
            {index.domains.map(d => <option key={d.key} value={d.key}>{t(d.th, d.en)} ({d.datasets})</option>)}
          </select>
        </label>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChip(c.key)}
              aria-pressed={chip === c.key}
              className={`min-h-11 border px-2 py-1 text-[11px] ${chip === c.key ? "border-[var(--cool)] bg-[var(--cool-dim)] font-bold" : "border-[var(--line)] text-[var(--dim)]"}`}
            >
              {t(c.th, c.en)}
            </button>
          ))}
          {domain && (
            <button
              type="button"
              onClick={() => setDomain(null)}
              aria-label={t("ล้างตัวกรองหมวด", "Clear domain filter")}
              className="min-h-11 border border-[var(--cool)] bg-[var(--cool-dim)] px-2 py-1 text-[11px]"
            >
              {(() => {
                const d = domainByKey.get(domain);
                return d ? t(d.th, d.en) : domain;
              })()} ✕
            </button>
          )}
        </div>

        <details className="mt-3 text-[13px]">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold text-[var(--cool)]">{t("ขอบเขตและวิธีเตรียมข้อมูล", "Coverage and preparation")}</summary>
          <div className="max-w-[65ch] space-y-3 pb-3 text-[14px] leading-relaxed">
            <p>{t(
              "ระบบกวาดแค็ตตาล็อก data.go.th ทั้งหมดที่ค้นด้วยคำว่า “เชียงใหม่” ดาวน์โหลดไฟล์ตารางทุกไฟล์ อ่านเป็นตารางมาตรฐาน ตรวจคอลัมน์เชิงพื้นที่ เวลา และตัวเลข แล้วเก็บไฟล์ต้นทางไว้ทุกชุด ข้อมูลที่อ่านไม่ได้ยังแสดงในบัญชีตรวจสอบ ไม่ถูกซ่อน",
              "Every dataset on data.go.th that matches a search for Chiang Mai: table files are downloaded, parsed and typed, with location, time and numeric columns detected; PDFs, shapefiles and web links are listed with their source. Anything that cannot be read stays on the audit list — nothing is dropped silently.",
            )}</p>
            <p>{t(
              `“พร้อมใช้” คือตารางที่อ่านได้จริง ตารางใหญ่แสดงตัวอย่างสูงสุด ${cap} แถว พร้อมจำนวนแถวทั้งหมดและป้ายตัดตอนชัดเจน — ดาวน์โหลดไฟล์เต็มได้จากต้นทางเสมอ`,
              `“Ready” means a table that actually parses. Large tables show a preview of at most ${cap} rows, with the full row count and a clear truncation label — the complete file is always downloadable from the source.`,
            )}</p>
          </div>
        </details>

        <ul className="mt-3 border-t border-[var(--line)]">
          {visible.slice(0, limit).map((d) => {
            const isOpen = open === d.name;
            const dom = domainByKey.get(d.domain);
            return (
              <li key={d.id} className="border-b border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : d.name)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-start justify-between gap-4 px-1 py-3 text-left hover:bg-[var(--bg-surface)] ${isOpen ? "bg-[var(--bg-surface)]" : ""}`}
                >
                  <div className="min-w-0">
                    <div lang="th" className="text-[15px] font-bold leading-snug">{d.title}</div>
                    <div lang="th" className="mt-0.5 text-[12px] text-[var(--dim)]">{d.org}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {dom && <span className="border border-[var(--line)] px-1.5 py-0.5 text-[11px] text-[var(--dim)]">{t(dom.th, dom.en)}</span>}
                      <StatusBadge d={d} t={t} />
                      {d.hasLocation && <span className="border border-[var(--cool)] px-1.5 py-0.5 font-mono text-[11px] uppercase text-[var(--cool)]">{t("พิกัด", "location")}</span>}
                      {d.hasTime && <span className="border border-[var(--line)] px-1.5 py-0.5 font-mono text-[11px] uppercase text-[var(--dim)]">{t("เวลา", "time")}</span>}
                      {d.numericCount > 0 && (
                        <span className="border border-[var(--line)] px-1.5 py-0.5 font-mono text-[11px] uppercase text-[var(--dim)]">
                          {t(`ตัวเลข ${d.numericCount}`, `${d.numericCount} numeric`)}
                        </span>
                      )}
                      {d.formats.slice(0, 5).map((f) => (
                        <span key={f} className="px-1 py-0.5 font-mono text-[11px] uppercase text-[var(--dim)]">{f}</span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--dim)]">
                    {d.tableCount > 0 ? (
                      <>
                        <div>{t(`${d.rows.toLocaleString()} แถว`, `${d.rows.toLocaleString()} rows`)}</div>
                        <div>{t(`${d.fields} คอลัมน์`, `${d.fields} fields`)}</div>
                      </>
                    ) : (
                      <div>{t(`${d.resourceCount} ไฟล์`, `${d.resourceCount} files`)}</div>
                    )}
                  </div>
                </button>
                {isOpen && <DataLibraryDetail name={d.name} />}
              </li>
            );
          })}
        </ul>
        {visible.length === 0 && (
          <p className="py-8 text-center text-[13px] text-[var(--dim)]">{t("ไม่พบชุดข้อมูลที่ตรงกับเงื่อนไข", "No datasets match these filters.")}</p>
        )}
        {visible.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + 60)}
            className="mt-3 border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] hover:border-[var(--cool)]"
          >
            {t("แสดงเพิ่ม", "Show more")} ({limit} / {visible.length})
          </button>
        )}
      </section>
      <details className="mt-6 border-t border-[var(--line)]">
        <summary className="min-h-11 cursor-pointer py-3 text-[14px] font-semibold text-[var(--cool)]">{t("สำรวจหมวดข้อมูลและชุดข้อมูลท่องเที่ยว", "Browse domains and tourism datasets")}</summary>
      {/* ─── Tourism spotlight ────────────────────────────────── */}
      {tourism.length > 0 && (
        <section className="mt-8 border border-[var(--cool)] bg-[var(--cool-dim)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[15px] font-bold">
              {t("สถิติการท่องเที่ยวเชียงใหม่ (ข้อมูลทางการ)", "Chiang Mai tourism statistics (official data)")}
            </div>
            <button
              type="button"
              onClick={() => {
                setDomain("tourism");
                setTab("ready");
              }}
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--cool)] hover:underline"
            >
              {t(
                `ชุดข้อมูลท่องเที่ยวทั้งหมด ${domainByKey.get("tourism")?.datasets ?? tourism.length} ชุด →`,
                `All ${domainByKey.get("tourism")?.datasets ?? tourism.length} tourism datasets →`,
              )}
            </button>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {tourism.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDomain("tourism");
                    setTab("ready");
                    setOpen(d.name);
                  }}
                  className="w-full border border-[var(--line)] bg-[var(--bg-raised)] p-3 text-left hover:border-[var(--cool)]"
                >
                  <div lang="th" className="text-[13px] font-bold leading-snug">{d.title}</div>
                  <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">
                    {t(
                      `${d.rows.toLocaleString()} แถว · ${d.fields} คอลัมน์${d.hasTime ? " · อนุกรมเวลา" : ""}`,
                      `${d.rows.toLocaleString()} rows · ${d.fields} fields${d.hasTime ? " · time series" : ""}`,
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Domains ──────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">{t("หมวดข้อมูล", "Data domains")}</div>
        <div className="mt-2 border border-[var(--line)]">
          <button
            type="button"
            onClick={() => setDomain(null)}
            aria-pressed={domain === null}
            className={`flex w-full items-baseline justify-between px-3 py-2 text-left ${domain === null ? "bg-[var(--cool-dim)] font-bold" : "hover:bg-[var(--bg-surface)]"}`}
          >
            <span className="text-[14px]">{t("ทุกหมวด", "All domains")}</span>
            <span className="font-mono text-[12px]">{s.datasets}</span>
          </button>
          {index.domains.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDomain(domain === d.key ? null : d.key)}
              aria-pressed={domain === d.key}
              className={`block w-full border-t border-[var(--line)] px-3 py-2 text-left ${domain === d.key ? "bg-[var(--cool-dim)]" : "hover:bg-[var(--bg-surface)]"}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-bold">{t(d.th, d.en)}</span>
                <span className="font-mono text-[12px] text-[var(--dim)]">{d.datasets}</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-[var(--line)]">
                <div className="h-full bg-[var(--cool)]" style={{ width: `${(d.datasets / maxDomain) * 100}%` }} />
              </div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--dim)]">
                {t(`${compactCount(d.rows)} แถว · เชิงพื้นที่ ${d.spatial}`, `${compactCount(d.rows)} rows · ${d.spatial} spatial`)}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--dim)]">
          {t(
            "การจัดหมวดอัตโนมัติจากชื่อ คำอธิบาย และหน่วยงานต้นทาง — ตรวจสอบกับ data.go.th ได้ทุกชุด",
            "Domains are assigned automatically from title, description and publisher — every dataset can be checked against data.go.th.",
          )}
        </p>
      </section>

      </details>
    </div>
  );
}
