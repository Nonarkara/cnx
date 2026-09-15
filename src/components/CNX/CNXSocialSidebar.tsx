"use client";

// CNX social listening sidebar — left rail.
//
// Same slot and format as Lopburi's SocialSidebar but the feed sources
// are scoped to Chiang Mai: "เชียงใหม่" Thai news, "Chiang Mai" English
// news, GDELT global mentions. Sentiment comes from GDELT tone
// (-10…+10); Google News items render as info-tone.

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Radio } from "lucide-react";
import { buildScenarioUrl, fetchJsonOrNull } from "../../lib/client-requests";
import type { SocialListeningResponse, SocialItem } from "../../types/cnx";

type Filter = "all" | "th" | "en" | "alert";

function relative(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function sourceBadge(item: SocialItem) {
  if (item.source === "google-news") {
    return item.lang === "th" ? { label: "TH", className: "bg-[var(--sun)] text-white" } : { label: "EN", className: "bg-[var(--cool)] text-white" };
  }
  if (item.source === "gdelt") return { label: "GDELT", className: "bg-[var(--ink)] text-[var(--bg)]" };
  if (item.source === "twitter") return { label: "X", className: "bg-black text-white" };
  return { label: "RD", className: "bg-orange-600 text-white" };
}

function sentimentBorder(item: SocialItem): string {
  if (item.sentiment === "negative" || item.tone === "alert") return "border-l-[var(--danger)]";
  if (item.sentiment === "positive") return "border-l-[var(--success)]";
  return "border-l-[var(--line)]";
}

export default function CnxSocialSidebar({ scenarioId }: { scenarioId: string | null }) {
  const [data, setData] = useState<SocialListeningResponse | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<SocialListeningResponse>(
        buildScenarioUrl("/api/cnx/social", scenarioId),
      );
      if (cancelled) return;
      if (next) setData(next);
    };
    void load();
    const interval = window.setInterval(() => void load(), 3 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [scenarioId]);

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (filter === "all") return all;
    if (filter === "alert") return all.filter((i) => i.tone === "alert");
    return all.filter((i) => i.lang === filter);
  }, [data, filter]);

  const counts = data?.counts ?? { th: 0, en: 0 };

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--bg-raised)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-[var(--cool)]" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            Social Listening
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--danger)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--danger)]" />
          LIVE
        </span>
      </header>

      <div className="flex shrink-0 border-b border-[var(--line)] bg-[var(--bg)]">
        {(
          [
            { id: "all", label: "All", count: (data?.items.length ?? 0) },
            { id: "th", label: "TH", count: counts.th },
            { id: "en", label: "EN", count: counts.en },
            { id: "alert", label: "Alert", count: data?.items.filter((i) => i.tone === "alert").length ?? 0 },
          ] as const
        ).map((f, i) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex min-h-[32px] flex-1 items-center justify-center gap-1.5 border-r px-2 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors last:border-r-0 ${
              i === 3 ? "border-r-0" : "border-r border-[var(--line)]"
            } ${filter === f.id ? "bg-[var(--bg-raised)] text-[var(--ink)]" : "text-[var(--dim)] hover:text-[var(--ink)]"}`}
          >
            {f.label}
            <span className="font-mono text-[9px] tabular-nums text-[var(--dim)]">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!data ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-[var(--line)]/30" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-[var(--dim)]">No mentions matching filter.</p>
        ) : (
          items.map((item) => {
            const badge = sourceBadge(item);
            const href = item.url && /^https?:\/\//i.test(item.url) ? item.url : null;
            return (
              <article
                key={item.id}
                className={`border-b border-l-2 ${sentimentBorder(item)} border-b-[var(--line)] px-3 py-2 transition-colors hover:bg-[var(--sun-dim)]`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center rounded-sm px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.12em] ${badge.className}`}>
                    {badge.label}
                  </span>
                  <span className="font-mono text-[9px] tabular-nums text-[var(--dim)]">
                    {relative(item.publishedAt)}
                  </span>
                </div>
                <h3 className="mt-1 text-[11px] font-semibold leading-snug text-[var(--ink)]" lang={item.lang}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
                      {item.title}
                      <ExternalLink className="ml-1 inline-block h-2.5 w-2.5 align-baseline text-[var(--dim)]" />
                    </a>
                  ) : (
                    item.title
                  )}
                </h3>
                {item.topics?.filter(Boolean).slice(0, 2).map((t, i) => (
                  <span key={i} className="mt-1 mr-1 inline-block text-[8px] text-[var(--dim)]">
                    #{t.split(".")[0]}
                  </span>
                ))}
              </article>
            );
          })
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-[var(--line)] bg-[var(--bg)] px-3 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--dim)]">
          {data ? `${data.items.length} items • ${relative(data.generatedAt)}` : "loading…"}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--dim)]">3-min poll</span>
      </footer>
    </div>
  );
}