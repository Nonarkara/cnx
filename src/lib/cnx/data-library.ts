// Types + pure helpers for the Data Workbench (public/data/cnx/data-library/,
// produced by scripts/build-cnx-data-library.mjs). Kept free of React and
// I/O so the filtering / export / chart rules can be unit-tested.

export interface LibraryDomain {
  key: string;
  th: string;
  en: string;
  datasets: number;
  tables: number;
  rows: number;
  spatial: number;
}

export type LibraryStatus = "ready" | "files" | "link";

export interface LibraryDatasetSummary {
  id: string;
  name: string;
  title: string;
  org: string;
  domain: string;
  formats: string[];
  resourceCount: number;
  tableCount: number;
  rows: number;
  fields: number;
  hasLocation: boolean;
  hasTime: boolean;
  numericCount: number;
  /** ready = at least one table parsed; files = downloadable but no table
   *  (PDF, images, shapefiles…); link = web-page/API links only. */
  status: LibraryStatus;
  modified: string | null;
  license: string;
  unreadableCount: number;
}

export interface LibraryIndex {
  generatedAt: string;
  source: string;
  previewRowCap: number;
  stats: {
    datasets: number;
    resources: number;
    readyDatasets: number;
    tables: number;
    rows: number;
    spatial: number;
    timeIndexed: number;
    numeric: number;
    filesOnly: number;
    linkOnly: number;
    unreadableResources: number;
  };
  domains: LibraryDomain[];
  datasets: LibraryDatasetSummary[];
}

export type ColumnKind = "number" | "text" | "time" | "geo";

export interface LibraryColumn {
  name: string;
  kind: ColumnKind;
}

export type Cell = string | number;

export interface LibraryTable {
  resourceId: string;
  name: string;
  format: string;
  sourceUrl: string;
  size: number | null;
  note?: string;
  columns: LibraryColumn[];
  hasLocation: boolean;
  hasTime: boolean;
  numericCount: number;
  rows: Cell[][];
  previewRows: number;
  totalRows: number;
  truncated: boolean;
  columnsTruncated: boolean;
}

export interface LibraryUnreadable {
  resourceId: string;
  name: string;
  format: string;
  sourceUrl: string;
  size: number | null;
  reason: string;
}

export interface LibraryFile {
  id: string;
  name: string;
  format: string;
  size: number | null;
  url: string;
  modified: string | null;
  datastore: boolean;
  mirrored: boolean;
}

export interface LibraryDataset {
  id: string;
  name: string;
  title: string;
  notes: string;
  org: string;
  domain: string;
  tags: string[];
  license: string;
  accessCondition: string;
  dataSource: string;
  maintainer: string;
  firstYear: string;
  lastYear: string;
  modified: string | null;
  portalUrl: string;
  tables: LibraryTable[];
  unreadable: LibraryUnreadable[];
  files: LibraryFile[];
}

export type LibraryTab = "ready" | "all";
export type LibraryChip = "all" | "location" | "time" | "numeric";

export interface LibraryFilter {
  tab: LibraryTab;
  chip: LibraryChip;
  /** Domain key, or null for every domain. */
  domain: string | null;
  query: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFC");

export function filterDatasets(
  datasets: LibraryDatasetSummary[],
  filter: LibraryFilter,
  domainLabels: Record<string, string> = {},
): LibraryDatasetSummary[] {
  const q = norm(filter.query.trim());
  return datasets.filter((d) => {
    if (filter.tab === "ready" && d.status !== "ready") return false;
    if (filter.domain && d.domain !== filter.domain) return false;
    if (filter.chip === "location" && !d.hasLocation) return false;
    if (filter.chip === "time" && !d.hasTime) return false;
    if (filter.chip === "numeric" && d.numericCount === 0) return false;
    if (!q) return true;
    return norm(`${d.title} ${d.org} ${d.name} ${domainLabels[d.domain] ?? ""} ${d.formats.join(" ")}`).includes(q);
  });
}

/** 54400 → "54.4K", 1_250_000 → "1.3M", 640 → "640". */
export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function csvCell(v: Cell): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of the *preview* rows — the caller labels it as such. BOM-prefixed
 *  so Excel opens Thai text as UTF-8. */
export function tableToCsv(table: Pick<LibraryTable, "columns" | "rows">): string {
  const lines = [table.columns.map((c) => csvCell(c.name)).join(",")];
  for (const row of table.rows) lines.push(row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}`;
}

const toNumber = (v: Cell): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,\s%]/g, ""));
  return String(v).trim() !== "" && Number.isFinite(n) ? n : null;
};

export interface ChartSeries {
  label: string;
  value: string;
  labels: string[];
  values: number[];
}

/** A chart is only drawn when it can't mislead: one time-like column whose
 *  labels are all distinct (a true series, not a grouped long table) and a
 *  numeric column, with 3–80 usable points. */
export function pickChartSeries(table: Pick<LibraryTable, "columns" | "rows">): ChartSeries | null {
  const timeIdx = table.columns.findIndex((c) => c.kind === "time");
  if (timeIdx < 0) return null;
  const labels = table.rows.map((r) => String(r[timeIdx] ?? "").trim());
  if (labels.length < 3 || labels.length > 80 || new Set(labels).size !== labels.length || labels.some((l) => l === "")) return null;
  for (let i = 0; i < table.columns.length; i++) {
    if (table.columns[i].kind !== "number" || i === timeIdx) continue;
    const values = table.rows.map((r) => toNumber(r[i]));
    if (values.every((v): v is number => v !== null)) {
      return { label: table.columns[timeIdx].name, value: table.columns[i].name, labels, values };
    }
  }
  return null;
}
