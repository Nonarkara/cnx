"use client";

// CNX keystone story modal.
//
// Opens via the top-bar "story" button. Reads /api/cnx/story, renders
// the keystone headline + paragraphs + keystone bullets. Closes on
// ESC / backdrop click.

import { useEffect } from "react";
import { X } from "lucide-react";
import type { CnxStoryResponse } from "../../types/cnx";

interface Props {
  story: CnxStoryResponse | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function CnxStoryModal({ story, isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cnx-story-heading"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[88vh] w-full max-w-[820px] overflow-y-auto border border-[var(--line)] bg-[var(--bg-raised)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close story"
          className="absolute right-3 top-3 rounded-full border border-[var(--line)] p-1 text-[var(--dim)] hover:bg-[var(--sun-dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-3 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--cool)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--sun)]" />
          Keystone Narrative
        </div>
        <h2 id="cnx-story-heading" className="text-[22px] font-bold leading-tight text-[var(--ink)]">
          {story?.headline ?? "Loading…"}
        </h2>
        {story?.paragraphs?.map((p, i) => (
          <p key={i} className="mt-3 text-[13px] leading-relaxed text-[var(--ink)]">
            {p}
          </p>
        ))}
        {story?.bullets && story.bullets.length > 0 && (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
              Keystone actions
            </h3>
            <ul className="space-y-1.5">
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
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
              Office notices
            </h3>
            <div className="space-y-2">
              {story.officeNotices.map((n, i) => (
                <div
                  key={i}
                  className="border-l-2 border-l-[var(--danger)] bg-[var(--sun-dim)] px-3 py-2 text-[11px]"
                >
                  <div className="font-semibold text-[var(--ink)]">{n.title}</div>
                  <div className="text-[var(--dim)]">{n.detail}</div>
                  <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)]">
                    {n.source}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-3 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--dim)]">
          <span>{story ? new Date(story.generatedAt).toUTCString() : ""}</span>
          <span>Press ESC to close</span>
        </div>
      </div>
    </div>
  );
}