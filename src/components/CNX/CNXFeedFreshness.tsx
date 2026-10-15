"use client";

// Per-feed freshness strip for the top bar: "ฟีดตรงเวลา 14/17".
//
// Reads /api/cnx/manifest.json every two minutes and re-ages it every
// 30 s on the client, so the count keeps moving between fetches. Three
// states and only three: green within the feed's own staleAfterSec, amber
// past it, grey when there is no observation. Grey is never green — a feed
// that has not been heard from is not on time.
//
// Relay health: the newest payload the off-Cloudflare relay wrote. Older
// than 45 min and the strip says the relay is offline, and since when,
// which turns the single-machine dependency into a visible state.

import { useEffect, useState } from "react";
import { useLang } from "../../hooks/useLang";
import type { Lang } from "../../lib/i18n";
import { RELAY_OFFLINE_AFTER_SEC, ageSeconds, sloCounts, sloState, type SloState, type TwinManifest } from "../../lib/cnx/twin-manifest";

const MANIFEST_URL = "/api/cnx/manifest.json";
const POLL_MS = 2 * 60_000;
const TICK_MS = 30_000;

/** Compact duration for "age / limit": 12 min, 3 h, 2 d. */
export function formatDuration(sec: number, lang: Lang): string {
  const s = Math.max(0, sec);
  const min = Math.round(s / 60);
  if (min < 1) return lang === "th" ? "<1 นาที" : "<1 min";
  if (min < 120) return lang === "th" ? `${min} นาที` : `${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 48) return lang === "th" ? `${hr} ชม.` : `${hr} h`;
  const day = Math.round(hr / 24);
  return lang === "th" ? `${day} วัน` : `${day} d`;
}

function formatSince(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SWATCH: Record<Exclude<SloState, "no-slo">, string> = {
  within: "sev-fill-good",
  stale: "sev-fill-watch",
  missing: "sev-fill-unknown",
};
const ORDER: Record<SloState, number> = { stale: 0, missing: 1, within: 2, "no-slo": 3 };

export function FeedFreshnessStrip({ manifest, now }: { manifest: TwinManifest | null; now: number }) {
  const { lang, t } = useLang();

  if (!manifest) {
    return (
      <div className="flex min-h-11 items-center gap-2 border border-[var(--line)] px-3 text-[12px] font-semibold text-[var(--dim)]">
        <span aria-hidden="true" className="sev-fill-unknown inline-block h-2.5 w-2.5" />
        <span className="lg:hidden">{t("ฟีด —", "Feeds —")}</span><span className="hidden lg:inline">{t("ฟีดตรงเวลา — ยังไม่ทราบ", "Feeds on time — unknown")}</span>
      </div>
    );
  }

  const rows = manifest.entities
    .map((e) => ({ e, state: sloState(e.staleAfterSec, e.lastObservedAt, now), age: ageSeconds(e.lastObservedAt, now) }))
    .filter((r) => r.state !== "no-slo")
    .sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const { onTime, total } = sloCounts(manifest.entities, now);
  const allOnTime = total > 0 && onTime === total;

  const relayAge = ageSeconds(manifest.relay.newestAt, now);
  const relayOffline = relayAge === null || relayAge > RELAY_OFFLINE_AFTER_SEC;
  const relayLine = !manifest.relay.newestAt
    ? t("เครื่องรีเลย์ออฟไลน์ — ไม่พบข้อมูลที่รีเลย์ส่งมา", "Relay offline — no relay payload found")
    : relayOffline
    ? t(`เครื่องรีเลย์ออฟไลน์ตั้งแต่ ${formatSince(manifest.relay.newestAt, lang)}`, `Relay offline since ${formatSince(manifest.relay.newestAt, lang)}`)
    : t(`เครื่องรีเลย์ส่งข้อมูลล่าสุด ${formatDuration(relayAge ?? 0, lang)}ก่อน`, `Relay last pushed ${formatDuration(relayAge ?? 0, lang)} ago`);

  const stateWord: Record<Exclude<SloState, "no-slo">, string> = {
    within: t("ตรงเวลา", "on time"),
    stale: t("ล่าช้า", "stale"),
    missing: t("ไม่มีค่าสังเกต", "no observation"),
  };

  return (
    <details className="sm:relative" data-testid="feed-freshness">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 border border-[var(--line)] px-3 text-[12px] font-semibold text-[var(--ink)]">
        <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 ${allOnTime ? "sev-fill-good" : onTime === 0 ? "sev-fill-unknown" : "sev-fill-watch"}`} />
        <span className="tabular-nums"><span className="lg:hidden">{t(`ฟีด ${onTime}/${total}`, `Feeds ${onTime}/${total}`)}</span><span className="hidden lg:inline">{t(`ฟีดตรงเวลา ${onTime}/${total}`, `Feeds on time ${onTime}/${total}`)}</span></span>
        {relayOffline && <span className="sev-fill-watch px-1.5 py-0.5 text-[11px]" title={t("รีเลย์ออฟไลน์", "Relay offline")}><span aria-hidden="true" className="lg:hidden">!</span><span className="sr-only lg:not-sr-only">{t("รีเลย์ออฟไลน์", "Relay offline")}</span></span>}
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="absolute inset-x-3 top-full z-50 mt-2 sm:inset-x-auto sm:right-0 sm:w-[min(26rem,92vw)] border border-[var(--ink)] bg-[var(--bg-raised)] p-3 text-[12px] leading-relaxed">
        <p className={`mb-2 px-2 py-1 font-semibold ${relayOffline ? "sev-fill-watch" : "border border-[var(--line)]"}`}>{relayLine}</p>
        <p className="mb-2 text-[11px] text-[var(--dim)]">
          {t("อายุข้อมูลล่าสุด / เกณฑ์ล่าช้าของแต่ละฟีด · สีเทา = ไม่มีค่าสังเกต ไม่ใช่ตรงเวลา", "Newest data age / each feed's stale limit · grey = no observation, never on time")}
        </p>
        <ul className="max-h-[60vh] divide-y divide-[var(--line)] overflow-y-auto">
          {rows.map(({ e, state, age }) => {
            const s = state as Exclude<SloState, "no-slo">;
            return (
              <li key={e.id} data-state={s} className="flex items-center gap-2 py-1.5">
                <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 ${SWATCH[s]}`} />
                <span className="min-w-0 flex-1 truncate" title={t(e.name_th, e.name_en)}>{t(e.name_th, e.name_en)}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums">
                  {age === null ? stateWord.missing : `${formatDuration(age, lang)} / ${formatDuration(e.staleAfterSec ?? 0, lang)}`}
                </span>
                <span className="w-[9ch] shrink-0 text-right text-[11px] text-[var(--dim)]">{stateWord[s]}</span>
              </li>
            );
          })}
        </ul>
        <a href={MANIFEST_URL} target="_blank" rel="noreferrer" className="mt-2 flex min-h-11 items-center text-[var(--cool)] underline">
          {t("รายการฟีดฉบับเครื่องอ่าน (JSON)", "Machine-readable feed manifest (JSON)")} ↗
        </a>
      </div>
    </details>
  );
}

/** Top-bar wrapper: polls the manifest every 2 min, re-ages every 30 s. */
export default function CnxFeedFreshness() {
  const [manifest, setManifest] = useState<TwinManifest | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(MANIFEST_URL, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as TwinManifest;
        if (alive && Array.isArray(body.entities)) setManifest(body);
      } catch {
        // Keep the last manifest; it re-ages on the clock, so it goes amber rather than lying.
      }
    };
    void load();
    const poll = window.setInterval(load, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  return <FeedFreshnessStrip manifest={manifest} now={now} />;
}
