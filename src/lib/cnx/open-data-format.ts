// Pure formatting helpers for the Open Data panel — split out of
// open-data-th.ts so client components can import them without
// pulling in that module's server-only `node:fs/promises` disk-read
// path. Next.js's client webpack build has no "node:" scheme handler,
// so a client component importing anything from the same module as
// that fs code fails to compile even if it never calls the fs-using
// function — webpack bundles the whole module.

import type { OpenDataDataset } from "../../types/cnx";

export function summariseDataset(d: OpenDataDataset): string {
  if (d.summary && d.summary.trim().length > 0) return d.summary;
  const tagsStr = d.tags.length ? ` · #${d.tags.slice(0, 3).join(" #")}` : "";
  return `${d.publisher} · ${d.format}${tagsStr}`;
}

export function groupDatasets(datasets: OpenDataDataset[]): Record<string, OpenDataDataset[]> {
  const out: Record<string, OpenDataDataset[]> = {};
  for (const d of datasets) {
    const key = d.publisher || "หน่วยงานราชการ";
    out[key] = out[key] ?? [];
    out[key].push(d);
  }
  return out;
}
