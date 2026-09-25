"use client";

// CNX "Data" pop-up — the Data Workbench opened in place, same shell as
// the Research pop-up. The standalone /cnx/data page renders the same
// component for direct links.

import { useEffect } from "react";
import { X } from "lucide-react";
import CNXDataLibrary from "./CNXDataLibrary";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CnxDataLibraryModal({ isOpen, onClose }: Props) {
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
      aria-label="Data workbench — Chiang Mai open data"
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative my-6 max-h-[90vh] w-full max-w-[1100px] overflow-y-auto border border-[var(--line)] bg-[var(--bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close data workbench"
          className="fixed right-6 top-6 z-10 rounded-full border border-[var(--line)] bg-[var(--bg-raised)] p-1.5 text-[var(--dim)] shadow hover:bg-[var(--sun-dim)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
        <CNXDataLibrary />
      </div>
    </div>
  );
}
