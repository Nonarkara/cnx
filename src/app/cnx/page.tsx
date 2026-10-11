"use client";

// The CNX war-room page. The whole layout lives in CNXApp.tsx — this
// file exists so the route resolves cleanly and so the dynamic import
// of CNXMap (which depends on maplibre-gl) can SSR-skip.

import dynamic from "next/dynamic";
import { useLang } from "../../hooks/useLang";

function LoadingScreen() {
  const { t } = useLang();
  return (
    <div className="flex h-[100dvh] w-screen items-center justify-center bg-[var(--bg)] text-[var(--ink)]">
      <div className="text-center">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cool)]">
          {t("ห้องปฏิบัติการเชียงใหม่", "CNX War Room")}
        </div>
        <div className="mt-2 font-mono text-[11px] text-[var(--dim)]">{t("กำลังโหลดแผนที่…", "loading map engine…")}</div>
      </div>
    </div>
  );
}

const CnxApp = dynamic(() => import("../../components/CNX/CNXApp"), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

export default function CNXPage() {
  return <CnxApp />;
}
