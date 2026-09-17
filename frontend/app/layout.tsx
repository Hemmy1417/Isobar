import type { Metadata } from "next";
import { Bricolage_Grotesque, Martian_Mono, Public_Sans } from "next/font/google";

import "./globals.css";
import { Shell } from "./components/Shell";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--bricolage",
});
const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--public-sans",
});
const martian = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--martian",
});

export const metadata: Metadata = {
  title: "Isobar",
  description:
    "Weather-threshold markets, adjudicated: stake GEN on falsifiable daily weather questions at strategic logistics locations. Every validator fetches two independent agencies itself; deterministic code derives the verdict; one appeal re-reads the agreed record before settlement is final.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${publicSans.variable} ${martian.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
