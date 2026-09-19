"use client";

// CNX Data Workbench — every data.go.th dataset for Chiang Mai, parsed
// into browsable tables. Modelled on Lopburi's /lopburi/data. Rendered by
// both the pop-up (CNXDataLibraryModal) and the standalone /cnx/data page.

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import {
  compactCount,
  filterDatasets,
  type LibraryChip,
  type LibraryDatasetSummary,
  type LibraryIndex,
  type LibraryTab,
} from "../../lib/cnx/data-library";
import DataLibraryDetail from "./CNXDataLibraryDetail";

const CHIPS: { key: LibraryChip; th: string; en: string }[] = [
  { key: "all", th: "ทั้งหมด", en: "All" },
  { key: "location", th: "พร้อมเชิงพื้นที่", en: "Location" },
  { key: "time", th: "มีอนุกรมเวลา", en: "Time" },
  { key: "numeric", th: "ตัวเลข", en: "Numeric" },
];

function Stat({ value, th, en }: { value: string; th: string; en: string }) {
  return (
    <div className="border-b border-r border-[var(--line)] p-4">
      <div className="text-[30px] font-black leading-none tracking-[-0.02em]">{value}</div>
      <div lang="th" className="mt-1.5 text-[13px] font-bold">{th}</div>
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--dim)]">{en}</div>
    </div>
  );
}

