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
import { useLang } from "../../hooks/useLang";
import type { Lang } from "../../lib/i18n";

type Filter = "all" | "th" | "en" | "alert";

function relative(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const th = lang === "th";
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return th ? "เมื่อสักครู่" : "just now";
  if (diffMin < 60) return th ? `${diffMin} นาที` : `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return th ? `${diffHr} ชม.` : `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return th ? `${diffDays} วัน` : `${diffDays}d`;
  return d.toLocaleDateString(th ? "th-TH" : "en-GB", { day: "numeric", month: "short" });
}

function sourceBadge(item: SocialItem) {
  if (item.source === "google-news") {
    return { label: item.lang.toUpperCase(), className: item.lang === "th" ? "bg-[var(--cool)] text-[var(--bg)]" : "border border-[var(--cool)] text-[var(--cool)]" };
  }
  if (item.source === "gdelt") return { label: "GDELT", className: "bg-[var(--ink)] text-[var(--bg)]" };
  if (item.source === "twitter") return { label: "X", className: "bg-[var(--ink)] text-[var(--bg)]" };
  return { label: "RD", className: "border border-[var(--line)] text-[var(--ink)]" };
}

function sentimentBorder(item: SocialItem): string {
  if (item.sentiment === "negative" || item.tone === "alert") return "border-l-[var(--danger)]";
  if (item.sentiment === "positive") return "border-l-[var(--success)]";
  return "border-l-[var(--line)]";
}

