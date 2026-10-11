"use client";

// CNX keystone story modal.
//
// Opens via the top-bar "story" button. Reads /api/cnx/story, renders
// the keystone headline + paragraphs + keystone bullets. Closes on
// ESC / backdrop click.

import { useModalDialog } from "../../hooks/useModalDialog";
import { X } from "lucide-react";
import { useLang } from "../../hooks/useLang";
import type { CnxStoryResponse } from "../../types/cnx";

interface Props {
  story: CnxStoryResponse | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function CnxStoryModal({ story, isOpen, onClose }: Props) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const { lang, t } = useLang();

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cnx-story-heading"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[88vh] w-full max-w-[820px] overflow-y-auto border border-[var(--line)] bg-[var(--bg-raised)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={t("ปิดเรื่องเล่า", "Close story")}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center border border-[var(--line)] text-[var(--dim)] hover:bg-[var(--cool-dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-3 flex items-center gap-2 pr-12 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--cool)]">
          <span className="h-1.5 w-1.5 bg-[var(--cool)]" />
          {t("เรื่องเล่าหลัก", "Keystone Narrative")}
        </div>
        {/* Story text is generated in English by lib/cnx/story.ts (no Thai
            rendering yet), so it is tagged lang="en" for screen readers. */}
        <h2 id="cnx-story-heading" lang={story ? "en" : undefined} className="text-[22px] font-bold leading-tight text-[var(--ink)]">
          {story?.headline ?? t("กำลังโหลด…", "Loading…")}
        </h2>
        {story?.paragraphs?.map((p, i) => (
          <p key={i} lang="en" className="mt-3 text-[13px] leading-relaxed text-[var(--ink)]">
            {p}
          </p>
        ))}
        {story?.bullets && story.bullets.length > 0 && (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
              {t("การปฏิบัติหลัก", "Keystone actions")}
            </h3>
            <ul lang="en" className="space-y-1.5">
              {story.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-[var(--ink)]">
                  <span className="font-mono text-[var(--cool)]">{String(i + 1).padStart(2, "0")}</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {story?.officeNotices && story.officeNotices.length > 0 && (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
              {t("ประกาศจากหน่วยงาน", "Office notices")}
            </h3>
            <div className="space-y-2">
              {story.officeNotices.map((n, i) => (
                <div
                  key={i}
                  className="border-l-2 border-l-[var(--danger)] bg-[var(--bg-surface)] px-3 py-2 text-[11px]"
                >
                  <div className="font-semibold text-[var(--ink)]">{n.title}</div>
                  <div className="text-[var(--dim)]">{n.detail}</div>
                  <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dim)]">
                    {n.source}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dim)]">
          <span>{story ? new Date(story.generatedAt).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }) : ""}</span>
          <span>{t("กด ESC เพื่อปิด", "Press ESC to close")}</span>
        </div>
      </div>
    </div>
  );
}