function StatusBadge({ d }: { d: LibraryDatasetSummary }) {
  const map = {
    ready: ["table", "border-[var(--cool)] text-[var(--cool)]"],
    files: ["files only", "border-[var(--line)] text-[var(--dim)]"],
    link: ["links only", "border-[var(--line)] text-[var(--dim)]"],
  } as const;
  const [label, cls] = map[d.status];
  return <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${cls}`}>{label}</span>;
}

export default function CNXDataLibrary() {
  const [index, setIndex] = useState<LibraryIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<LibraryTab>("ready");
  const [chip, setChip] = useState<LibraryChip>("all");
  const [domain, setDomain] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    let cancelled = false;
    void fetchJsonOrNull<LibraryIndex>("/data/cnx/data-library/index.json").then((d) => {
      if (cancelled) return;
      if (d) setIndex(d);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (failed) return <p className="p-8 text-[14px] text-[var(--danger)]">Could not load the data catalog.</p>;
  if (!index) return <p className="p-8 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dim)]">Loading the data workbench…</p>;

  const s = index.stats;
  const maxDomain = Math.max(...index.domains.map((d) => d.datasets), 1);

  return (
    <div className="mx-auto max-w-[1040px] px-5 py-8">
      {/* ─── Header ───────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--cool)]">
            Provincial data workbench · Chiang Mai
          </div>
          <h1 lang="th" className="mt-2 text-[34px] font-black leading-[1.15] tracking-[-0.02em]">
            ข้อมูลเปิดของเชียงใหม่ทุกชุด ค้นได้ ตรวจได้ ใช้ต่อได้
          </h1>
          <p lang="th" className="mt-3 max-w-[64ch] text-[14px] leading-[1.75]">
            ระบบกวาดแค็ตตาล็อก data.go.th ทั้งหมดที่ค้นด้วยคำว่า “เชียงใหม่” ดาวน์โหลดไฟล์ตารางทุกไฟล์ อ่านเป็นตารางมาตรฐาน ตรวจคอลัมน์เชิงพื้นที่ เวลา และตัวเลข แล้วเก็บไฟล์ต้นทางไว้ทุกชุด ข้อมูลที่อ่านไม่ได้ยังแสดงในบัญชีตรวจสอบ ไม่ถูกซ่อน
          </p>
          <p className="mt-2 max-w-[64ch] text-[12px] leading-[1.7] text-[var(--dim)]">
            Every dataset on data.go.th matching &ldquo;เชียงใหม่&rdquo;: tables are downloaded, parsed and typed; PDFs, shapefiles and web links are listed with their source. Nothing is dropped silently.
          </p>
        </div>
        <aside className="self-start border border-[var(--line)] bg-[var(--bg-raised)] p-4">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">Preparation rule</div>
          <p lang="th" className="mt-2 text-[12px] leading-[1.7]">
            “พร้อมใช้” คือตารางที่อ่านได้จริง ตารางใหญ่แสดงตัวอย่างสูงสุด {index.previewRowCap.toLocaleString()} แถว พร้อมจำนวนแถวทั้งหมดและป้ายตัดตอนชัดเจน — ดาวน์โหลดไฟล์เต็มได้จากต้นทางเสมอ
          </p>
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--dim)]">
            Prepared {index.generatedAt.slice(0, 10)} · source data.go.th
          </p>
        </aside>
      </div>

      {/* ─── Stats ────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 border-l border-t border-[var(--line)] lg:grid-cols-4">
        <Stat value={String(s.datasets)} th="ชุดข้อมูลทั้งหมด" en={`${s.resources.toLocaleString()} files & links`} />
        <Stat value={String(s.readyDatasets)} th="ชุดที่เป็นตารางพร้อมใช้" en={`${s.tables} tables parsed`} />
        <Stat value={compactCount(s.rows)} th="แถวข้อมูลรวม" en="rows across all tables" />
        <Stat value={String(s.spatial)} th="มีข้อมูลเชิงพื้นที่" en="with coordinates / shapes" />
        <Stat value={String(s.timeIndexed)} th="มีอนุกรมเวลา" en="date / month / year" />
        <Stat value={String(s.numeric)} th="วิเคราะห์ตัวเลขได้" en="numeric fields detected" />
        <Stat value={String(s.filesOnly)} th="เป็นไฟล์เอกสาร/ภาพ" en="PDF · images · shapefiles" />
        <Stat value={String(s.linkOnly + s.unreadableResources)} th="อ่านไม่ได้ — แสดงไว้ตรวจสอบ" en="links & unreadable, listed" />
      </div>

      {/* ─── Tourism spotlight ────────────────────────────────── */}
      {tourism.length > 0 && (
        <section className="mt-8 border border-[var(--sun)] bg-[var(--sun-dim)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">Tourism statistics</div>
              <div lang="th" className="text-[15px] font-bold">สถิติการท่องเที่ยวเชียงใหม่ (ข้อมูลทางการ)</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDomain("tourism");
                setTab("ready");
              }}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--cool)] hover:underline"
            >
              All {domainByKey.get("tourism")?.datasets ?? tourism.length} tourism datasets →
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
                  <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--dim)]">
                    {d.rows.toLocaleString()} rows · {d.fields} fields{d.hasTime ? " · time series" : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Domains ──────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">Data domains</div>
        <div className="mt-2 border border-[var(--line)]">
          <button
            type="button"
            onClick={() => setDomain(null)}
            aria-pressed={domain === null}
            className={`flex w-full items-baseline justify-between px-3 py-2 text-left ${domain === null ? "bg-[var(--cool-dim)] font-bold" : "hover:bg-[var(--bg-surface)]"}`}
          >
            <span lang="th" className="text-[14px]">ทุกหมวด</span>
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
                <span className="text-[14px] font-bold"><span lang="th">{d.th}</span> <span className="font-mono text-[9px] font-normal uppercase tracking-[0.1em] text-[var(--dim)]">{d.en}</span></span>
                <span className="font-mono text-[12px] text-[var(--dim)]">{d.datasets}</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-[var(--line)]">
                <div className="h-full bg-[var(--cool)]" style={{ width: `${(d.datasets / maxDomain) * 100}%` }} />
              </div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--dim)]">
                {compactCount(d.rows)} rows · {d.spatial} spatial
              </div>
            </button>
          ))}
        </div>
        <p lang="th" className="mt-2 text-[11px] text-[var(--dim)]">
          การจัดหมวดอัตโนมัติจากชื่อ คำอธิบาย และหน่วยงานต้นทาง — ตรวจสอบกับ data.go.th ได้ทุกชุด
        </p>
      </section>

      {/* ─── List ─────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["ready", `ตารางที่เตรียมแล้ว · ${s.readyDatasets}`],
              ["all", `แหล่งข้อมูลทั้งหมด · ${s.datasets}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              lang="th"
              className={`border px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.08em] ${tab === k ? "border-[var(--cool)] text-[var(--cool)]" : "border-[var(--line)] text-[var(--dim)]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-3 flex items-center gap-2 border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2.5">
          <Search className="h-4 w-4 text-[var(--dim)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชุดข้อมูล หน่วยงาน หรือรูปแบบไฟล์…"
            lang="th"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-[var(--dim)]"
          />
          <span className="font-mono text-[11px] text-[var(--dim)]">{visible.length}</span>
        </label>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChip(c.key)}
              aria-pressed={chip === c.key}
              className={`border px-2 py-1 text-[11px] ${chip === c.key ? "border-[var(--cool)] bg-[var(--cool-dim)] font-bold" : "border-[var(--line)] text-[var(--dim)]"}`}
            >
              <span lang="th">{c.th}</span>
            </button>
          ))}
          {domain && (
            <button type="button" onClick={() => setDomain(null)} className="border border-[var(--sun)] bg-[var(--sun-dim)] px-2 py-1 text-[11px]">
              <span lang="th">{domainByKey.get(domain)?.th}</span> ✕
            </button>
          )}
        </div>

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
                      {dom && <span lang="th" className="border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--dim)]">{dom.th}</span>}
                      <StatusBadge d={d} />
                      {d.hasLocation && <span className="border border-[var(--cool)] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[var(--cool)]">location</span>}
                      {d.hasTime && <span className="border border-[var(--line)] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[var(--dim)]">time</span>}
                      {d.numericCount > 0 && <span className="border border-[var(--line)] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[var(--dim)]">{d.numericCount} numeric</span>}
                      {d.formats.slice(0, 5).map((f) => (
                        <span key={f} className="px-1 py-0.5 font-mono text-[9px] uppercase text-[var(--dim)]">{f}</span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
                    {d.tableCount > 0 ? (
                      <>
                        <div>{d.rows.toLocaleString()} rows</div>
                        <div>{d.fields} fields</div>
                      </>
                    ) : (
                      <div>{d.resourceCount} files</div>
                    )}
                  </div>
                </button>
                {isOpen && <DataLibraryDetail name={d.name} />}
              </li>
            );
          })}
        </ul>
        {visible.length === 0 && (
          <p lang="th" className="py-8 text-center text-[13px] text-[var(--dim)]">ไม่พบชุดข้อมูลที่ตรงกับเงื่อนไข</p>
        )}
        {visible.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + 60)}
            className="mt-3 border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] hover:border-[var(--cool)]"
          >
            Show more ({limit} / {visible.length})
          </button>
        )}
      </section>
    </div>
  );
}
