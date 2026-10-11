import type { Metadata } from "next";
import CNXDataLibrary from "../../../components/CNX/CNXDataLibrary";
import { DataPageHeader } from "../../../components/CNX/CNXPageChrome";

export const metadata: Metadata = {
  title: "คลังข้อมูลเชียงใหม่ — Chiang Mai Data Workbench",
  description:
    "ชุดข้อมูลเปิดของจังหวัดเชียงใหม่จาก data.go.th ทุกชุด — ดาวน์โหลด อ่านเป็นตาราง ตรวจคอลัมน์ และค้นหาได้ในที่เดียว",
};

export default function CNXDataPage() {
  return (
    <main data-surface="cnx-dashboard" className="min-h-[100dvh] bg-[var(--bg)] text-[var(--ink)]">
      {/* Header is a client component: it follows the TH/EN mode. */}
      <DataPageHeader />
      <CNXDataLibrary />
    </main>
  );
}
