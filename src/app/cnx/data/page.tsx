import type { Metadata } from "next";
import CNXDataLibrary from "../../../components/CNX/CNXDataLibrary";

export const metadata: Metadata = {
  title: "คลังข้อมูลเชียงใหม่ — Chiang Mai Data Workbench",
  description:
    "ชุดข้อมูลเปิดของจังหวัดเชียงใหม่จาก data.go.th ทุกชุด — ดาวน์โหลด อ่านเป็นตาราง ตรวจคอลัมน์ และค้นหาได้ในที่เดียว",
};

export default function CNXDataPage() {
  return (
    <main data-surface="cnx-dashboard" className="min-h-[100dvh] bg-[var(--bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg-surface)]">
        <div className="mx-auto flex h-12 max-w-[1100px] items-center justify-between px-5">
          <a href="/cnx" className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cool)] hover:underline">
            ← Chiang Mai War Room
          </a>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--dim)]">Data workbench</span>
        </div>
      </header>
      <CNXDataLibrary />
    </main>
  );
}
