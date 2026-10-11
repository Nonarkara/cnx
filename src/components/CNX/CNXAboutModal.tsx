"use client";

// CNX "Research" pop-up — the same content as the standalone
// /cnx/about page, opened in-place instead of a new tab/window.
// Content lives in CNXAboutContent so the pop-up and the standalone
// page (kept for direct links/sharing) never drift apart.

import { useModalDialog } from "../../hooks/useModalDialog";
import { useLang } from "../../hooks/useLang";
import { X } from "lucide-react";
import CNXAboutContent from "./CNXAboutContent";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CnxAboutModal({ isOpen, onClose }: Props) {
  const dialogRef = useModalDialog(isOpen, onClose);
  const { t } = useLang();

  if (!isOpen) return null;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t("งานวิจัย — ระบบทำงานอย่างไร", "Research — how the system works")}
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative my-6 max-h-[88vh] w-full max-w-[920px] overflow-y-auto border border-[var(--line)] bg-[var(--bg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={t("ปิดหน้างานวิจัย", "Close research")}
          className="fixed right-6 top-6 z-10 flex h-11 w-11 items-center justify-center border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--dim)] hover:bg-[var(--cool-dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
        <CNXAboutContent />
      </div>
    </div>
  );
}
