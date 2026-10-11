"use client";

// Expanded view of one dataset in the Data Workbench: metadata, every
// resource with its source link, and a typed preview of each parsed table.
// Row previews are capped by the build script; the cap and the real total
// are always shown so a truncated table never reads as a complete one.
//
// One language per mode. Dataset titles, column names, cell values and
// publisher names stay as published on data.go.th. The build script's
// English notes and unreadable reasons are translated here by pattern;
// anything unrecognised is shown as written.

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { useLang } from "../../hooks/useLang";
import {
  compactCount,
  formatBytes,
  pickChartSeries,
  tableToCsv,
  type ColumnKind,
  type LibraryDataset,
  type LibraryTable,
} from "../../lib/cnx/data-library";

const PAGE = 25;

type T = (th: string, en: string | null | undefined) => string;

const KIND_TH: Record<ColumnKind, string> = { number: "ตัวเลข", text: "ข้อความ", time: "เวลา", geo: "พิกัด" };

/** Thai for the build script's per-table note ("3 sheets — largest shown"). */
function noteTh(note: string): string {
  const sheets = note.match(/^(\d+) sheets — largest shown$/);
  return sheets ? `มี ${sheets[1]} ชีต — แสดงชีตที่ใหญ่ที่สุด` : note;
}

/** Thai for the build script's unreadable-resource reasons. */
function reasonTh(reason: string): string {
  const preview = reason.match(/^preview limit — first (\d+) tables shown/);
  if (preview) return `เกินจำนวนตัวอย่าง — แสดง ${preview[1]} ตารางแรก ที่เหลือเปิดดูที่ต้นทาง`;
  const failed = reason.match(/^download\/parse failed: (.+)$/);
  if (failed) return `ดาวน์โหลดหรืออ่านไฟล์ไม่สำเร็จ (${failed[1]})`;
  const known: Record<string, string> = {
    "JSON is not a flat list of records": "JSON ไม่ได้เป็นรายการระเบียนแบบตารางเดียว",
    "legacy binary .xls — open at source": "ไฟล์ .xls รุ่นเก่า — เปิดดูที่ต้นทาง",
    "no downloadable URL": "ไม่มีลิงก์ให้ดาวน์โหลด",
    "no rows found": "ไม่พบแถวข้อมูล",
  };
  return known[reason] ?? reason;
}

