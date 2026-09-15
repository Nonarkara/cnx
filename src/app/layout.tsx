import type { Metadata } from "next";
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
