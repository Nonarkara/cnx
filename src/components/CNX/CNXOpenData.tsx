"use client";

// CNX Open Data panel — data.go.th catalog reader.
//
// The 311 datasets matching "เชียงใหม่" on data.go.th are listed
// here, grouped by publisher. Click a row to open the source resource;
// mirror files in /data/cnx/open-data/ are clickable too (smaller
// CSVs we cached). The panel defaults to the first publisher; the
// "open full catalog" button opens the data.go.th search directly.

import { useEffect, useMemo, useState } from "react";
import { Database, ExternalLink, Search } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { groupDatasets, summariseDataset } from "../../lib/cnx/open-data-format";
import type { OpenDataIndex, OpenDataDataset } from "../../types/cnx";

function PublisherGroups({ datasets }: { datasets: OpenDataDataset[] }) {
  const grouped = useMemo(() => groupDatasets(datasets), [datasets]);
  const publishers = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length);
  const [active, setActive] = useState<string>(publishers[0] ?? "");
  useEffect(() => {
    if (!active && publishers[0]) setActive(publishers[0]);
  }, [active, publishers]);
  const list = grouped[active] ?? [];
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 overflow-x-auto border-b border-[var(--line)] bg-[var(--bg)]">
        <div className="flex">
          {publishers.slice(0, 6).map((p, i) => (
            <button
              key={p}
              onClick={() => setActive(p)}
              className={`flex min-h-[28px] shrink-0 items-center gap-1 border-r border-[var(--line)] px-2 text-[8px] font-bold uppercase tracking-[0.14em] last:border-r-0 ${
                i === 0 ? "" : ""
              } ${active === p ? "bg-[var(--bg-raised)] text-[var(--ink)]" : "text-[var(--dim)] hover:text-[var(--ink)]"}`}
              title={p}
            >
              {p.slice(0, 24)}
              <span className="font-mono text-[8px] tabular-nums text-[var(--dim)]">{grouped[p].length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.slice(0, 30).map((d) => {
          const href = d.url && /^https?:\/\//i.test(d.url) ? d.url : null;
          return (
            <a
              key={d.id}
              href={href ?? "#"}
              target={href ? "_blank" : undefined}
              rel="noreferrer"
              className="flex flex-col border-b border-[var(--line)] px-3 py-1.5 hover:bg-[var(--sun-dim)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-semibold text-[var(--ink)]">
                  {d.titleEn ?? d.titleTh ?? d.id}
                </span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0 text-[var(--dim)]" />
              </div>
              <div className="flex items-center gap-2 font-mono text-[8px] text-[var(--dim)]">
                <span>{d.format}</span>
                {d.byteSize && <span>{(d.byteSize / 1024).toFixed(0)} KB</span>}
                {d.tags.slice(0, 2).map((t, i) => (
                  <span key={i}>#{t}</span>
                ))}
              </div>
              <div className="mt-0.5 truncate text-[9px] text-[var(--dim)]">{summariseDataset(d)}</div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default function CnxOpenData() {
  const [data, setData] = useState<OpenDataIndex | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<OpenDataIndex>("/api/cnx/open-data");
      if (!cancelled && next) setData(next);
    };
    void load();
    const interval = window.setInterval(() => void load(), 30 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!query.trim()) return data.datasets;
    const q = query.toLowerCase();
    return data.datasets.filter(
      (d) =>
        (d.titleEn ?? "").toLowerCase().includes(q) ||
        (d.titleTh ?? "").toLowerCase().includes(q) ||
        d.publisher.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [data, query]);

  return (
    <div className="flex h-full flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-[var(--cool)]" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            Open Data · data.go.th
          </span>
        </div>
        <span className="font-mono text-[9px] tabular-nums text-[var(--dim)]">
          {data ? `${data.fetched}/${data.totalDatasets}` : "loading…"}
        </span>
      </header>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--line)] bg-[var(--bg)] px-3 py-1.5">
        <Search className="h-3 w-3 text-[var(--dim)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter datasets…"
          className="min-w-0 flex-1 bg-transparent text-[10px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]"
        />
      </div>
      {/* Pinned external reference — not a data.go.th dataset, kept
          visually distinct and separately sourced/labelled so it never
          reads as an official government record. */}
      <a
        href="https://changpuakmagazine.com/en-article/EMERGENCY/751083/"
        target="_blank"
        rel="noreferrer"
        className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--sun-dim)] px-3 py-1.5 hover:bg-[var(--sun-dim)]/70"
      >
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold text-[var(--ink)]">
            Emergency phone numbers — Chiang Mai
          </div>
          <div className="font-mono text-[8px] text-[var(--dim)]">
            Not a data.go.th record — curated reference, ChangPuak Magazine
          </div>
        </div>
        <ExternalLink className="h-3 w-3 shrink-0 text-[var(--dim)]" />
      </a>
      {!data ? (
        <div className="flex-1 space-y-2 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse bg-[var(--line)]/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 overflow-hidden">
          <PublisherGroups datasets={data.datasets} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.slice(0, 60).map((d) => {
            const href = d.url && /^https?:\/\//i.test(d.url) ? d.url : null;
            return (
              <a
                key={d.id}
                href={href ?? "#"}
                target={href ? "_blank" : undefined}
                rel="noreferrer"
                className="flex flex-col border-b border-[var(--line)] px-3 py-1.5 hover:bg-[var(--sun-dim)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold text-[var(--ink)]">
                    {d.titleEn ?? d.titleTh ?? d.id}
                  </span>
                  <ExternalLink className="h-2.5 w-2.5 shrink-0 text-[var(--dim)]" />
                </div>
                <div className="flex items-center gap-2 font-mono text-[8px] text-[var(--dim)]">
                  <span>{d.publisher.slice(0, 30)}</span>
                  <span>{d.format}</span>
                  {d.tags.slice(0, 2).map((t, i) => (
                    <span key={i}>#{t}</span>
                  ))}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}