function BarChart({ table, t }: { table: LibraryTable; t: T }) {
  const series = useMemo(() => pickChartSeries(table), [table]);
  if (!series) return null;
  const max = Math.max(...series.values, 0) || 1;
  const w = 640;
  const h = 120;
  const gap = 3;
  const bw = Math.max(2, (w - gap * (series.values.length - 1)) / series.values.length);
  const caption = t(`${series.value} · ตาม ${series.label}`, `${series.value} · by ${series.label}`);
  return (
    <figure className="mt-3 border border-[var(--line)] bg-[var(--bg-raised)] p-3">
      <figcaption className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dim)]">{caption}</figcaption>
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full" role="img" aria-label={caption}>
        {series.values.map((v, i) => {
          const bh = Math.max(1, (v / max) * h);
          const x = i * (bw + gap);
          return (
            <g key={i}>
              <title>{`${series.labels[i]}: ${v.toLocaleString()}`}</title>
              <rect x={x} y={h - bh} width={bw} height={bh} fill="var(--cool)" opacity={0.85} />
              {series.values.length <= 14 && (
                <text x={x + bw / 2} y={h + 13} textAnchor="middle" fontSize={9} fill="var(--dim)">
                  {series.labels[i].slice(0, 8)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function TableView({ table, t }: { table: LibraryTable; t: T }) {
  const [shown, setShown] = useState(PAGE);
  const rows = table.rows.slice(0, shown);

  const downloadPreview = () => {
    const blob = new Blob([tableToCsv(table)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table.name.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w฀-๿-]+/g, "_").slice(0, 60) || "table"}-preview.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = table.totalRows.toLocaleString();
  const preview = table.previewRows.toLocaleString();

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
        <span>{t(`${table.columns.length} คอลัมน์ · ${total} แถว`, `${table.columns.length} fields · ${total} rows`)}</span>
        {table.truncated && (
          <span className="border border-[var(--cool)] bg-[var(--cool-dim)] px-1.5 py-0.5 text-[var(--ink)]">
            {t(`ตัวอย่าง: ${preview} แถวแรกจาก ${total} แถว`, `preview: first ${preview} of ${total} rows`)}
          </span>
        )}
        {table.columnsTruncated && (
          <span>{t(`แสดง ${table.columns.length} คอลัมน์แรก`, `showing first ${table.columns.length} columns`)}</span>
        )}
        {table.note && <span>{t(noteTh(table.note), table.note)}</span>}
        <button
          type="button"
          onClick={downloadPreview}
          className="ml-auto flex items-center gap-1 border border-[var(--line)] bg-[var(--bg-raised)] px-2 py-1 hover:border-[var(--cool)] hover:text-[var(--cool)]"
        >
          <Download className="h-3 w-3" />
          {table.truncated
            ? t(`CSV ตัวอย่าง (${preview} แถว)`, `Preview CSV (${preview} rows)`)
            : t("CSV ตัวอย่าง", "Preview CSV")}
        </button>
      </div>

      <BarChart table={table} t={t} />

      <div className="mt-3 max-h-[420px] overflow-auto border border-[var(--line)] bg-[var(--bg-raised)]">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-[var(--bg-surface)]">
            <tr>
              <th className="border-b border-[var(--line)] px-2 py-1.5 text-right font-mono text-[11px] font-normal text-[var(--dim)]">#</th>
              {table.columns.map((c, i) => (
                <th key={i} className="whitespace-nowrap border-b border-[var(--line)] px-2 py-1.5 text-left align-bottom font-bold">
                  <div lang="th">{c.name}</div>
                  <div className="font-mono text-[11px] font-normal uppercase tracking-[0.14em] text-[var(--cool)]">{t(KIND_TH[c.kind] ?? c.kind, c.kind)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="odd:bg-[var(--bg-surface)]/60">
                <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--dim)]">{ri + 1}</td>
                {r.map((v, ci) => (
                  <td
                    key={ci}
                    lang="th"
                    className={`max-w-[260px] truncate px-2 py-1 ${table.columns[ci]?.kind === "number" ? "text-right tabular-nums" : ""}`}
                    title={String(v)}
                  >
                    {String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown < table.rows.length && (
        <button
          type="button"
          onClick={() => setShown((n) => Math.min(table.rows.length, n + 50))}
          className="mt-2 border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] hover:border-[var(--cool)]"
        >
          {t("แสดงเพิ่ม", "Show more")} ({rows.length} / {table.rows.length.toLocaleString()})
        </button>
      )}
    </div>
  );
}

export default function DataLibraryDetail({ name }: { name: string }) {
  const [data, setData] = useState<LibraryDataset | null>(null);
  const [failed, setFailed] = useState(false);
  const [tableIdx, setTableIdx] = useState(0);
  const { t } = useLang();

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    setTableIdx(0);
    void fetchJsonOrNull<LibraryDataset>(`/data/cnx/data-library/datasets/${encodeURIComponent(name)}.json`).then((d) => {
      if (cancelled) return;
      if (d) setData(d);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (failed) return <p className="p-4 text-[13px] text-[var(--danger)]">{t("โหลดรายละเอียดของชุดข้อมูลนี้ไม่สำเร็จ", "Could not load this dataset’s detail file.")}</p>;
  if (!data) return <p className="p-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dim)]">{t("กำลังโหลด…", "Loading…")}</p>;

  const table = data.tables[tableIdx];
  return (
    <div className="border-t border-[var(--line)] bg-[var(--bg-surface)] p-4">
      {data.notes && (
        <p lang="th" className="max-w-[80ch] whitespace-pre-line text-[13px] leading-[1.7]">
          {data.notes.length > 700 ? `${data.notes.slice(0, 700)}…` : data.notes}
        </p>
      )}
      <dl className="mt-3 grid gap-x-6 gap-y-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--dim)] sm:grid-cols-2">
        <div><dt className="inline">{t("หน่วยงาน", "Publisher")}: </dt><dd lang="th" className="inline normal-case tracking-normal text-[var(--ink)]">{data.org || "—"}</dd></div>
        <div><dt className="inline">{t("สัญญาอนุญาต", "License")}: </dt><dd className="inline normal-case tracking-normal text-[var(--ink)]">{data.license || "—"}</dd></div>
        <div><dt className="inline">{t("ปรับปรุงล่าสุด", "Updated")}: </dt><dd className="inline text-[var(--ink)]">{data.modified?.slice(0, 10) ?? "—"}</dd></div>
        <div><dt className="inline">{t("ปีข้อมูล", "Years")}: </dt><dd className="inline text-[var(--ink)]">{data.firstYear || "—"}{data.lastYear && data.lastYear !== data.firstYear ? ` – ${data.lastYear}` : ""}</dd></div>
        {data.dataSource && <div className="sm:col-span-2"><dt className="inline">{t("แหล่งที่มา", "Source")}: </dt><dd lang="th" className="inline normal-case tracking-normal text-[var(--ink)]">{data.dataSource}</dd></div>}
      </dl>

      {data.tables.length > 0 ? (
        <div className="mt-4">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
            {t("ตาราง", "Tables")} ({data.tables.length})
          </div>
          {data.tables.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.tables.map((tb, i) => (
                <button
                  key={tb.resourceId}
                  type="button"
                  onClick={() => setTableIdx(i)}
                  aria-pressed={i === tableIdx}
                  lang="th"
                  className={`max-w-[280px] truncate border px-2 py-1 text-[11px] ${i === tableIdx ? "border-[var(--cool)] bg-[var(--cool-dim)] font-bold" : "border-[var(--line)] bg-[var(--bg-raised)]"}`}
                  title={tb.name}
                >
                  {tb.name.replace(/\.[a-z0-9]+$/i, "")} · {compactCount(tb.totalRows)}
                </button>
              ))}
            </div>
          )}
          {table && <TableView key={table.resourceId} table={table} t={t} />}
        </div>
      ) : (
        <p className="mt-4 border border-[var(--line)] bg-[var(--bg-raised)] p-3 text-[12px] text-[var(--dim)]">
          {t(
            "ชุดข้อมูลนี้ไม่มีตารางที่เครื่องอ่านได้ — ไฟล์ทั้งหมดแสดงไว้ด้านล่าง และเปิดได้ที่หน่วยงานต้นทาง",
            "No machine-readable table could be prepared for this dataset — its files are listed below and open at the publisher.",
          )}
        </p>
      )}

      {data.unreadable.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
            {t(
              `อ่านที่นี่ไม่ได้ (${data.unreadable.length}) — แสดงไว้ ไม่ซ่อน`,
              `Not readable here (${data.unreadable.length}) — listed, not hidden`,
            )}
          </div>
          <ul className="mt-1 space-y-1 text-[12px]">
            {data.unreadable.map((u) => (
              <li key={u.resourceId} className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[11px] uppercase text-[var(--cool)]">{u.format}</span>
                <span lang="th" className="truncate">{u.name}</span>
                <span className="text-[var(--dim)]">— {t(reasonTh(u.reason), u.reason)}</span>
                {u.sourceUrl && (
                  <a href={u.sourceUrl} target="_blank" rel="noreferrer" className="text-[var(--cool)] hover:underline">{t("เปิด ↗", "open ↗")}</a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.files.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
            {t("ไฟล์และลิงก์อื่น", "Other files & links")} ({data.files.length})
          </div>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">
            {data.files.slice(0, 40).map((f) => (
              <li key={f.id} className="flex items-baseline gap-2 text-[12px]">
                <span className="w-9 shrink-0 font-mono text-[11px] uppercase text-[var(--cool)]">{f.format}</span>
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noreferrer" lang="th" className="truncate hover:underline" title={f.name}>
                    {f.name || f.url}
                  </a>
                ) : (
                  <span lang="th" className="truncate">{f.name}</span>
                )}
                <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--dim)]">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
          {data.files.length > 40 && (
            <p className="mt-1 text-[11px] text-[var(--dim)]">
              {t(`…และอีก ${data.files.length - 40} ไฟล์ที่หน่วยงานต้นทาง`, `…and ${data.files.length - 40} more at the publisher.`)}
            </p>
          )}
        </div>
      )}

      <a
        href={data.portalUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--cool)] hover:underline"
      >
        {t("เปิดที่ data.go.th", "Open on data.go.th")} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
