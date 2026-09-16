"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { WalletProvider } from "../../lib/wallet";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/map", label: "The map" },
  { href: "/parlay", label: "Parlay" },
  { href: "/me", label: "My positions" },
  { href: "/how", label: "How it works" },
];

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r="9.5" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
      <path d="M3.5 8.2c3-2.2 12-2.2 15 0M2.6 12c3.4-2.5 13.4-2.5 16.8 0M4.6 15.6c2.6-1.9 10.2-1.9 12.8 0"
            fill="none" stroke="var(--data)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <WalletProvider>
      <header className="shell-head">
        <div className="wrap">
          <Link href="/" className="brand"><Mark />Isobar</Link>
          <nav className="nav">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? "here" : ""}>
                {n.label}
              </Link>
            ))}
          </nav>
          <WalletButton />
        </div>
      </header>
      <main className="wrap section">{children}</main>
      <footer className="wrap" style={{ paddingBlock: "26px 40px", borderTop: "1px solid var(--line-soft)" }}>
        <p className="fine">
          Isobar runs on GenLayer Studio Next with test GEN. Verdicts come from consensus over
          two independent public weather agencies; parlay multipliers are demo pricing, labeled
          as such. Nothing here is financial advice or a real-money instrument.
        </p>
      </footer>
    </WalletProvider>
  );
}
