"use client";

// The CNX war-room page. The whole layout lives in CNXApp.tsx — this
// file exists so the route resolves cleanly and so the dynamic import
// of CNXMap (which depends on maplibre-gl) can SSR-skip.

import dynamic from "next/dynamic";

const CnxApp = dynamic(() => import("../../components/CNX/CNXApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] w-screen items-center justify-center bg-[var(--bg)] text-[var(--ink)]">
      <div className="text-center">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cool)]">
          CNX War Room
        </div>
        <div className="mt-2 font-mono text-[10px] text-[var(--dim)]">loading map engine…</div>
      </div>
    </div>
  ),
});

export default function CNXPage() {
  return <CnxApp />;
}