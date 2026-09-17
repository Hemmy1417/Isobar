"use client";

/**
 * The wallet's test-GEN balance with the faucet one click away, shown
 * wherever GEN is needed (stake, parlay, open a market, my positions) — not
 * only behind the header menu.
 */
import { useCallback, useEffect, useState } from "react";

import { formatGen } from "../../lib/config";
import { LOW_BALANCE_WEI, requestTestGen, TEST_GEN_WEI, walletBalance } from "../../lib/faucet";
import { useWallet } from "../../lib/wallet";

type Funding = "idle" | "busy" | "done" | "failed";

export function TestGen({ compact = false }: { compact?: boolean }) {
  const { address } = useWallet();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [funding, setFunding] = useState<Funding>("idle");

  const refresh = useCallback(async () => {
    if (!address) return null;
    try {
      const b = await walletBalance(address);
      setBalance(b);
      return b;
    } catch {
      return null;
    }
  }, [address]);

  useEffect(() => {
    setBalance(null);
    setFunding("idle");
    void refresh();
  }, [refresh]);

  if (!address) return null;

  async function fund() {
    setFunding("busy");
    const before = balance ?? 0n;
    try {
      await requestTestGen(address);
      // The faucet credits within seconds; show it as soon as it lands.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const now = await refresh();
        if (now !== null && now > before) break;
      }
      setFunding("done");
    } catch {
      setFunding("failed");
    }
  }

  const low = balance !== null && balance < LOW_BALANCE_WEI;
  const label = funding === "busy" ? "Sending test GEN…"
    : funding === "failed" ? "Faucet did not answer — try again"
    : `Get ${formatGen(TEST_GEN_WEI)} test GEN`;

  return (
    <div className={`testgen${low && !compact ? " testgen-low" : ""}`}>
      <span className="fine">
        {balance === null ? "Reading your wallet balance…" : `Wallet: ${formatGen(balance)} test GEN`}
        {low && !compact ? " — you need test GEN to take part." : ""}
        {funding === "done" && !low ? " Sent." : ""}
      </span>
      <button type="button" className={`btn ${low ? "btn-primary" : "btn-ghost"}`} style={{ paddingBlock: 5 }}
              disabled={funding === "busy"} onClick={() => void fund()}>
        {label}
      </button>
    </div>
  );
}
