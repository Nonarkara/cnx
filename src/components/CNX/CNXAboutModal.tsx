"use client";

// CNX "Research" pop-up — the same content as the standalone
// /cnx/about page, opened in-place instead of a new tab/window.
// Content lives in CNXAboutContent so the pop-up and the standalone
// page (kept for direct links/sharing) never drift apart.

import { useEffect } from "react";
import { X } from "lucide-react";
import CNXAboutContent from "./CNXAboutContent";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CnxAboutModal({ isOpen, onClose }: Props) {
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
      aria-label="Research — how the system works"
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative my-6 max-h-[88vh] w-full max-w-[920px] overflow-y-auto border border-[var(--line)] bg-[var(--bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close research"
          className="fixed right-6 top-6 z-10 rounded-full border border-[var(--line)] bg-[var(--bg-raised)] p-1.5 text-[var(--dim)] shadow hover:bg-[var(--sun-dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
        <CNXAboutContent />
      </div>
    </div>
  );
}
