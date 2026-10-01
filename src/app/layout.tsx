import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-sans-thai/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: `Chiang Mai Operations War Room · v${process.env.NEXT_PUBLIC_APP_VERSION ?? ""}${process.env.NEXT_PUBLIC_GIT_SHA ? ` · ${process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)}` : ""}`,
  description:
    "Live flights, weather, and operations data for Chiang Mai. Lanna blue + Doi Suthep gold.",
};

/**
 * Mobile viewport.
 *
 * Without this, iOS Safari and Chrome Android lay the page out at a
 * virtual 980px width and let the reader pinch-zoom. Verified on the
 * deployed site 2026-09-30: the served HTML carried no viewport meta at
 * all, so a governor opening this on a phone got the desktop board scaled
 * down to a strip of unreadable 9px type — then had to pinch and pan to
 * read a single number. Next 15 requires this as a `viewport` export
 * rather than a <meta> tag, so it cannot be fixed in index.html.
 *
 * `viewport-fit=cover` uses the notch area on iPhone; the safe-area
 * padding in globals.css keeps content out from under the status bar.
 * No user-scalable=no: locking zoom fails WCAG 1.4.4 and is hostile to
 * anyone who needs to magnify a reading.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
