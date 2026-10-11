"use client";

// Headers for the standalone /cnx/about and /cnx/data pages. Those pages
// are server components (they export metadata), so the language-dependent
// chrome lives here as client components. The same TH/EN switch as the
// war-room top bar is repeated so a direct link can change mode.

import { useLang } from "../../hooks/useLang";

const WORDMARK = "/logos/cnx-mark.png";

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "th" ? "en" : "th")}
      aria-label={lang === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
      title={lang === "th" ? "English" : "ภาษาไทย"}
      className="flex min-h-11 min-w-11 items-center justify-center border-l border-[var(--line)] px-2 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-raised)]"
    >
      {lang === "th" ? "EN" : "ไทย"}
    </button>
  );
}

function BookIcon() {
  return (
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
  );
}

const NAV_LINK =
  "flex items-center border-r border-[var(--line)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors";

export function AboutPageHeader() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const { t } = useLang();
  const rcad = t(
    "RCAD — สำนักงานเร่งรัดการวิจัยและนวัตกรรมเพื่อเพิ่มความสามารถการแข่งขันและการพัฒนาพื้นที่ (องค์การมหาชน)",
    "RCAD — Office for Accelerating Research and Innovation for Competitiveness and Area Development (Public Organization)",
  );
  const depa = t("depa — สำนักงานส่งเสริมเศรษฐกิจดิจิทัล", "depa — Digital Economy Promotion Agency");
  const province = t("จังหวัดเชียงใหม่", "Chiang Mai Province");
  const back = t("กลับไปแผนที่", "Back to the war room");
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--line)] bg-[var(--bg-surface)]">
      <div className="flex h-12 w-full items-stretch justify-between">
        <div className="flex items-stretch">
          {/* Logo plate: wordmark + partner logos (matches dashboard) */}
          <div className="flex shrink-0 items-center border-r border-[var(--line)] px-2.5 sm:px-3">
            <a title={t("หน้าแรกห้องปฏิบัติการเชียงใหม่", "Chiang Mai war room home")} className="flex items-center" href="/cnx">
              <div className="flex shrink-0 items-center gap-2.5 cnx-brand-plate px-2.5 py-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={WORDMARK} alt={province} title={province} style={{ height: 28, width: "auto" }} className="block object-contain" />
                <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-[var(--cool)]/35 lg:inline-block" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/rcad.svg" alt={rcad} title={rcad} style={{ height: 24, width: "auto" }} className="hidden object-contain lg:block" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/depa.jpg" alt={depa} title={depa} style={{ height: 24, width: "auto" }} className="hidden object-contain lg:block" />
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
            <span aria-hidden="true" className="absolute bottom-0 left-0 top-0 w-1 bg-[var(--cool)]" />
            <div className="flex min-w-0 flex-col justify-center leading-none">
              <a className="hover:opacity-90" href="/cnx">
                <h1 className="truncate text-[14px] font-bold text-[var(--ink)] lg:text-[15px]">
                  {t("ห้องปฏิบัติการเชียงใหม่", "Chiang Mai Operations")}
                </h1>
              </a>
              <span className="mt-0.5 truncate font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--dim)]">
                v{version}
              </span>
            </div>
          </div>

          {/* Primary nav */}
          <nav aria-label={t("เมนูหลัก", "Primary navigation")} className="hidden items-stretch border-l border-[var(--line)] md:flex">
            <a className={`${NAV_LINK} text-[var(--dim)] hover:bg-[var(--bg-raised)] hover:text-[var(--ink)]`} href="/cnx">
              {t("แผนที่", "Map")}
            </a>
            <a
              aria-current="page"
              className={`${NAV_LINK} border-b-2 border-b-[var(--cool)] bg-[var(--cool-dim)] text-[var(--cool)]`}
              href="/cnx/about"
            >
              {t("เกี่ยวกับ", "About")}
            </a>
          </nav>
        </div>

        <div className="flex items-stretch justify-end">
          <div className="flex items-stretch border-l border-[var(--line)]">
            <a
              href="/cnx"
              title={back}
              aria-label={back}
              className="inline-flex min-h-[44px] items-center gap-1 border border-[var(--line)] px-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--dim)] transition-colors hover:border-[var(--cool)] hover:text-[var(--cool)] sm:px-3"
            >
              <BookIcon />
              <span className="hidden sm:inline">{t("คู่มือ", "Manual")}</span>
            </a>
          </div>
          <LangToggle />
        </div>
      </div>
    </header>
  );
}

export function DataPageHeader() {
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg-surface)]">
      <div className="mx-auto flex h-12 max-w-[1100px] items-stretch justify-between pl-5">
        <a href="/cnx" className="flex items-center font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cool)] hover:underline">
          ← {t("ห้องปฏิบัติการเชียงใหม่", "Chiang Mai War Room")}
        </a>
        <div className="flex items-stretch">
          <span className="flex items-center px-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--dim)]">
            {t("คลังข้อมูล", "Data workbench")}
          </span>
          <LangToggle />
        </div>
      </div>
    </header>
  );
}
