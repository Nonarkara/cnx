import type { Metadata } from "next";
import CNXAboutContent from "../../../components/CNX/CNXAboutContent";

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

const WORDMARK = "/logos/cnx-wordmark.svg";

export default function CNXAboutPage() {
  return (
    <main
      data-surface="cnx-dashboard"
      className="min-h-[100dvh] bg-[var(--bg)] text-[var(--ink)]"
    >
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 w-full border-b border-[var(--line)] bg-[var(--bg-surface)] backdrop-blur-md">
        <div className="flex h-12 w-full items-stretch justify-between">
          <div className="flex items-stretch">
            {/* Logo plate: wordmark + partner logos (matches dashboard) */}
            <div className="flex shrink-0 items-center border-r border-[var(--line)] px-2.5 sm:px-3">
              <a
                title="หน้าแรกห้องปฏิบัติการเชียงใหม่"
                className="flex items-center"
                href="/cnx"
              >
                <div className="flex shrink-0 items-center gap-2.5 bg-white px-2.5 py-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={WORDMARK}
                    alt="จังหวัดเชียงใหม่ · Chiang Mai"
                    title="จังหวัดเชียงใหม่ · Chiang Mai"
                    style={{ height: 28, width: "auto" }}
                    className="block object-contain"
                  />
                  <span
                    aria-hidden="true"
                    className="hidden h-6 w-px shrink-0 bg-[#1d2951]/35 lg:inline-block"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/rcad.svg"
                    alt="RCAD — Royal College of Architectural Designers"
                    title="RCAD — Royal College of Architectural Designers"
                    style={{ height: 24, width: "auto" }}
                    className="hidden object-contain lg:block"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/depa.jpg"
                    alt="depa — สำนักงานส่งเสริมเศรษฐกิจดิจิทัล"
                    title="depa — สำนักงานส่งเสริมเศรษฐกิจดิจิทัล"
                    style={{ height: 24, width: "auto" }}
                    className="hidden object-contain lg:block"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logos/smart-city-thailand.jpg"
                    alt="Smart City Thailand"
                    title="Smart City Thailand"
                    style={{ height: 24, width: "auto" }}
                    className="hidden object-contain lg:block"
                  />
                </div>
              </a>
            </div>

            {/* Province identity */}
            <div className="relative flex min-w-0 items-center gap-2 py-1 pl-3 pr-3 md:min-w-[190px]">
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 top-0 w-1 bg-[#1d2951]"
              />
              <div className="flex min-w-0 flex-col justify-center leading-none">
                <a className="hover:opacity-90" href="/cnx">
                  <h1
                    className="truncate text-[14px] font-bold text-[var(--ink)] lg:text-[15px]"
                    lang="th"
                  >
                    ห้องปฏิบัติการเชียงใหม่
                  </h1>
                </a>
                <span className="mt-0.5 truncate text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
                  Chiang Mai Operations
                </span>
              </div>
            </div>

            {/* Primary nav */}
            <nav
              aria-label="เมนูหลัก · Primary Navigation"
              className="hidden items-stretch border-l border-[var(--line)] md:flex"
            >
              <a
                className="flex items-center border-r border-[var(--line)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors text-[var(--dim)] hover:bg-[var(--bg-raised)] hover:text-[var(--ink)]"
                href="/cnx"
              >
                <span lang="th">แผนที่</span>
                <span className="ml-1 hidden text-[9px] font-normal opacity-60 xl:inline">
                  Map
                </span>
              </a>
              <a
                aria-current="page"
                className="flex items-center border-r border-[var(--line)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors border-b-2 border-b-[var(--cool)] bg-[var(--cool-dim)] text-[var(--cool)]"
                href="/cnx/about"
              >
                <span lang="th">เกี่ยวกับ</span>
                <span className="ml-1 hidden text-[9px] font-normal opacity-60 xl:inline">
                  About
                </span>
              </a>
            </nav>
          </div>

          <div className="flex items-stretch justify-end">
            <div className="flex items-stretch border-l border-[var(--line)]">
              <a
                href="/cnx"
                title="กลับไปแผนที่ · Back to the war room"
                aria-label="กลับไปแผนที่ · Back to the war room"
                className="inline-flex min-h-[44px] items-center gap-1 border border-[var(--line)] px-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--dim)] transition-colors hover:border-[var(--cool)] hover:text-[var(--cool)] sm:px-3"
                lang="th"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 7v14" />
                  <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
                </svg>
                <span className="hidden sm:inline">คู่มือ</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Content — shared with CNXAboutModal so the pop-up and the standalone page never drift apart. */}
      <CNXAboutContent />
    </main>
  );
}