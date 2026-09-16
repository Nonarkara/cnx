"use client";

/**
 * CNX logo row.
 *
 * The wordmark is the province's own mark; partner logos (CAAT, AOT,
 * Chiang Mai University, etc.) are endorsements. The row reads as one
 * design: a single white plate carries every mark, the wordmark's
 * accent bar in Lanna blue is the unifying colour, and a thin
 * vertical rule in the same blue splits the province's mark from
 * its partners.
 *
 * The Lopburi row uses the same shape — this code is not copy-pasted
 * because the partner list and the wordmark colour are CNX-specific.
 */

const WORDMARK = "/logos/cnx-wordmark.svg";
const PROVINCE_HEIGHT = 28;

interface PartnerLogo {
  src: string;
  alt: string;
}

const PARTNER_LOGOS: PartnerLogo[] = [
  { src: "/logos/rcad.svg", alt: "RCAD" },
  { src: "/logos/depa.jpg", alt: "depa — Digital Economy Promotion Agency" },
  { src: "/logos/smart-city-thailand.jpg", alt: "Smart City Thailand Office" },
  { src: "/logos/axiom-retl.svg", alt: "Axiom · ReTL" },
];

export default function CNXLogoRow({ size = PROVINCE_HEIGHT }: { size?: number }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 bg-white px-2.5 py-1.5 min-[3000px]:gap-3 min-[3000px]:px-3 min-[3000px]:py-2">
      {/* Province mark — primary */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={WORDMARK}
        alt="เชียงใหม่ · Chiang Mai"
        title="เชียงใหม่ · Chiang Mai"
        style={{ height: size, width: "auto" }}
        className="block object-contain"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      <span
        aria-hidden="true"
        className="hidden h-6 w-px shrink-0 bg-[#1d2951]/35 lg:inline-block"
      />
      {/* Partner logos — RCAD, depa, Smart City Thailand Office, Axiom + ReTL. */}
      <div className="hidden items-center gap-2.5 lg:flex">
        {PARTNER_LOGOS.map((logo) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={logo.src}
            src={logo.src}
            alt={logo.alt}
            title={logo.alt}
            style={{ height: size * 0.6, width: "auto" }}
            className="block object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ))}
      </div>
    </div>
  );
}
