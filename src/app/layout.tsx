import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-sans-thai/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chiang Mai Operations War Room",
  description:
    "Live flights, weather, and operations data for Chiang Mai. Lanna blue + Doi Suthep gold.",
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
