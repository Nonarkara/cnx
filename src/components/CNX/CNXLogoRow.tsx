"use client";

/** Partner endorsements; the CNX product mark lives in the masthead. */
const PARTNER_HEIGHT = 28;

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

export default function CNXLogoRow({ size = PARTNER_HEIGHT }: { size?: number }) {
  return (
    <div className="hidden shrink-0 items-center gap-2.5 bg-white px-2.5 py-1.5 lg:flex min-[3000px]:gap-3 min-[3000px]:px-3 min-[3000px]:py-2">
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
  );
}
