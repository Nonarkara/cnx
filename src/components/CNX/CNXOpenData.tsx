"use client";

// CNX Open Data panel — data.go.th catalog reader.
//
// A dated snapshot of the data.go.th Chiang Mai search, searchable by
// title, publisher and tags. Source counts and bake time come from the
// response; search misses remain empty rather than showing unrelated records.

import { useEffect, useMemo, useState } from "react";
import { Database, ExternalLink, Search } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { DataAge } from "./CNXDataAge";
import { useLang } from "../../hooks/useLang";
import type { OpenDataIndex } from "../../types/cnx";

export default function CnxOpenData({ onOpenWorkbench }: { onOpenWorkbench?: () => void } = {}) {
  const { lang, t } = useLang();
  const [data, setData] = useState<OpenDataIndex | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const next = await fetchJsonOrNull<OpenDataIndex>("/api/cnx/open-data", { signal: controller.signal });
      if (controller.signal.aborted) return;
      setRefreshFailed(!next);
      if (next) setData(next);
    };
    void load();
    const interval = window.setInterval(() => void load(), 30 * 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [attempt]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!query.trim()) return data.datasets;
    const q = query.trim().toLowerCase();
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
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            {t("ข้อมูลเปิด · data.go.th", "Open Data · data.go.th")}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-[var(--dim)]">
            {data ? `${data.fetched}/${data.totalDatasets}` : t("กำลังโหลด…", "loading…")}
          </span>
          {/* Age the BAKE, not the poll. The panel re-fetches every 30 min
              and the response is always fresh, so a `generatedAt` from the
              response would print "just now" over a catalogue that had not
              changed since 2026-09-15. Here `generatedAt` genuinely IS the
              observation time — it is written by the fetcher when it last
              pulled data.go.th, and is passed through untouched by both the
              disk and ASSETS paths — so this is the one place the rule cuts
              the other way and a stamp on it is correct.
              14 d, not the default 3 h: `npm run fetch:opendata` is a
              manual script with no cron, so a fortnight is the honest point
              at which "someone should re-bake this" rather than "this is
              broken". The current bake reads amber, which is correct — it
              is 16 days old and the catalogue has drifted 311 -> 316. */}
          <DataAge
            observedAt={data?.generatedAt}
            source={t("แค็ตตาล็อก", "catalogue")}
            staleAfterMs={14 * 24 * 3_600_000}
            missing={t("ยังไม่มีชุดที่เตรียมไว้", "no bake")}
          />
        </div>
      </header>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--line)] bg-[var(--bg)] px-3 py-1.5">
        <Search className="h-3 w-3 text-[var(--dim)]" />
        <input
          aria-label={t("กรองชุดข้อมูลเชียงใหม่", "Filter Chiang Mai datasets")}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("กรองชุดข้อมูล…", "filter datasets…")}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]"
        />
      </div>
      {onOpenWorkbench && (
        <button
          type="button"
          onClick={onOpenWorkbench}
          className="flex w-full shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--cool-dim)] px-3 py-1.5 text-left hover:bg-[var(--cool-dim)]/70"
        >
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-[var(--ink)]">{t("เปิดคลังข้อมูลฉบับเต็ม", "Open the full data workbench")}</div>
            <div className="font-mono text-[11px] text-[var(--dim)]">
              {t("ตารางที่อ่านแล้ว · ตัวอย่างข้อมูล · สถิติท่องเที่ยว · ลิงก์ทุกไฟล์", "tables parsed · previews · tourism statistics · every file linked")}
            </div>
          </div>
          <span className="font-mono text-[11px] text-[var(--cool)]">→</span>
        </button>
      )}
      {/* Pinned external reference — not a data.go.th dataset, kept
          visually distinct and separately sourced/labelled so it never
          reads as an official government record. */}
      <a
        href="https://changpuakmagazine.com/en-article/EMERGENCY/751083/"
        target="_blank"
        rel="noreferrer"
        className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--cool-dim)] px-3 py-1.5 hover:bg-[var(--cool-dim)]/70"
      >
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-[var(--ink)]">
            {t("เบอร์โทรฉุกเฉิน — เชียงใหม่", "Emergency phone numbers — Chiang Mai")}
          </div>
          <div className="font-mono text-[11px] text-[var(--dim)]">
            {t(
              "ไม่ใช่ชุดข้อมูลจาก data.go.th — แหล่งอ้างอิงที่คัดมา จาก ChangPuak Magazine",
              "Not a data.go.th record — curated reference, ChangPuak Magazine",
            )}
          </div>
        </div>
        <ExternalLink className="h-3 w-3 shrink-0 text-[var(--dim)]" />
      </a>
      {refreshFailed && <div role="status" className="p-3 text-[12px] text-[var(--dim)]">{data ? t("รีเฟรชแค็ตตาล็อกไม่สำเร็จ แสดงข้อมูลที่บันทึกไว้", "Catalogue refresh failed; showing the saved response.") : t("แค็ตตาล็อกไม่พร้อมใช้งาน ยังไม่มีรายการ", "Catalogue unavailable; no records loaded.")} <button type="button" onClick={() => { setRefreshFailed(false); setAttempt((value) => value + 1); }} className="min-h-11 border border-[var(--line)] px-3 text-[var(--cool)]">{t("ลองอีกครั้ง", "Retry")}</button></div>}
      {!data && refreshFailed ? null : !data ? (
        <div className="flex-1 space-y-2 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse bg-[var(--line)]/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p role="status" className="p-3 text-[12px] text-[var(--dim)]">{query.trim() ? t("ไม่พบชุดข้อมูลที่ตรงกับคำค้น", "No datasets match this search") : t("แค็ตตาล็อกนี้ยังไม่มีชุดข้อมูล", "No datasets are available in this catalogue.")}</p>
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
                className="flex flex-col border-b border-[var(--line)] px-3 py-1.5 hover:bg-[var(--cool-dim)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold text-[var(--ink)]">
                    {(lang === "th" ? d.titleTh ?? d.titleEn : d.titleEn ?? d.titleTh) ?? d.id}
                  </span>
                  <ExternalLink className="h-2.5 w-2.5 shrink-0 text-[var(--dim)]" />
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--dim)]">
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