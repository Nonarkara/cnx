"use client";

// CNX top bar — the chrome strip at the top of every page.
//
// Same design language as the wordmark and the page heading: Lanna blue
// accent bar on the left of the heading, flag-blue chrome, Doi Suthep
// gold for the live indicator.

import CNXLogoRow from "./CNXLogoRow";

export default function CNXTopBar() {
  return (
    <header className="flex items-stretch border-b border-[var(--line)] bg-[var(--bg-surface)]">
      <div className="flex shrink-0 items-center border-r border-[var(--line)] px-2.5">
        <CNXLogoRow />
      </div>

      {/* Page heading — Lanna blue accent bar + title + tracked subtitle */}
      <div className="relative flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 pr-2 sm:pl-3.5 sm:pr-3 md:min-w-[180px] lg:flex-none min-[1024px]:max-w-[260px]">
        <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-[#1d2951]" />
        <div className="flex min-w-0 flex-col justify-center leading-none">
          <h1 className="truncate font-bold text-[var(--ink)] text-[14px] lg:text-[16px]" lang="th">
            ห้องปฏิบัติการเชียงใหม่
          </h1>
          <span className="mt-1 truncate font-bold uppercase tracking-[0.18em] text-[var(--dim)] text-[8px]">
            Chiang Mai Operations War Room
          </span>
        </div>
      </div>
    </header>
  );
}
