"use client";

// CNX Public Camera Panel — public flood and road cameras in the Chiang
// Mai operating area, via the Maholan flood CCTV wall.
//
// Answers one question: "which public cameras near the flood crossings
// are actually answering right now, and who runs them?"
//
// This panel shows CATALOGUE METADATA ONLY — position, owning agency,
// stream type, and the aggregator's liveness flag. It deliberately does
// not embed, proxy or relay video. Two reasons, both load-bearing:
//
//   1. The wall is volunteer infrastructure whose own source comments
//      record it fighting ~300 Mbps of origin uplink. A second consumer
//      pulling HLS adds load for no gain — we need the map, not frames.
//   2. The streams belong to the agencies that run them. Linking to a
//      camera is a citation; re-serving its picture is a different act.
//
// The liveness flag is the aggregator's, passed through unchanged and
// never inferred here. Offline cameras are SHOWN, not hidden, and each
// says in its tooltip that it cannot confirm the road — a dead camera
// that looks like a live one sends someone down a flooded street.

import { useEffect, useState } from "react";
import { Video, VideoOff, Scale } from "lucide-react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { DataAge } from "./CNXDataAge";
import type { FloodCamerasResponse, FloodCamera } from "../../lib/cnx/flood-cameras";
import { useLang } from "../../hooks/useLang";

function CameraRow({ c }: { c: FloodCamera }) {
  const { t } = useLang();
  const kind = c.type === "hls" ? t("วิดีโอต่อเนื่อง", "continuous video") : c.type === "snapshot" ? t("ภาพนิ่ง", "still snapshot") : c.type;
  return (
    <li className="flex items-start gap-2 border-b border-[var(--line)] py-1.5 last:border-b-0">
      <span className="mt-0.5 shrink-0">
        {c.live ? (
          <Video className="h-3 w-3 text-[var(--cool)]" />
        ) : (
          <VideoOff className="h-3 w-3 text-[var(--dim)]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-semibold text-[var(--ink)]">{c.name}</div>
        <div className="font-mono text-[11px] text-[var(--dim)]">
          {c.source}
          {c.region ? ` · ${c.region}` : ""} · {kind}
        </div>
        {!c.live && (
          <div className="mt-0.5 text-[11px] italic text-[var(--sev-watch)]">
            {t("ไม่ตอบสนอง — ยืนยันสภาพถนนจากกล้องนี้ไม่ได้", "Offline — cannot confirm this road")}
          </div>
        )}
      </div>
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
        {c.live ? t("ออนไลน์", "live") : t("ออฟไลน์", "offline")}
      </span>
    </li>
  );
}

export default function CnxFloodCamerasPanel() {
  const { t } = useLang();
  const [data, setData] = useState<FloodCamerasResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchJsonOrNull<FloodCamerasResponse>("/api/cnx/flood-cameras");
      if (!cancelled && next) setData(next);
    };
    void load();
    // 15 min matches the upstream TTL. Polling faster would ask the same
    // question of a volunteer server and learn nothing new.
    const i = window.setInterval(() => void load(), 15 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, []);

  const live = data?.liveCount ?? 0;
  const total = data?.cameras.length ?? 0;

  return (
    <div className="flex h-full flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
          <Video className="h-3.5 w-3.5 text-[var(--cool)]" />
          {t("กล้องสาธารณะ", "Public cameras")}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-[var(--dim)]">
            {data ? `${live}/${total} ${t("ออนไลน์", "live")}` : t("กำลังโหลด…", "loading…")}
          </span>
          {/* Ages the CATALOGUE, not the poll. The response is fresh on
              every fetch while the liveness flags underneath can be 15
              minutes old, and those flags are what a detour decision
              would rely on. */}
          <DataAge
            observedAt={data?.cataloguedAt}
            source={t("บัญชีกล้อง", "catalogue")}
            staleAfterMs={20 * 60_000}
            missing={t("ไม่มีบัญชีกล้อง", "no catalogue")}
          />
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {data && (
          <p lang="en" className="mb-2 text-[11px] leading-[1.5] text-[var(--dim)]">{data.note}</p>
        )}
        {data && data.cameras.length > 0 ? (
          <ul>
            {data.cameras.map((c) => (
              <CameraRow key={c.id} c={c} />
            ))}
          </ul>
        ) : data ? (
          <p className="text-[11px] italic text-[var(--dim)]">{t("ไม่มีกล้องในรายการ", "No cameras listed.")}</p>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse bg-[var(--line)]/30" />
            ))}
          </div>
        )}
      </div>

      {/* Credit and terms are rendered VERBATIM from the module, not
          retyped here. The module owns the attribution because attribution
          is a data contract: a camera with no owning agency is dropped
          upstream rather than shown unattributed, and the same list of
          agencies has to appear here, in About, and in the sources doc
          without the three copies drifting apart. */}
      {data && (
        <footer className="shrink-0 space-y-1.5 border-t border-[var(--line)] bg-[var(--bg)] px-3 py-2">
          <div className="font-mono text-[11px] leading-[1.5] text-[var(--dim)]">
            {t("กล้องผ่าน", "Cameras via")}{" "}
            <a href={data.credit.aggregatorUrl} target="_blank" rel="noreferrer" className="underline">
              {data.credit.aggregator}
            </a>
            . {t("ดำเนินการโดย", "Operated by")} {data.credit.agencies.length > 0 ? data.credit.agencies.join(", ") : "—"}. {t("วิดีโออยู่กับหน่วยงานต้นทาง แผงนี้ไม่ได้ทำสำเนา", "Video stays with the source agency; this panel does not mirror it.")}
          </div>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)] hover:text-[var(--ink)]">
              <Scale className="h-2.5 w-2.5" />
              {t("วัตถุประสงค์และเงื่อนไขการใช้", "Intended use & terms")}
            </summary>
            <div lang="en" className="mt-1 space-y-1 font-mono text-[11px] leading-[1.6] text-[var(--dim)]">
              <p>{data.legal.intendedUse}</p>
              <p>{data.legal.terms}</p>
            </div>
          </details>
        </footer>
      )}
    </div>
  );
}
