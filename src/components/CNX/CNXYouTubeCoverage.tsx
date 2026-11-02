"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "../../hooks/useLang";
import { fetchJsonOrNull } from "../../lib/client-requests";
import type { YoutubeResponse, YoutubeVideo } from "../../lib/cnx/youtube";

interface Props { active?: boolean; office?: boolean }
const DAY = 86_400_000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function Player({ queue, started, office, pageVisible }: { queue: YoutubeVideo[]; started: boolean; office: boolean; pageVisible: boolean }) {
  const { lang, t } = useLang();
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!box.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.25), { threshold: [0, 0.25] });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const first = queue[0];
  const params = new URLSearchParams({ autoplay: office ? "1" : "0", mute: "1", controls: "1", playsinline: "1", rel: "0" });
  if (office) {
    params.set("loop", "1");
    // A single embed requires its own ID in playlist to loop. Otherwise the
    // path supplies the first item, followed by each remaining queue item.
    params.set("playlist", (queue.length === 1 ? queue : queue.slice(1)).map(video => video.id).join(","));
  }
  const date = (stamp: string) => new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }).format(Date.parse(stamp));
  return <figure className="min-w-0">
    <div ref={box} className={started ? "relative aspect-video min-h-[200px] min-w-[200px] w-full" : undefined}>
      {started && pageVisible && visible && !failed ? <iframe
        title={t(`YouTube: ${first.title}`, `YouTube: ${first.title}`)}
        src={`https://www.youtube-nocookie.com/embed/${first.id}?${params}`}
        className="absolute inset-0 h-full min-h-[200px] w-full min-w-[200px] border-0"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin" onError={() => setFailed(true)}
      /> : started && <div role="status" className="flex h-full min-h-[200px] flex-col items-start justify-center bg-[var(--bg-raised)] p-3 text-[13px] text-[var(--ink)]">
        <p>{failed ? t("เปิดตัวเล่นไม่ได้ ใช้ลิงก์ YouTube ด้านล่าง", "Player unavailable. Use the YouTube link below.") : t("พักการเล่นเมื่อภาพอยู่นอกจอหรือหน้าต่างไม่แสดง", "Playback pauses while the player is out of view or the page is hidden.")}</p>
        {failed && <button type="button" className="min-h-11 text-[var(--cool)] underline" onClick={() => setFailed(false)}>{t("ลองเปิดตัวเล่นอีกครั้ง", "Retry player")}</button>}
      </div>}
    </div>
    <figcaption className={`break-words [overflow-wrap:anywhere] ${started ? "mt-2" : ""}`}>
      {office && <p className="text-[12px] text-[var(--dim)]">{t(`วนรายการ ${queue.length} วิดีโอ · เริ่มด้วย`, `Rotation of ${queue.length} videos · starts with`)}</p>}
      <a href={`https://www.youtube.com/watch?v=${first.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-center text-[14px] font-semibold leading-relaxed text-[var(--cool)] underline">{first.title} ↗</a>
      <p className="text-[12px] leading-relaxed text-[var(--dim)]">{first.channelTitle} · {t("เผยแพร่", "Published")} <time dateTime={first.publishedAt}>{date(first.publishedAt)}</time> · {first.viewCount.toLocaleString(lang === "en" ? "en-GB" : "th-TH")} {t("ยอดดูสะสม ณ วันเก็บข้อมูล", "cumulative views at capture")}</p>
    </figcaption>
  </figure>;
}

/** Recent sampled coverage, not live cameras, public opinion or worldwide rankings. */
export default function CnxYouTubeCoverage({ active = true, office = false }: Props) {
  const { lang, t } = useLang();
  const [feed, setFeed] = useState<YoutubeResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [started, setStarted] = useState(false);
  const [wide, setWide] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!active) { setStarted(false); return; }
    setPageVisible(document.visibilityState !== "hidden");
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true; setBusy(true);
      const next = await fetchJsonOrNull<YoutubeResponse>("/api/cnx/youtube", { signal: controller.signal });
      inFlight = false;
      if (controller.signal.aborted) return;
      if (next) setFeed(next);
      setFailed(!next); setBusy(false); setNow(Date.now());
    };
    const visibility = () => { setPageVisible(document.visibilityState !== "hidden"); setNow(Date.now()); if (document.visibilityState !== "hidden") void load(); };
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60_000);
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    document.addEventListener("visibilitychange", visibility);
    return () => { controller.abort(); window.clearInterval(timer); window.clearInterval(clock); document.removeEventListener("visibilitychange", visibility); };
  }, [active, attempt]);
  if (!active) return null;
  const captured = Date.parse(feed?.capturedAt ?? "");
  const age = Math.max(now, Date.now()) - captured;
  const state = !feed || feed.state === "unavailable" || !Number.isFinite(age) || age < -300_000 || age > 2 * DAY ? "unavailable" : failed || feed.state === "stale" || age > DAY ? "stale" : "current";
  const valid = state === "unavailable" ? [] : (feed?.videos ?? []).filter((video, index, all) => VIDEO_ID.test(video.id) && video.embeddable === true && Number.isSafeInteger(video.viewCount) && video.viewCount >= 0 && Number.isFinite(Date.parse(video.publishedAt)) && all.findIndex(other => other.id === video.id) === index);
  const eligible = valid.filter(video => video.madeForKids === false);
  const queueCount = wide && eligible.length > 1 ? 2 : 1;
  const queues = office ? Array.from({ length: queueCount }, (_, index) => eligible.filter((_, position) => position % queueCount === index)).filter(queue => queue.length) : eligible.slice(0, queueCount).map(video => [video]);
  const date = (stamp: string | null | undefined) => stamp && Number.isFinite(Date.parse(stamp)) ? new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(Date.parse(stamp)) : t("ไม่ทราบเวลา", "Time unknown");
  const coverage = feed?.queries.filter(query => query.status === "ok").length ?? 0;
  return <section aria-label={t("กระแสวิดีโอเกี่ยวกับเชียงใหม่", "Chiang Mai video coverage")} className="border-t border-[var(--line)] py-4 text-[var(--ink)] print:hidden">
    <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-[18px] font-semibold">{t("เชียงใหม่บน YouTube", "Chiang Mai on YouTube")}</h2>
      <span role="status" className="text-[12px] font-semibold">{busy && !feed ? t("กำลังอ่าน…", "Loading…") : state === "unavailable" ? t("ไม่มีข้อมูล", "Unavailable") : state === "stale" ? t("ข้อมูลเก่า · ลองใหม่", "Stale · retry") : t("ภาพรวมรายวัน", "Daily snapshot")}</span>
    </header>
    <p className="mt-1 max-w-[65ch] text-[13px] leading-relaxed text-[var(--dim)]">{t("วิดีโอเผยแพร่ 30 วันล่าสุดที่มียอดดูสะสมสูงในคำค้นที่ติดตาม ไม่ใช่อันดับโลกหรือเหตุการณ์ที่ยืนยันแล้ว", "Popular among monitored searches · published in the last 30 days · cumulative views, not global rankings or verified incidents.")}</p>
    {feed?.capturedAt && <p className="mt-1 text-[12px] text-[var(--dim)]">{t("เก็บข้อมูล", "Captured")} <time dateTime={feed.capturedAt}>{date(feed.capturedAt)} (UTC+7)</time> · {coverage}/{feed.queries.length} {t("คำค้นตอบกลับ", "searches answered")}</p>}
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {queues.length > 0 && <button type="button" className="min-h-11 border border-[var(--line)] px-3 text-[13px] font-semibold" onClick={() => setStarted(value => !value)}>{started ? t("หยุดตัวเล่น", "Stop players") : office ? t("เริ่มจอวิดีโอแบบปิดเสียง", "Start muted office screen") : t("โหลดตัวเล่น YouTube แบบปิดเสียง", "Load muted YouTube players")}</button>}
      <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)} className="min-h-11 px-2 text-[13px] text-[var(--cool)] underline disabled:cursor-wait">{t("ตรวจรายการอีกครั้ง", "Refresh catalogue")}</button>
    </div>
    {queues.length > 0 ? <>
      <p className="mt-1 max-w-[65ch] text-[12px] leading-relaxed text-[var(--dim)]">{t("การโหลดเชื่อมต่อและส่งข้อมูลเครือข่ายให้ YouTube โดยคงปุ่มควบคุมไว้", "Loading connects to YouTube and shares network information. Controls remain available.")}</p>
      <div className={`mt-3 grid items-start gap-4 ${queues.length > 1 ? "md:grid-cols-2" : "max-w-[40rem]"}`}>{queues.map(queue => <Player key={queue.map(video => video.id).join(",")} queue={queue} started={started} office={office} pageVisible={pageVisible} />)}</div>
    </> : <p className="mt-2 max-w-[65ch] text-[13px] leading-relaxed text-[var(--dim)]">{state === "unavailable" ? t("ไม่มีภาพรวมล่าสุดที่ยืนยันได้ ลองใหม่ได้ ไม่ตีความว่าไม่มีวิดีโอหรือไม่มีประเด็นในเชียงใหม่", "No usable recent snapshot. Retry; this does not mean there are no videos or issues in Chiang Mai.") : t("ไม่มีรายการที่ยืนยันการฝังและข้อกำหนดผู้ชมได้ในรอบนี้", "No videos with confirmed embedding and audience settings in this snapshot.")}</p>}
    <details className="mt-2">
      <summary className="min-h-11 w-fit cursor-pointer py-2.5 text-[13px] font-semibold text-[var(--cool)]">{t("วิธีคัดเลือกและแหล่งข้อมูล", "Selection and sources")}</summary>
      <div className="max-w-[65ch] space-y-2 text-[13px] leading-relaxed text-[var(--dim)]">
        <p>{t("รายการหลายภาษาเรียงตามยอดดูสะสม ณ วันเก็บข้อมูล ไม่ใช่ยอดดูที่เพิ่มใน 30 วัน อันดับทั่วโลก ความเห็นประชาชน กล้องสด หรือรายงานเหตุการณ์ที่ยืนยันแล้ว ภาษาคำค้นไม่ยืนยันภาษาที่พูดหรือสัญชาติ", "A multilingual sample ordered by cumulative views at capture. Not views gained in 30 days, global rankings, public opinion, live cameras or verified reporting. Search languages do not establish spoken language or nationality.")}</p>
        <p>{t("ช่วงเผยแพร่", "Publication window")}: {date(feed?.windowStart)}–{date(feed?.windowEnd)} (UTC+7) · YouTube Data API v3</p>
        {feed && <p>{feed.queries.map(query => `${query.query} (${query.language}): ${query.status === "ok" ? query.resultCount : t("อ่านไม่ได้", "failed")}`).join(" · ")}</p>}
        {feed && (coverage < feed.queries.length || feed.detailsFailed > 0) && <p>{t("ข้อมูลไม่ครบ บางคำค้นหรือชุดรายละเอียดวิดีโออ่านไม่ได้", "Partial retrieval: some searches or video-detail batches failed.")}</p>}
        <p>{t("ไม่ฝังวิดีโอสำหรับเด็กหรือรายการที่ไม่ทราบการตั้งค่าผู้ชม การเล่นอาจถูกจำกัดตามภูมิภาคหรือเบราว์เซอร์ ใช้ลิงก์ต้นทางได้หากตัวเล่นไม่พร้อม", "Videos for children or with unknown audience settings are not embedded. Playback may be restricted by region or browser; use the source link if unavailable.")}</p>
        {office && <p>{t("ขอเล่นอัตโนมัติแบบปิดเสียงและวนรายการเมื่อเห็นตัวเล่นเท่านั้น แต่ละจอใช้คนละรายการ เบราว์เซอร์อาจต้องให้กดเล่นอีกครั้ง", "Muted autoplay and looping are requested only while each player is visible. Screens use separate queues; the browser may require another Play action.")}</p>}
      </div>
    </details>
  </section>;
}