export default function CnxSocialSidebar({ scenarioId, multilingualCountries = [], initialData = null }: {
  scenarioId: string | null;
  multilingualCountries?: string[];
  initialData?: SocialListeningResponse | null;
}) {
  const { lang, t } = useLang();
  const [data, setData] = useState<SocialListeningResponse | null>(initialData);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const multilingualCountriesKey = multilingualCountries.join(",");

  useEffect(() => {
    if (initialData && !data) {
      setData(initialData);
    }
  }, [initialData, data]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const url = multilingualCountriesKey
        ? buildScenarioUrl(`/api/cnx/social?multilingual=1&countries=${encodeURIComponent(multilingualCountriesKey)}`, scenarioId)
        : buildScenarioUrl("/api/cnx/social", scenarioId);
      const next = await fetchJsonOrNull<SocialListeningResponse>(url);
      if (cancelled) return;
      setRefreshFailed(!next);
      if (next) setData(next);
    };
    void load();
    const interval = window.setInterval(() => void load(), 3 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [scenarioId, multilingualCountriesKey]);

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (filter === "all") return all;
    if (filter === "alert") return all.filter((i) => i.tone === "alert");
    return all.filter((i) => i.lang === filter);
  }, [data, filter]);

  const counts = { th: data?.items.filter(i => i.lang === "th").length ?? 0, en: data?.items.filter(i => i.lang === "en").length ?? 0 };

  return (
    // `overflow-y-auto`, not `overflow-hidden`. The rail's height is the
    // viewport's, and the list below it is the elastic part: measured on the
    // live board, the list's height is (viewport height - 615 px), because a
    // 255 px verdict block and 237 px of fixed chrome sit above it. So at
    // 1024x900 the list had 48 px and at 1366x640 it had 25 px — windows onto
    // 2167 px of headlines, showing none of them while the footer still read
    // "24 รายการ". Clipping hid the overflow; scrolling the rail exposes it.
    <div lang={lang} data-surface="cnx-news-rail" className="flex h-full flex-col overflow-y-auto overflow-x-hidden border-r border-[var(--line)] bg-[var(--bg-raised)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-[var(--cool)]" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
            {t("ข่าวเชียงใหม่", "Chiang Mai news")}
          </span>
        </div>
        <span className={`inline-flex items-center gap-1.5 border border-[var(--line)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.15em] ${refreshFailed ? "text-[var(--sev-watch)]" : "text-[var(--dim)]"}`}>
          {refreshFailed ? t("รีเฟรชไม่สำเร็จ", "REFRESH FAILED") : data?.items.some((item) => item.tone === "demo") ? t("สถานการณ์จำลอง", "SCENARIO") : t("ข่าว", "NEWS")}
        </span>
      </header>

      <div className="flex shrink-0 border-b border-[var(--line)] bg-[var(--bg)]">
        {(
          [
            { id: "all", label: t("ทั้งหมด", "All"), count: (data?.items.length ?? 0) },
            { id: "th", label: "TH", count: counts.th },
            { id: "en", label: "EN", count: counts.en },
            { id: "alert", label: t("ประเด็น", "Issues"), count: data?.items.filter((i) => i.tone === "alert").length ?? 0 },
          ] as const
        ).map((f, i) => (
          <button
            key={f.id}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1 border-r px-1 text-[11px] font-bold transition-colors last:border-r-0 ${
              i === 3 ? "border-r-0" : "border-r border-[var(--line)]"
            } ${filter === f.id ? "bg-[var(--bg-raised)] text-[var(--ink)]" : "text-[var(--dim)] hover:text-[var(--ink)]"}`}
          >
            {f.label}
            <span className="font-mono text-[11px] tabular-nums text-[var(--dim)]">{f.count}</span>
          </button>
        ))}
      </div>

      <p className="shrink-0 border-b border-[var(--line)] px-3 py-2 text-[11px] leading-relaxed text-[var(--dim)]">{t("ข่าวจากสื่อเพื่อใช้ตรวจสอบต่อ ไม่ใช่การยืนยันเหตุการณ์หรือผลสำรวจความคิดเห็นประชาชน", "Media news to follow up on — not confirmation of events or a survey of public opinion.")}</p>

      {data && data.items.length > 0 && data.unavailableReason && (
        <details className="shrink-0 border-b border-[var(--line)] px-3 py-2 text-[11px] leading-relaxed text-[var(--sev-watch)]">
          <summary className="cursor-pointer">{t("แหล่งข่าวบางแห่งไม่พร้อมใช้งาน", "Some news sources are unavailable")}</summary>
          <p className="mt-1 text-[var(--dim)]">{data.unavailableReason}</p>
        </details>
      )}

      {/* The floor is what stops the list from vanishing. `min-h-0` let it
          shrink to nothing whenever the rail was short; a floor of 200 px
          keeps it a usable scroll target (~2 headlines) and lets the rail
          scroll the remainder, instead of showing a 25 px sliver. It applies
          only when there ARE items: the empty states below carry their own
          honest messages ("this rail is blind, not empty") and must not sit
          in a box padded out to 200 px of nothing. */}
      <div className={`flex-1 overflow-y-auto ${items.length > 0 ? "min-h-[200px]" : "min-h-0"}`}>
        {!data && refreshFailed ? (
          <p role="status" className="px-3 py-6 text-center text-[11px] text-[var(--dim)]">{t("ดึงข่าวไม่ได้ จะลองใหม่ในรอบถัดไป", "News feed unavailable. Retrying on the next refresh.")}</p>
        ) : !data ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-[var(--line)]/30" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-[11px] text-[var(--dim)]">
              {data.items.length
                ? t("ไม่มีข่าวตรงกับตัวกรองนี้", "No mentions match this filter.")
                : data.provenance === "unavailable"
                  ? // The important case. A refused or timed-out feed is
                    // not a quiet news day, and the operator is looking at
                    // this rail precisely when they need to know which.
                    t("ข่าวไม่สามารถดึงได้ — ไม่ใช่การไม่มีข่าว", "News could not be retrieved — this is not a quiet news day.")
                  : t("ยังไม่ได้รับข่าวที่ตรวจสอบได้", "No verified news retrieved.")}
            </p>
            {data.provenance === "unavailable" ? (
              <>
                <p className="mt-1 text-[11px] italic text-[var(--sev-watch)]">
                  {t("อ่านแหล่งข่าวไม่ได้ ช่องนี้มองไม่เห็น ไม่ใช่ว่างเปล่า", "Could not read the news feeds. This rail is blind, not empty.")}
                </p>
                {data.unavailableReason && (
                  <p className="mt-1.5 font-mono text-[11px] leading-[1.5] text-[var(--dim)]">{data.unavailableReason}</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-[11px] italic text-[var(--dim)]">
                {t("แหล่งข่าวอาจไม่พร้อมใช้งาน ไม่ได้แปลว่าไม่มีเหตุการณ์", "Sources may be unavailable; this does not mean no events occurred.")}
              </p>
            )}
          </div>
        ) : (
          items.map((item) => {
            const badge = sourceBadge(item);
            const href = item.url && /^https?:\/\//i.test(item.url) ? item.url : null;
            return (
              <article
                key={`${item.id}:${item.url ?? ""}`}
                className={`border-b border-l-2 ${sentimentBorder(item)} border-b-[var(--line)] px-3 py-2 transition-colors hover:bg-[var(--cool-dim)]`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center px-1.5 py-px text-[11px] font-bold uppercase tracking-[0.12em] ${badge.className}`}>
                    {badge.label}
                  </span>
                  {item.tone === "demo" && (
                    <span
                      title={t("ข้อความตัวอย่าง — หัวข้อและลิงก์เป็นสถานการณ์จำลอง ไม่ใช่ข่าวจริง จะแทนที่ด้วยข่าวจริงเมื่อแหล่งข้อมูลกลับมา", "Baseline placeholder — headline copy + URL are scenario, not live news. Swapped for real feeds once Overpass / GDELT return.")}
                      className="inline-flex items-center border border-[var(--sev-watch)] px-1.5 py-px text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--sev-watch)]"
                    >
                      {t("ตัวอย่าง", "DEMO")}
                    </span>
                  )}
                  <span className="font-mono text-[11px] tabular-nums text-[var(--dim)]">
                    {relative(item.publishedAt, lang)}
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
                  <span key={i} className="mt-1 mr-1 inline-block text-[11px] text-[var(--dim)]">
                    #{t.split(".")[0]}
                  </span>
                ))}
              </article>
            );
          })
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-[var(--line)] bg-[var(--bg)] px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
          {data
            ? t(`${data.items.length} รายการ • ${relative(data.generatedAt, lang)}${refreshFailed ? " · แคช" : ""}`, `${data.items.length} items • ${relative(data.generatedAt, lang)}${refreshFailed ? " · cached" : ""}`)
            : t("กำลังโหลด…", "loading…")}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">{t("รีเฟรชทุก 3 นาที", "3-min poll")}</span>
      </footer>
    </div>
  );
}
