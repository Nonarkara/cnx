// Shared building blocks for the About document (CNXAboutContent and
// CNXAboutStandards), so both files draw sections the same way.

import type { ReactNode } from "react";

export const KICKER = "font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--dim)]";
export const H2 = "mt-1 text-[22px] font-bold leading-tight tracking-[-0.01em]";
export const PROSE = "mt-3 max-w-[70ch] space-y-3 text-[15px] leading-[1.75]";
export const LINK = "text-[var(--cool)] underline decoration-[var(--line)] underline-offset-2 hover:decoration-[var(--cool)]";
export const NOTE = "max-w-[70ch] text-[13px] leading-[1.7] text-[var(--dim)]";

export function Section({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--line)] py-8">
      <div className={KICKER}>{kicker}</div>
      <h2 className={H2}>{title}</h2>
      {children}
    </section>
  );
}
