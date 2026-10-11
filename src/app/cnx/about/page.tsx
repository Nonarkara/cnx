import type { Metadata } from "next";
import CNXAboutContent from "../../../components/CNX/CNXAboutContent";
import { AboutPageHeader } from "../../../components/CNX/CNXPageChrome";

export const metadata: Metadata = {
  title: "ระบบทำงานอย่างไร — Chiang Mai War Room",
  description:
    "เอกสารอธิบายระบบห้องปฏิบัติการเชียงใหม่แบบภาษาคนธรรดา: ข้อมูลมาจากไหน ระบบคิดอย่างไร และกติกาความซื่อสัตย์ของข้อมูล",
  keywords: [
    "Chiang Mai War Room",
    "CNX Dashboard",
    "Lanna",
    "Doi Suthep",
    "RCAD",
    "depa",
    "Smart City Thailand",
    "Ping River",
    "burning season",
    "PM2.5",
    "RFD hotspots",
  ],
};

export default function CNXAboutPage() {
  return (
    <main data-surface="cnx-dashboard" className="min-h-[100dvh] bg-[var(--bg)] text-[var(--ink)]">
      {/* Header and content are client components: they follow the TH/EN mode. */}
      <AboutPageHeader />
      {/* Content — shared with CNXAboutModal so the pop-up and the standalone page never drift apart. */}
      <CNXAboutContent />
    </main>
  );
}
